import io
import logging
import math
import os
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from pydantic import BaseModel

from auth import auth_router, get_current_user

logger = logging.getLogger("portfolio")

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "investments.db")

# DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_investments.db")
# DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "investments.db")


def ensure_schema():
    """Create all tables if they don't exist yet (safe to run on every startup)."""
    conn = sqlite3.connect(DB_PATH)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS User1_MF (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            Fund_House    TEXT,
            Fund_Name     TEXT,
            Folio_Number  TEXT,
            AMFI_CODE     INTEGER,
            Units         REAL,
            Purchase_NAV  REAL,
            Purchase_Date TEXT,
            Current_NAV   REAL,
            NAV_Date      TEXT,
            Value_at_cost REAL,
            Value_now     REAL
        );
        CREATE TABLE IF NOT EXISTS User2_MF (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            Fund_House    TEXT,
            Fund_Name     TEXT,
            Folio_Number  TEXT,
            AMFI_CODE     INTEGER,
            Units         REAL,
            Purchase_NAV  REAL,
            Purchase_Date TEXT,
            Current_NAV   REAL,
            NAV_Date      TEXT,
            Value_at_cost REAL,
            Value_now     REAL
        );
        CREATE TABLE IF NOT EXISTS User1_Stocks (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            Ticker        TEXT,
            Instrument    TEXT,
            Qty           REAL,
            Purchase_cost REAL,
            LTP           REAL,
            Value_now     REAL,
            Value_at_cost REAL
        );
        CREATE TABLE IF NOT EXISTS User2_Stocks (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            Ticker        TEXT,
            Instrument    TEXT,
            Qty           REAL,
            Purchase_cost REAL,
            LTP           REAL,
            Value_now     REAL,
            Value_at_cost REAL
        );
        CREATE TABLE IF NOT EXISTS MF_Summary (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            AMFI_CODE  INTEGER,
            Fund_Name  TEXT,
            Fund_House TEXT,
            Category   TEXT
        );
        CREATE TABLE IF NOT EXISTS networth_history (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            year           INTEGER NOT NULL,
            month          INTEGER,
            total_invested REAL,
            total_value    REAL,
            mf_invested    REAL,
            mf_value       REAL,
            stock_invested REAL,
            stock_value    REAL,
            recorded_date  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(year, month)
        );
        CREATE TABLE IF NOT EXISTS users (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            username        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
            email           TEXT    NOT NULL UNIQUE COLLATE NOCASE,
            hashed_password TEXT    NOT NULL,
            is_admin        INTEGER NOT NULL DEFAULT 0,
            is_approved     INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
        );
    """)
    conn.commit()
    conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_schema()
    logger.info("DB schema initialised at %s", DB_PATH)
    yield


app = FastAPI(title="Portfolio API", lifespan=lifespan)

ALLOWED_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:8080").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(auth_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ── Global auth dependency on all non-auth routes ─────────────────────────────
# Public routes: /api/auth/* only (handled by auth_router without this dep).
# All other routes require a valid JWT access token.
app.router.dependencies.append(Depends(get_current_user))


# ── OpenAPI / Swagger UI — register HTTPBearer so the Authorize button appears ─
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(title=app.title, version="1.0.0", routes=app.routes)
    schema.setdefault("components", {})["securitySchemes"] = {
        "HTTPBearer": {"type": "http", "scheme": "bearer"}
    }
    schema["security"] = [{"HTTPBearer": []}]
    app.openapi_schema = schema
    return schema

app.openapi = custom_openapi


async def verify_api_key(current_user: dict = Depends(get_current_user)):
    """Auth guard — requires valid JWT. Replaces old API-key check."""
    return current_user



def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def clean(val):
    """Replace NaN/Inf with None for JSON serialisation."""
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    return val


def rows_to_list(rows):
    return [{k: clean(v) for k, v in dict(r).items()} for r in rows]


# ── SUMMARY ──────────────────────────────────────────────────────────────────

@app.get("/api/summary")
def summary():
    conn = get_conn()
    try:
        r_mf  = conn.execute("SELECT SUM(Value_at_cost) ac, SUM(Value_now) vn FROM User1_MF").fetchone()
        s_mf  = conn.execute("SELECT SUM(Value_at_cost) ac, SUM(Value_now) vn FROM User2_MF").fetchone()
        r_sto = conn.execute("SELECT SUM(Value_at_cost) ac, SUM(Value_now) vn FROM User1_Stocks").fetchone()
        s_sto = conn.execute("SELECT SUM(Value_at_cost) ac, SUM(Value_now) vn FROM User2_Stocks").fetchone()

        mf_invested  = (r_mf["ac"] or 0) + (s_mf["ac"] or 0)
        mf_now       = (r_mf["vn"] or 0) + (s_mf["vn"] or 0)
        sto_invested = (r_sto["ac"] or 0) + (s_sto["ac"] or 0)
        sto_now      = (r_sto["vn"] or 0) + (s_sto["vn"] or 0)

        total_invested = mf_invested + sto_invested
        total_now      = mf_now + sto_now

        def pct(n, d):
            return round((n / d) * 100, 2) if d else 0

        return {
            "mf_invested":    round(mf_invested, 2),
            "mf_now":         round(mf_now, 2),
            "mf_returns":     round(mf_now - mf_invested, 2),
            "mf_pct":         pct(mf_now - mf_invested, mf_invested),
            "sto_invested":   round(sto_invested, 2),
            "sto_now":        round(sto_now, 2),
            "sto_returns":    round(sto_now - sto_invested, 2),
            "sto_pct":        pct(sto_now - sto_invested, sto_invested),
            "total_invested": round(total_invested, 2),
            "total_now":      round(total_now, 2),
            "total_returns":  round(total_now - total_invested, 2),
            "total_pct":      pct(total_now - total_invested, total_invested),
            "appreciation_x": round(total_now / total_invested, 2) if total_invested else 0,
        }
    finally:
        conn.close()


# ── STOCKS ───────────────────────────────────────────────────────────────────

def _stock_table(owner: str) -> str:
    if owner.lower() == "user1":
        return "User1_Stocks"
    if owner.lower() == "user2":
        return "User2_Stocks"
    raise HTTPException(400, "owner must be 'user1' or 'user2'")


def _enrich_stocks(rows):
    data = rows_to_list(rows)
    for r in data:
        vc = r["Value_at_cost"] or 0
        vn = r["Value_now"]     or 0
        r["Returns"]     = round(vn - vc, 2)
        r["Returns_pct"] = round(((vn - vc) / vc) * 100, 2) if vc else 0
    return data


@app.get("/api/stocks")
def stocks():
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT Ticker, Qty, Purchase_cost, LTP, Value_now, Value_at_cost
            FROM User1_Stocks
            UNION ALL
            SELECT Ticker, Qty, Purchase_cost, LTP, Value_now, Value_at_cost
            FROM User2_Stocks
        """).fetchall()
        return _enrich_stocks(rows)
    finally:
        conn.close()


@app.get("/api/stocks/{owner}")
def stocks_by_owner(owner: str):
    table = _stock_table(owner)
    conn = get_conn()
    try:
        rows = conn.execute(
            f"SELECT Ticker, Qty, Purchase_cost, LTP, Value_now, Value_at_cost FROM {table}"
        ).fetchall()
        return _enrich_stocks(rows)
    finally:
        conn.close()


# ── MUTUAL FUNDS ─────────────────────────────────────────────────────────────

@app.get("/api/mutual-funds")
def mutual_funds():
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT f.Fund_Name, f.Units,
                   f.Purchase_NAV, f.Current_NAV,
                   f.Value_at_cost, f.Value_now,
                   f.AMFI_CODE, f.Purchase_Date,
                   COALESCE(s.Category, 'Other') Category
            FROM (
                SELECT * FROM User1_MF
                UNION ALL
                SELECT * FROM User2_MF
            ) f
            LEFT JOIN MF_Summary s ON f.AMFI_CODE = s.AMFI_CODE
        """).fetchall()
        data = rows_to_list(rows)
        for r in data:
            vc = r["Value_at_cost"] or 0
            vn = r["Value_now"]     or 0
            r["Returns"]     = round(vn - vc, 2)
            r["Returns_pct"] = round(((vn - vc) / vc) * 100, 2) if vc else 0
            r["Category"]    = r["Category"] or "Other"
        return data
    finally:
        conn.close()


@app.get("/api/mutual-funds/categories")
def mf_categories():
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT COALESCE(s.Category,'Other') Category,
                   SUM(f.Value_at_cost) Value_at_cost,
                   SUM(f.Value_now) Value_now
            FROM (SELECT * FROM User1_MF UNION ALL SELECT * FROM User2_MF) f
            LEFT JOIN MF_Summary s ON f.AMFI_CODE = s.AMFI_CODE
            WHERE f.Fund_Name IS NOT NULL AND TRIM(f.Fund_Name) != ''
            GROUP BY Category
            HAVING SUM(f.Value_at_cost) > 0 OR SUM(f.Value_now) > 0
        """).fetchall()
        data = rows_to_list(rows)
        for r in data:
            vc = r["Value_at_cost"] or 0
            vn = r["Value_now"]     or 0
            r["Returns"]     = round(vn - vc, 2)
            r["Returns_pct"] = round(((vn - vc) / vc) * 100, 2) if vc else 0
        return data
    finally:
        conn.close()


@app.get("/api/mutual-funds/{owner}")
def mf_by_owner(owner: str):
    table = _mf_table(owner)
    conn = get_conn()
    try:
        rows = conn.execute(f"""
            SELECT r.Fund_Name, r.Units, r.Purchase_NAV, r.Current_NAV,
                   r.Value_at_cost, r.Value_now, r.AMFI_CODE,
                   r.Purchase_Date, s.Category
            FROM {table} r
            LEFT JOIN MF_Summary s ON r.AMFI_CODE = s.AMFI_CODE
        """).fetchall()
        data = rows_to_list(rows)
        for r in data:
            vc = r["Value_at_cost"] or 0
            vn = r["Value_now"]     or 0
            r["Returns"]     = round(vn - vc, 2)
            r["Returns_pct"] = round(((vn - vc) / vc) * 100, 2) if vc else 0
            r["Category"]    = r["Category"] or "Other"
        return data
    finally:
        conn.close()


# ── ANALYTICS ────────────────────────────────────────────────────────────────

@app.get("/api/analytics/timeline")
def analytics_timeline():
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT strftime('%Y', Purchase_Date) year,
                   SUM(Value_at_cost) invested,
                   SUM(Value_now) value_now
            FROM (
                SELECT Purchase_Date, Value_at_cost, Value_now FROM User1_MF WHERE Purchase_Date IS NOT NULL
                UNION ALL
                SELECT Purchase_Date, Value_at_cost, Value_now FROM User2_MF WHERE Purchase_Date IS NOT NULL
            )
            GROUP BY year ORDER BY year
        """).fetchall()
        data = rows_to_list(rows)
        for r in data:
            r["gains"] = round((r["value_now"] or 0) - (r["invested"] or 0), 2)
        return data
    finally:
        conn.close()


@app.get("/api/analytics/monthly")
def analytics_monthly():
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT strftime('%Y-%m', Purchase_Date) month,
                   SUM(Value_at_cost) amount
            FROM (
                SELECT Purchase_Date, Value_at_cost FROM User1_MF WHERE Purchase_Date IS NOT NULL
                UNION ALL
                SELECT Purchase_Date, Value_at_cost FROM User2_MF WHERE Purchase_Date IS NOT NULL
            )
            GROUP BY month ORDER BY month
        """).fetchall()
        return rows_to_list(rows)
    finally:
        conn.close()


@app.get("/api/analytics/snapshots")
def analytics_snapshots():
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT year, month, total_invested, total_value,
                   mf_invested, mf_value, stock_invested, stock_value, recorded_date
            FROM networth_history ORDER BY year, month
        """).fetchall()
        data = rows_to_list(rows)
        for r in data:
            r["label"] = f"{r['year']}-{str(r['month']).zfill(2)}"
        return data
    finally:
        conn.close()


@app.post("/api/analytics/snapshots", dependencies=[Depends(verify_api_key)])
def save_snapshot():
    conn = get_conn()
    try:
        # Gather current portfolio totals
        r_mf  = conn.execute("SELECT SUM(Value_at_cost) ac, SUM(Value_now) vn FROM User1_MF").fetchone()
        s_mf  = conn.execute("SELECT SUM(Value_at_cost) ac, SUM(Value_now) vn FROM User2_MF").fetchone()
        r_sto = conn.execute("SELECT SUM(Value_at_cost) ac, SUM(Value_now) vn FROM User1_Stocks").fetchone()
        s_sto = conn.execute("SELECT SUM(Value_at_cost) ac, SUM(Value_now) vn FROM User2_Stocks").fetchone()

        mf_inv = (r_mf["ac"] or 0) + (s_mf["ac"] or 0)
        mf_val = (r_mf["vn"] or 0) + (s_mf["vn"] or 0)
        st_inv = (r_sto["ac"] or 0) + (s_sto["ac"] or 0)
        st_val = (r_sto["vn"] or 0) + (s_sto["vn"] or 0)

        now = datetime.now()
        conn.execute("""
            INSERT INTO networth_history (year, month, total_invested, total_value,
                                         mf_invested, mf_value, stock_invested, stock_value)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(year, month) DO UPDATE SET
                total_invested=excluded.total_invested, total_value=excluded.total_value,
                mf_invested=excluded.mf_invested, mf_value=excluded.mf_value,
                stock_invested=excluded.stock_invested, stock_value=excluded.stock_value,
                recorded_date=CURRENT_TIMESTAMP
        """, (now.year, now.month, mf_inv + st_inv, mf_val + st_val,
              mf_inv, mf_val, st_inv, st_val))
        conn.commit()
        return {"status": "ok", "message": f"Snapshot saved for {now.year}-{now.month:02d}"}
    finally:
        conn.close()


# ── MARKET DATA ──────────────────────────────────────────────────────────────

@app.get("/api/market/ticker")
def market_ticker():
    try:
        import yfinance as yf
        tickers = {
            "NIFTY 50":   "^NSEI",
            "SENSEX":     "^BSESN",
            "NIFTY BANK": "^NSEBANK",
            "USD/INR":    "USDINR=X",
            "Gold":       "GC=F",
            "Crude Oil":  "CL=F",
        }
        result = []
        for label, sym in tickers.items():
            try:
                t = yf.Ticker(sym)
                info = t.fast_info
                last = info.last_price
                prev = info.previous_close
                chg  = round(((last - prev) / prev) * 100, 2) if prev else 0
                result.append({"label": label, "value": round(last, 2), "change": chg})
            except Exception as exc:
                logger.debug("Ticker %s unavailable: %s", sym, exc)
        return result
    except Exception as exc:
        logger.warning("market_ticker failed: %s", exc)
        return []


@app.get("/api/market/nifty-history")
def nifty_history():
    try:
        import yfinance as yf
        nifty = yf.Ticker("^NSEI")
        hist = nifty.history(period="30d", interval="1d")
        hist.index = hist.index.tz_localize(None)
        hist = hist[hist.index.dayofweek < 5].tail(14)
        return [
            {"date": d.strftime("%d %b"), "close": round(float(v), 2)}
            for d, v in zip(hist.index, hist["Close"], strict=False)
        ]
    except Exception as exc:
        logger.warning("nifty_history failed: %s", exc)
        return []


# ── REFRESH ──────────────────────────────────────────────────────────────────

@app.post("/api/refresh/nav", dependencies=[Depends(verify_api_key)])
def refresh_nav():
    try:
        from mftool import Mftool
        conn = get_conn()
        mft = Mftool()
        updated = []
        rows = conn.execute(
            "SELECT DISTINCT AMFI_CODE FROM User1_MF "
            "UNION SELECT DISTINCT AMFI_CODE FROM User2_MF"
        ).fetchall()
        for row in rows:
            code = row[0]
            try:
                data = mft.get_scheme_quote(int(code))
                if not data or "nav" not in data:
                    continue
                nav = float(data["nav"])
                nav_date = datetime.strptime(data["last_updated"], "%d-%b-%Y").isoformat()
                for tbl in ("User1_MF", "User2_MF"):
                    conn.execute(f"""
                        UPDATE {tbl} SET Current_NAV=?, NAV_Date=?,
                        Value_now=ROUND(Units * ?, 4)
                        WHERE AMFI_CODE=?
                    """, (nav, nav_date, nav, code))
                conn.commit()
                updated.append(code)
            except Exception as e:
                logger.warning("Failed to update NAV for code %s: %s", code, e)
        conn.close()
        return {"status": "ok", "updated": updated}
    except Exception as e:
        raise HTTPException(500, str(e)) from e


# ── AMFI LOOKUP ──────────────────────────────────────────────────────────────

@app.get("/api/amfi-lookup/{code}")
def amfi_lookup(code: int):
    try:
        from mftool import Mftool
        mft = Mftool()
        data = mft.get_scheme_quote(code)
        if not data or "nav" not in data:
            raise HTTPException(404, f"Scheme {code} not found")
        scheme_name = data.get("scheme_name", "")
        return {
            "AMFI_CODE": code,
            "Fund_Name": scheme_name,
            "Fund_House": scheme_name.split(" ")[0] if scheme_name else "",
            "Current_NAV": float(data["nav"]),
            "NAV_Date": data.get("last_updated", ""),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.post("/api/refresh/stocks", dependencies=[Depends(verify_api_key)])
def refresh_stocks():
    try:
        import yfinance as yf
        conn = get_conn()
        updated = []
        for tbl in ("User1_Stocks", "User2_Stocks"):
            rows = conn.execute(f"SELECT Ticker, Qty FROM {tbl}").fetchall()
            for row in rows:
                ticker = row["Ticker"].strip()
                qty    = row["Qty"]
                try:
                    data = yf.Ticker(ticker + ".NS").history(period="1d")
                    if data.empty:
                        continue
                    ltp      = float(data["Close"].iloc[-1])
                    value_now = round(qty * ltp, 4)
                    conn.execute(f"UPDATE {tbl} SET LTP=?, Value_now=? WHERE Ticker=?",
                                 (ltp, value_now, row["Ticker"]))
                    conn.commit()
                    if ticker not in updated:
                        updated.append(ticker)
                except Exception as e:
                    logger.warning("Failed to update stock %s in %s: %s", ticker, tbl, e)
        conn.close()
        return {"status": "ok", "updated": updated}
    except Exception as e:
        raise HTTPException(500, str(e)) from e


# ── ADMIN: MUTUAL FUND CRUD ──────────────────────────────────────────────────

class MFEntry(BaseModel):
    owner: str  # "user1" or "user2"
    Fund_House: str = ""
    Fund_Name: str
    Folio_Number: str = ""
    AMFI_CODE: float | None = None
    Units: float = 0
    Purchase_NAV: str = ""
    Purchase_Date: str = ""
    Current_NAV: float = 0
    Value_at_cost: float = 0
    Value_now: float = 0


def _mf_table(owner: str) -> str:
    if owner.lower() == "user1":
        return "User1_MF"
    if owner.lower() == "user2":
        return "User2_MF"
    raise HTTPException(400, "owner must be 'user1' or 'user2'")


@app.get("/api/admin/mf/{owner}")
def admin_list_mf(owner: str):
    table = _mf_table(owner)
    conn = get_conn()
    try:
        rows = conn.execute(
            f"SELECT rowid, * FROM {table} WHERE Fund_Name IS NOT NULL AND TRIM(Fund_Name) != '' ORDER BY Fund_Name"
        ).fetchall()
        return rows_to_list(rows)
    finally:
        conn.close()


@app.post("/api/admin/mf", dependencies=[Depends(verify_api_key)])
def admin_create_mf(entry: MFEntry):
    table = _mf_table(entry.owner)
    conn = get_conn()
    try:
        cur = conn.execute(f"""
            INSERT INTO {table} (Fund_House, Fund_Name, Folio_Number, AMFI_CODE,
                                 Units, Purchase_NAV, Purchase_Date, Current_NAV,
                                 Value_at_cost, Value_now)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (entry.Fund_House, entry.Fund_Name, entry.Folio_Number, entry.AMFI_CODE,
              entry.Units, entry.Purchase_NAV, entry.Purchase_Date, entry.Current_NAV,
              entry.Value_at_cost, entry.Value_now))
        conn.commit()
        return {"status": "ok", "rowid": cur.lastrowid}
    finally:
        conn.close()


@app.put("/api/admin/mf/{owner}/{rowid}", dependencies=[Depends(verify_api_key)])
def admin_update_mf(owner: str, rowid: int, entry: MFEntry):
    table = _mf_table(owner)
    conn = get_conn()
    try:
        conn.execute(f"""
            UPDATE {table}
            SET Fund_House=?, Fund_Name=?, Folio_Number=?, AMFI_CODE=?,
                Units=?, Purchase_NAV=?, Purchase_Date=?, Current_NAV=?,
                Value_at_cost=?, Value_now=?
            WHERE rowid=?
        """, (entry.Fund_House, entry.Fund_Name, entry.Folio_Number, entry.AMFI_CODE,
              entry.Units, entry.Purchase_NAV, entry.Purchase_Date, entry.Current_NAV,
              entry.Value_at_cost, entry.Value_now, rowid))
        conn.commit()
        if conn.total_changes == 0:
            raise HTTPException(404, "Row not found")
        return {"status": "ok"}
    finally:
        conn.close()


@app.delete("/api/admin/mf/{owner}/{rowid}", dependencies=[Depends(verify_api_key)])
def admin_delete_mf(owner: str, rowid: int):
    table = _mf_table(owner)
    conn = get_conn()
    try:
        conn.execute(f"DELETE FROM {table} WHERE rowid=?", (rowid,))
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


# ── ADMIN: STOCKS UPLOAD ─────────────────────────────────────────────────────

@app.post("/api/admin/upload-stocks/{owner}", dependencies=[Depends(verify_api_key)])
def upload_stocks(owner: str, file: UploadFile = File(...)):
    table = _stock_table(owner)

    if not file.filename:
        raise HTTPException(400, "No file provided")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ("csv", "xlsx", "xls"):
        raise HTTPException(400, "Only .csv, .xlsx, or .xls files are accepted")

    try:
        import pandas as pd
        content = file.file.read()

        if ext == "csv":
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))

        # Normalize column names — strip whitespace
        df.columns = df.columns.str.strip()

        # Map broker column names to our DB schema
        COLUMN_MAP = {
            "Instrument":     "Instrument_Name",
            "Avg. Cost":      "Purchase_cost",
            "Avg.Cost":       "Purchase_cost",
            "Avg Cost":       "Purchase_cost",
            "Avg. cost":      "Purchase_cost",
            "Current Value":  "Value_now",
            "Cur. val":       "Value_now",
            "Invested":       "Value_at_cost",
            "Qty.":           "Qty",
        }
        df.rename(columns={k: v for k, v in COLUMN_MAP.items() if k in df.columns}, inplace=True)

        # Handle Ticker: broker may use "Instrument" as the ticker column
        if "Ticker" not in df.columns and "Instrument_Name" in df.columns:
            df["Ticker"] = df["Instrument_Name"]

        # Handle Instrument (readable name): copy from Instrument_Name or Ticker
        if "Instrument_Name" in df.columns:
            df["Instrument"] = df["Instrument_Name"]
        elif "Instrument" not in df.columns:
            df["Instrument"] = df.get("Ticker", "")

        # Drop unnamed/junk columns
        df = df.loc[:, ~df.columns.str.startswith("Unnamed")]

        required = {"Ticker", "Qty", "Purchase_cost"}
        if not required.issubset(set(df.columns)):
            raise HTTPException(
                400,
                f"Missing required columns. Need: {required}. Got: {list(df.columns)}"
            )

        df = df.dropna(subset=["Ticker"]).reset_index(drop=True)

        # Strip any whitespace from ticker values
        df["Ticker"] = df["Ticker"].astype(str).str.strip()

        # Compute Value_at_cost from core columns
        df["Value_at_cost"] = df["Qty"] * df["Purchase_cost"]

        # Use LTP / Value_now from file if available; derive whichever is missing
        if "LTP" not in df.columns and "Value_now" in df.columns:
            df["LTP"] = df.apply(lambda r: round(r["Value_now"] / r["Qty"], 2) if r["Qty"] else 0, axis=1)
        elif "LTP" in df.columns and "Value_now" not in df.columns:
            df["Value_now"] = df["Qty"] * df["LTP"]
        elif "LTP" in df.columns and "Value_now" in df.columns:
            pass  # both present, use as-is
        else:
            df["LTP"] = 0
            df["Value_now"] = 0

        # Coerce to numeric, fill NaN with 0
        df["LTP"] = pd.to_numeric(df["LTP"], errors="coerce").fillna(0)
        df["Value_now"] = pd.to_numeric(df["Value_now"], errors="coerce").fillna(0)

        # Instrument (readable name) — keep if available, else use Ticker
        if "Instrument" not in df.columns:
            df["Instrument"] = df["Ticker"]

        final = df[["Ticker", "Instrument", "Qty", "Purchase_cost", "LTP", "Value_now", "Value_at_cost"]]

        conn = get_conn()
        try:
            conn.execute(f"DROP TABLE IF EXISTS {table}")
            conn.execute(f"""
                CREATE TABLE {table} (
                    Ticker TEXT, Instrument TEXT, Qty REAL,
                    Purchase_cost REAL, LTP REAL, Value_now REAL, Value_at_cost REAL
                )
            """)
            conn.executemany(
                f"INSERT INTO {table} (Ticker, Instrument, Qty, Purchase_cost, LTP, Value_now, Value_at_cost) VALUES (?,?,?,?,?,?,?)",
                final.values.tolist(),
            )
            conn.commit()
        finally:
            conn.close()

        return {"status": "ok", "rows": len(final), "message": f"Replaced {table} with {len(final)} rows"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to process file: {e}") from e


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
