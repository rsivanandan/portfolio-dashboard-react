import asyncio
import io
import logging
import math
import os
import sqlite3
import threading
import time
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from pydantic import BaseModel

from auth import auth_router, get_current_user, require_admin
from pf_import import parse_passbook_pdf

logger = logging.getLogger("portfolio")

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "investments.db")
DUMMY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dummy_investments.db")
MODE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "db_mode.txt")


def active_db():
    """Return the DB the app should serve right now.

    A file-based switch (db_mode.txt) is used so that all uvicorn workers agree
    on the active DB without a restart.  Falls back to the live DB whenever the
    dummy file is missing or the mode is unknown.
    """
    try:
        if os.path.exists(MODE_FILE):
            with open(MODE_FILE, encoding="utf-8") as fh:
                mode = fh.read().strip()
            if mode == "dummy" and os.path.exists(DUMMY_PATH):
                return DUMMY_PATH
    except OSError:
        pass
    return DB_PATH


def ensure_schema():
    """Create all tables if they don't exist yet (safe to run on every startup).

    Runs against BOTH the live and (if present) dummy DBs — new tables like
    Retirement_Config previously landed only in whichever DB was active, so
    demo mode 500'd on the new endpoints and pages silently showed cached
    LIVE data instead of demo data.
    """
    for db_path in (DB_PATH, DUMMY_PATH):
        if db_path == DUMMY_PATH and not os.path.exists(db_path):
            continue
        _ensure_schema_for(db_path)


def _ensure_schema_for(db_path: str):
    conn = sqlite3.connect(db_path)
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
        CREATE TABLE IF NOT EXISTS User1_PF (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            account          TEXT DEFAULT '',
            employee_contrib REAL DEFAULT 0,
            employer_contrib REAL DEFAULT 0,
            interest         REAL DEFAULT 0,
            entry_date       TEXT,
            notes            TEXT
        );
        CREATE TABLE IF NOT EXISTS User2_PF (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            account          TEXT DEFAULT '',
            employee_contrib REAL DEFAULT 0,
            employer_contrib REAL DEFAULT 0,
            interest         REAL DEFAULT 0,
            entry_date       TEXT,
            notes            TEXT
        );
        CREATE TABLE IF NOT EXISTS PF_Config (
            user            TEXT PRIMARY KEY,
            UAN             TEXT DEFAULT '',
            initial_balance REAL DEFAULT 0,
            initial_month   TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS PF_Accounts (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user            TEXT NOT NULL,
            account         TEXT NOT NULL,
            establishment   TEXT DEFAULT '',
            opening_balance REAL DEFAULT 0,
            opening_month   TEXT DEFAULT '',
            UAN             TEXT DEFAULT '',
            UNIQUE(user, account)
        );
        CREATE TABLE IF NOT EXISTS user_names (
            id    INTEGER PRIMARY KEY AUTOINCREMENT,
            owner TEXT NOT NULL UNIQUE,
            name  TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS Bucket_Assignments (
            id     INTEGER PRIMARY KEY AUTOINCREMENT,
            entity TEXT NOT NULL,
            key    TEXT NOT NULL,
            owner  TEXT NOT NULL DEFAULT '',
            bucket TEXT NOT NULL,
            UNIQUE(entity, key, owner)
        );
        CREATE TABLE IF NOT EXISTS Retirement_Config (
            id           INTEGER PRIMARY KEY CHECK (id = 1),
            target_now   REAL NOT NULL DEFAULT 40,
            target_soon  REAL NOT NULL DEFAULT 35,
            target_later REAL NOT NULL DEFAULT 25
        );
    """)
    # Add Previous_NAV column to existing tables (ignored if already present)
    for tbl in ("User1_MF", "User2_MF"):
        try:
            conn.execute(f"ALTER TABLE {tbl} ADD COLUMN Previous_NAV REAL")
        except sqlite3.OperationalError:
            pass
    # Add PF columns to networth_history (ignored if already present)
    for col in ("pf_invested", "pf_value"):
        try:
            conn.execute(f"ALTER TABLE networth_history ADD COLUMN {col} REAL")
        except sqlite3.OperationalError:
            pass
    # Add account column to PF tables (ignored if already present)
    for tbl in ("User1_PF", "User2_PF"):
        try:
            conn.execute(f"ALTER TABLE {tbl} ADD COLUMN account TEXT DEFAULT ''")
        except sqlite3.OperationalError:
            pass
    # Add bucket-strategy columns to Retirement_Config (ignored if already present)
    for col, default in (
        ("monthly_expenses", 0),
        ("bucket1_years", 3),
        ("bucket2_years", 4),
        ("cash_amount", 0),
        ("swr_pct", 3.5),
        ("inflation_pct", 6),
        ("refill_trigger_years", 2),
    ):
        try:
            conn.execute(f"ALTER TABLE Retirement_Config ADD COLUMN {col} REAL NOT NULL DEFAULT {default}")
        except sqlite3.OperationalError:
            pass
    conn.execute("INSERT OR IGNORE INTO Retirement_Config (id) VALUES (1)")
    conn.commit()
    conn.close()


def get_live_conn():
    """Connection to the LIVE DB regardless of the demo-mode toggle.

    Market-data refreshes must never write real NAVs/LTPs into the scaled
    dummy DB (garbage demo returns) nor skip the live DB's daily refresh.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


_nifty_12m_cache: dict = {"ts": 0.0, "pct": None}


def _nifty_12m_return():
    """Trailing 12-month NIFTY return (%), cached for an hour.

    Market gate for the bucket refill strategy: positive → harvest from
    Growth; negative → draw from Safety and leave equity alone.
    Returns None when the fetch fails (UI shows 'unavailable').
    """
    now = time.time()
    if now - _nifty_12m_cache["ts"] < 3600:
        return _nifty_12m_cache["pct"]
    pct = None
    try:
        import yfinance as yf
        hist = yf.Ticker("^NSEI").history(period="1y", interval="1d", timeout=10)
        if len(hist) > 1:
            first = float(hist["Close"].iloc[0])
            last = float(hist["Close"].iloc[-1])
            if first > 0:
                pct = round((last / first - 1) * 100, 2)
    except Exception as exc:
        logger.warning("nifty 12m fetch failed: %s", exc)
    _nifty_12m_cache["ts"] = now
    _nifty_12m_cache["pct"] = pct
    return pct


_navall_cache: dict = {"ts": 0.0, "data": {}}


def _navall_lookup(code: int):
    """Fallback NAV source: parse AMFI's NAVAll.txt taking NAV and date from
    the END of the line. Some scheme names contain ';' (e.g. 'Edelweiss NIFTY
    Large Midcap 250 Index Fund;Direct Plan;Growth'), which shifts
    position-based parsers like mftool — the trailing two fields are reliable.
    Returns (nav_str, date_str) or None."""
    import urllib.request
    now = time.time()
    if now - _navall_cache["ts"] > 3600 or not _navall_cache["data"]:
        txt = urllib.request.urlopen(
            "https://www.amfiindia.com/spages/NAVAll.txt", timeout=30
        ).read().decode("utf-8", "ignore")
        data = {}
        for line in txt.splitlines():
            parts = line.split(";")
            if len(parts) >= 6 and parts[0].isdigit():
                data[int(parts[0])] = (parts[-2], parts[-1])
        _navall_cache["ts"] = now
        _navall_cache["data"] = data
    return _navall_cache["data"].get(code)


def _refresh_nav():
    """Refresh all MF NAVs from AMFI.  Safe to call on startup."""
    from mftool import Mftool
    conn = get_live_conn()
    mft = Mftool()
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
            try:
                nav = float(data["nav"])
                date_raw = data["last_updated"]
            except (TypeError, ValueError):
                # mftool misparses schemes whose names contain ';'
                fb = _navall_lookup(int(code))
                if not fb:
                    continue
                nav = float(fb[0])
                date_raw = fb[1]
            nav_date = datetime.strptime(date_raw, "%d-%b-%Y").isoformat()
            nav_date_str = nav_date[:10]  # YYYY-MM-DD for comparison
            for tbl in ("User1_MF", "User2_MF"):
                conn.execute(f"""
                    UPDATE {tbl} SET
                        Previous_NAV = CASE
                            WHEN Previous_NAV IS NULL THEN Current_NAV
                            WHEN NAV_Date IS NULL OR substr(NAV_Date, 1, 10) != ? THEN Current_NAV
                            ELSE Previous_NAV END,
                        Current_NAV  = ?,
                        NAV_Date     = ?,
                        Value_now    = ROUND(Units * ?, 4)
                    WHERE AMFI_CODE = ?
                """, (nav_date_str, nav, nav_date, nav, code))
            conn.commit()
        except Exception as e:
            logger.warning("Failed to update NAV for code %s: %s", code, e)
    conn.close()


def _backfill_previous_nav():
    """Set Previous_NAV from AMFI history where it is missing or stale.

    Targets rows where Previous_NAV IS NULL or equals Current_NAV (meaning
    it was never properly backfilled from the previous trading day).
    """
    from mftool import Mftool
    conn = get_live_conn()
    mft = Mftool()
    backfilled = 0
    for tbl in ("User1_MF", "User2_MF"):
        rows = conn.execute(f"""
            SELECT DISTINCT AMFI_CODE FROM {tbl}
            WHERE AMFI_CODE IS NOT NULL
              AND Current_NAV > 0
              AND (Previous_NAV IS NULL OR Previous_NAV = Current_NAV)
        """).fetchall()
        for row in rows:
            code = row[0]
            nav_date_row = conn.execute(
                f"SELECT NAV_Date FROM {tbl} WHERE AMFI_CODE = ? LIMIT 1", (code,)
            ).fetchone()
            current_nav_date = (nav_date_row[0] or "")[:10]
            series = _get_historical_nav(mft, int(code))
            if not series or len(series) < 2:
                continue
            prev_nav = None
            for item in series[1:5]:
                try:
                    d = datetime.strptime(str(item["date"]), "%d-%m-%Y").strftime("%Y-%m-%d")
                    if d < current_nav_date and float(item["nav"]) > 0:
                        prev_nav = float(item["nav"])
                        break
                except (KeyError, ValueError, TypeError):
                    continue
            if prev_nav is not None and prev_nav != (conn.execute(
                f"SELECT Current_NAV FROM {tbl} WHERE AMFI_CODE = ? LIMIT 1", (code,)
            ).fetchone() or (None,))[0]:
                conn.execute(
                    f"UPDATE {tbl} SET Previous_NAV = ? WHERE AMFI_CODE = ?",
                    (prev_nav, code),
                )
                backfilled += 1
        conn.commit()
    conn.close()
    return backfilled


def _refresh_stocks():
    """Refresh all stock LTPs from Yahoo Finance.  Safe to call on startup."""
    import yfinance as yf
    conn = get_live_conn()
    for tbl in ("User1_Stocks", "User2_Stocks"):
        rows = conn.execute(f"SELECT Ticker, Qty FROM {tbl}").fetchall()
        for row in rows:
            # NULL ticker must skip this row, not abort the whole refresh
            ticker = (row["Ticker"] or "").strip()
            qty    = row["Qty"] or 0
            if not ticker:
                continue
            try:
                data = yf.download(ticker + ".NS", period="1d", timeout=10,
                                   progress=False, auto_adjust=True)
                if data.empty:
                    continue
                # Newer yfinance returns MultiIndex columns even for a single
                # ticker, making data["Close"] a DataFrame — flatten first.
                close = data["Close"]
                if hasattr(close, "columns"):
                    close = close.iloc[:, 0]
                ltp      = float(close.iloc[-1])
                value_now = round(qty * ltp, 4)
                conn.execute(f"UPDATE {tbl} SET LTP=?, Value_now=? WHERE Ticker=?",
                             (ltp, value_now, row["Ticker"]))
                conn.commit()
            except Exception as e:
                logger.warning("Failed to update stock %s in %s: %s", ticker, tbl, e)
    conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_schema()
    logger.info("DB schema initialised at %s", active_db())

    # Auto-refresh on startup (runs in background thread so startup isn't blocked)
    async def _auto_refresh():
        loop = asyncio.get_event_loop()
        logger.info("Backfilling Previous_NAV from AMFI history…")
        try:
            n = await loop.run_in_executor(None, _backfill_previous_nav)
            if n:
                logger.info("Backfilled Previous_NAV for %d fund(s)", n)
        except Exception as e:
            logger.warning("Backfill Previous_NAV failed: %s", e)
        logger.info("Auto-refreshing NAVs on startup…")
        try:
            await loop.run_in_executor(None, _refresh_nav)
        except Exception as e:
            logger.warning("Auto-refresh NAV failed: %s", e)
        logger.info("Auto-refreshing stocks on startup…")
        try:
            await loop.run_in_executor(None, _refresh_stocks)
        except Exception as e:
            logger.warning("Auto-refresh stocks failed: %s", e)
        logger.info("Auto-refresh complete")

    # Hold a reference — a bare create_task can be garbage-collected mid-flight
    app.state.startup_refresh_task = asyncio.create_task(_auto_refresh())

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
    conn = sqlite3.connect(active_db())
    conn.row_factory = sqlite3.Row
    return conn


def clean(val):
    """Replace NaN/Inf with None for JSON serialisation."""
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    return val


def rows_to_list(rows):
    return [{k: clean(v) for k, v in dict(r).items()} for r in rows]


# ── DB MODE (live / demo dummy) ──────────────────────────────────────────────

class DBModeRequest(BaseModel):
    mode: str


@app.get("/api/admin/db-mode")
def get_db_mode(current_user: dict = Depends(get_current_user)):
    """Report which DB is active.  Readable by any authenticated user so the
    UI badge can be shown for everyone, not just admins."""
    mode = "live"
    try:
        if os.path.exists(MODE_FILE):
            with open(MODE_FILE, encoding="utf-8") as fh:
                candidate = fh.read().strip()
            if candidate == "dummy" and os.path.exists(DUMMY_PATH):
                mode = "dummy"
    except OSError:
        pass

    dummy_net_worth = None
    dummy_available = os.path.exists(DUMMY_PATH)
    if dummy_available:
        try:
            conn = sqlite3.connect(DUMMY_PATH)
            dummy_net_worth = conn.execute("""
                SELECT COALESCE((SELECT SUM(Value_now) FROM User1_MF), 0)
                     + COALESCE((SELECT SUM(Value_now) FROM User2_MF), 0)
                     + COALESCE((SELECT SUM(Value_now) FROM User1_Stocks), 0)
                     + COALESCE((SELECT SUM(Value_now) FROM User2_Stocks), 0)
            """).fetchone()[0]
            conn.close()
        except sqlite3.Error:
            dummy_net_worth = None

    return {"mode": mode, "dummy_available": dummy_available,
            "dummy_net_worth": dummy_net_worth}


@app.post("/api/admin/db-mode", dependencies=[Depends(require_admin)])
def set_db_mode(body: DBModeRequest):
    """Switch the active DB (admin only).  Never modifies either DB file —
    just flips which one the app reads from."""
    mode = body.mode.strip().lower()
    if mode not in ("live", "dummy"):
        raise HTTPException(status_code=400, detail="mode must be 'live' or 'dummy'")
    if mode == "dummy" and not os.path.exists(DUMMY_PATH):
        raise HTTPException(status_code=404,
                            detail="dummy_investments.db not found — run make_dummy_db.py first")

    tmp = MODE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(mode)
    os.replace(tmp, MODE_FILE)
    logger.info("DB mode switched to %s", mode)
    return {"mode": mode}


# ── SUMMARY ──────────────────────────────────────────────────────────────────

@app.get("/api/summary")
def summary():
    conn = get_conn()
    try:
        r_mf  = conn.execute("SELECT SUM(Value_at_cost) ac, SUM(Value_now) vn FROM User1_MF").fetchone()
        s_mf  = conn.execute("SELECT SUM(Value_at_cost) ac, SUM(Value_now) vn FROM User2_MF").fetchone()
        r_sto = conn.execute("SELECT SUM(Value_at_cost) ac, SUM(Value_now) vn FROM User1_Stocks").fetchone()
        s_sto = conn.execute("SELECT SUM(Value_at_cost) ac, SUM(Value_now) vn FROM User2_Stocks").fetchone()
        r_pf  = conn.execute("SELECT SUM(employee_contrib + employer_contrib) ac, SUM(interest) int FROM User1_PF").fetchone()
        s_pf  = conn.execute("SELECT SUM(employee_contrib + employer_contrib) ac, SUM(interest) int FROM User2_PF").fetchone()

        mf_invested  = (r_mf["ac"] or 0) + (s_mf["ac"] or 0)
        mf_now       = (r_mf["vn"] or 0) + (s_mf["vn"] or 0)
        sto_invested = (r_sto["ac"] or 0) + (s_sto["ac"] or 0)
        sto_now      = (r_sto["vn"] or 0) + (s_sto["vn"] or 0)
        r_initial = _get_pf_opening(conn, "user1")
        s_initial = _get_pf_opening(conn, "user2")
        r_ac = r_pf["ac"] or 0
        s_ac = s_pf["ac"] or 0
        r_int = r_pf["int"] or 0
        s_int = s_pf["int"] or 0
        pf_invested  = r_initial + s_initial + r_ac + s_ac
        pf_now       = r_initial + s_initial + r_ac + s_ac + r_int + s_int

        total_invested = mf_invested + sto_invested + pf_invested
        total_now      = mf_now + sto_now + pf_now

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
            "pf_invested":    round(pf_invested, 2),
            "pf_now":         round(pf_now, 2),
            "pf_returns":     round(pf_now - pf_invested, 2),
            "pf_pct":         pct(pf_now - pf_invested, pf_invested),
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


# ── PF (Provident Fund) ──────────────────────────────────────────────────────

def _pf_table(owner: str) -> str:
    if owner.lower() == "user1":
        return "User1_PF"
    if owner.lower() == "user2":
        return "User2_PF"
    raise HTTPException(400, "owner must be 'user1' or 'user2'")


def _get_pf_config(conn, owner: str):
    row = conn.execute("SELECT * FROM PF_Config WHERE user=?", (owner,)).fetchone()
    if row:
        d = dict(row)
        d["owner"] = d.pop("user")
        return d
    return {"owner": owner, "UAN": "", "initial_balance": 0, "initial_month": ""}


def _get_pf_accounts(conn, owner: str) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM PF_Accounts WHERE user=? ORDER BY account", (owner,)
    ).fetchall()
    return rows_to_list(rows)


def _get_pf_openings(conn, owner: str) -> dict:
    """account -> opening balance.  Falls back to legacy PF_Config.initial_balance."""
    rows = conn.execute(
        "SELECT account, opening_balance FROM PF_Accounts WHERE user=?", (owner,)
    ).fetchall()
    openings = {r["account"]: r["opening_balance"] or 0 for r in rows}
    if not openings:
        cfg = _get_pf_config(conn, owner)
        openings[""] = cfg.get("initial_balance") or 0
    return openings


def _get_pf_opening(conn, owner: str) -> float:
    row = conn.execute(
        "SELECT COALESCE(SUM(opening_balance), 0) o FROM PF_Accounts WHERE user=?", (owner,)
    ).fetchone()
    if row["o"]:
        return row["o"]
    return _get_pf_config(conn, owner).get("initial_balance") or 0


def _enrich_pf(rows, config=None, openings: dict | None = None):
    cfg = config or {}
    uan = cfg.get("UAN", "")
    data = rows_to_list(rows)
    data.sort(key=lambda x: (x.get("entry_date") or "", x.get("account") or ""))
    openings = dict(openings or {})
    balances = {acc: (openings.get(acc, 0) or 0) for acc in set(openings)}
    for r in data:
        acc = r.get("account") or ""
        if acc not in balances:
            balances[acc] = 0.0
        contrib = (r["employee_contrib"] or 0) + (r["employer_contrib"] or 0)
        interest_val = r["interest"] or 0
        balances[acc] = balances[acc] + contrib + interest_val
        r["total_contrib"] = round(contrib, 2)
        r["running_balance"] = round(sum(balances.values()), 2)
        r["UAN"] = uan
    data.reverse()
    return data


@app.get("/api/pf")
def pf_all():
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT 'user1' owner, * FROM User1_PF
            UNION ALL
            SELECT 'user2' owner, * FROM User2_PF
        """).fetchall()
        cfg1 = _get_pf_config(conn, "user1")
        cfg2 = _get_pf_config(conn, "user2")
        open1 = _get_pf_openings(conn, "user1")
        open2 = _get_pf_openings(conn, "user2")
        u1 = _enrich_pf([r for r in rows if r["owner"] == "user1"], cfg1, open1)
        u2 = _enrich_pf([r for r in rows if r["owner"] == "user2"], cfg2, open2)
        combined = u1 + u2
        combined.sort(key=lambda x: x.get("entry_date") or "", reverse=True)
        return combined
    finally:
        conn.close()


@app.get("/api/pf/{owner}")
def pf_by_owner(owner: str):
    table = _pf_table(owner)
    conn = get_conn()
    try:
        rows = conn.execute(f"SELECT * FROM {table}").fetchall()
        cfg = _get_pf_config(conn, owner)
        openings = _get_pf_openings(conn, owner)
        return _enrich_pf(rows, cfg, openings)
    finally:
        conn.close()


# ── ADMIN: PF CRUD ───────────────────────────────────────────────────────────

class PFEntry(BaseModel):
    owner: str
    account: str = ""
    employee_contrib: float = 0
    employer_contrib: float = 0
    interest: float = 0
    entry_date: str = ""
    notes: str = ""


class PFConfigModel(BaseModel):
    owner: str
    UAN: str = ""
    initial_balance: float = 0
    initial_month: str = ""


@app.get("/api/admin/pf/{owner}")
def admin_list_pf(owner: str):
    table = _pf_table(owner)
    conn = get_conn()
    try:
        rows = conn.execute(
            f"SELECT id AS rowid, * FROM {table} ORDER BY entry_date DESC"
        ).fetchall()
        return rows_to_list(rows)
    finally:
        conn.close()


@app.post("/api/admin/pf", dependencies=[Depends(require_admin)])
def admin_create_pf(entry: PFEntry):
    table = _pf_table(entry.owner)
    conn = get_conn()
    try:
        cur = conn.execute(f"""
            INSERT INTO {table} (account, employee_contrib, employer_contrib,
                                 interest, entry_date, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (entry.account, entry.employee_contrib, entry.employer_contrib,
              entry.interest, entry.entry_date, entry.notes))
        conn.commit()
        return {"status": "ok", "rowid": cur.lastrowid}
    finally:
        conn.close()


@app.put("/api/admin/pf/{owner}/{rowid}", dependencies=[Depends(require_admin)])
def admin_update_pf(owner: str, rowid: int, entry: PFEntry):
    table = _pf_table(owner)
    conn = get_conn()
    try:
        conn.execute(f"""
            UPDATE {table}
            SET account=?, employee_contrib=?, employer_contrib=?,
                interest=?, entry_date=?, notes=?
            WHERE rowid=?
        """, (entry.account, entry.employee_contrib, entry.employer_contrib,
              entry.interest, entry.entry_date, entry.notes, rowid))
        conn.commit()
        if conn.total_changes == 0:
            raise HTTPException(404, "Row not found")
        return {"status": "ok"}
    finally:
        conn.close()


@app.delete("/api/admin/pf/{owner}/{rowid}", dependencies=[Depends(require_admin)])
def admin_delete_pf(owner: str, rowid: int):
    table = _pf_table(owner)
    conn = get_conn()
    try:
        conn.execute(f"DELETE FROM {table} WHERE rowid=?", (rowid,))
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


# ── ADMIN: PF CONFIG ────────────────────────────────────────────────────────

@app.get("/api/admin/pf-config/{owner}")
def admin_get_pf_config(owner: str):
    if owner.lower() not in ("user1", "user2"):
        raise HTTPException(400, "owner must be 'user1' or 'user2'")
    conn = get_conn()
    try:
        cfg = _get_pf_config(conn, owner)
        return cfg
    finally:
        conn.close()


@app.put("/api/admin/pf-config/{owner}", dependencies=[Depends(require_admin)])
def admin_set_pf_config(owner: str, cfg: PFConfigModel):
    if owner.lower() not in ("user1", "user2"):
        raise HTTPException(400, "owner must be 'user1' or 'user2'")
    conn = get_conn()
    try:
        conn.execute("""
            INSERT INTO PF_Config (user, UAN, initial_balance, initial_month)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user) DO UPDATE SET
                UAN=excluded.UAN,
                initial_balance=excluded.initial_balance,
                initial_month=excluded.initial_month
        """, (owner, cfg.UAN, cfg.initial_balance, cfg.initial_month))
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


# ── ADMIN: USER NAMES (display names for owner tabs) ────────────────────────

class UserNamesModel(BaseModel):
    users: list[dict[str, str]]


@app.get("/api/user-names")
def get_user_names():
    conn = get_conn()
    try:
        rows = conn.execute("SELECT owner, name FROM user_names ORDER BY id").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.put("/api/user-names", dependencies=[Depends(verify_api_key)])
def set_user_names(body: UserNamesModel):
    conn = get_conn()
    try:
        conn.execute("DELETE FROM user_names")
        for u in body.users:
            owner = str(u.get("owner", "")).strip()
            name = str(u.get("name", "")).strip()
            if owner:
                conn.execute(
                    "INSERT INTO user_names (owner, name) VALUES (?, ?)",
                    (owner, name),
                )
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


# ── ADMIN: PF ACCOUNTS (per-account opening balance) ────────────────────────

class PFAccountModel(BaseModel):
    owner: str
    account: str
    establishment: str = ""
    opening_balance: float = 0
    opening_month: str = ""
    UAN: str = ""


@app.get("/api/admin/pf-accounts/{owner}")
def admin_get_pf_accounts(owner: str):
    _pf_table(owner)
    conn = get_conn()
    try:
        return _get_pf_accounts(conn, owner)
    finally:
        conn.close()


@app.put("/api/admin/pf-accounts/{owner}", dependencies=[Depends(require_admin)])
def admin_set_pf_account(owner: str, acct: PFAccountModel):
    if owner.lower() != acct.owner.lower():
        raise HTTPException(400, "owner mismatch")
    if not acct.account:
        raise HTTPException(400, "account is required")
    conn = get_conn()
    try:
        conn.execute("""
            INSERT INTO PF_Accounts (user, account, establishment,
                                     opening_balance, opening_month, UAN)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user, account) DO UPDATE SET
                establishment=excluded.establishment,
                opening_balance=excluded.opening_balance,
                opening_month=excluded.opening_month,
                UAN=excluded.UAN
        """, (owner, acct.account, acct.establishment,
              acct.opening_balance, acct.opening_month, acct.UAN))
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


@app.delete("/api/admin/pf-accounts/{owner}/{account}", dependencies=[Depends(require_admin)])
def admin_delete_pf_account(owner: str, account: str):
    conn = get_conn()
    try:
        conn.execute("DELETE FROM PF_Accounts WHERE user=? AND account=?", (owner, account))
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


# ── ADMIN: PF PASSBOOK PDF IMPORT ────────────────────────────────────────────

def _parse_pdf_or_400(file: UploadFile):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only .pdf files are accepted")
    try:
        return parse_passbook_pdf(file.file.read())
    except Exception as e:
        raise HTTPException(400, f"Failed to parse PDF: {e}")


def _upsert_pf_rows(conn, table: str, rows: list[dict]):
    # Passbooks can legitimately carry two rows for the same (account, month,
    # notes) — arrears / split remittances. The upsert key would collapse them
    # (second row UPDATEs the first), silently losing a contribution. Merge
    # such rows by summing their amounts BEFORE upserting, so re-imports stay
    # idempotent without dropping money.
    merged: dict[tuple, dict] = {}
    for r in rows:
        key = (r["account"], r["entry_date"], r["notes"])
        if key in merged:
            m = merged[key]
            m["employee_contrib"] += r["employee_contrib"]
            m["employer_contrib"] += r["employer_contrib"]
            m["interest"] += r["interest"]
        else:
            merged[key] = dict(r)
    rows = list(merged.values())

    inserted = 0
    updated = 0
    for r in rows:
        existing = conn.execute(
            f"SELECT id AS rowid FROM {table} WHERE account=? AND entry_date=? AND notes=?",
            (r["account"], r["entry_date"], r["notes"]),
        ).fetchone()
        if existing:
            conn.execute(f"""
                UPDATE {table}
                SET account=?, employee_contrib=?, employer_contrib=?,
                    interest=?, entry_date=?, notes=?
                WHERE rowid=?
            """, (r["account"], r["employee_contrib"], r["employer_contrib"],
                  r["interest"], r["entry_date"], r["notes"], existing["rowid"]))
            updated += 1
        else:
            conn.execute(f"""
                INSERT INTO {table}
                    (account, employee_contrib, employer_contrib, interest, entry_date, notes)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (r["account"], r["employee_contrib"], r["employer_contrib"],
                  r["interest"], r["entry_date"], r["notes"]))
            inserted += 1
    return inserted, updated


@app.post("/api/admin/pf-import/preview/{owner}", dependencies=[Depends(require_admin)])
def admin_pf_import_preview(owner: str, file: UploadFile = File(...)):
    _pf_table(owner)
    meta, rows, warnings = _parse_pdf_or_400(file)
    for r in rows:
        r["account"] = meta["account"]
    return {
        "status": "ok", "meta": meta, "rows": rows,
        "warnings": warnings, "count": len(rows),
    }


@app.post("/api/admin/pf-import/{owner}", dependencies=[Depends(require_admin)])
def admin_pf_import(owner: str, file: UploadFile = File(...)):
    table = _pf_table(owner)
    meta, rows, warnings = _parse_pdf_or_400(file)
    for r in rows:
        r["account"] = meta["account"]

    conn = get_conn()
    try:
        inserted, updated = _upsert_pf_rows(conn, table, rows)
        conn.commit()
        return {
            "status": "ok", "meta": meta,
            "inserted": inserted,
            "updated": updated,
            "warnings": warnings,
            "count": len(rows),
        }
    finally:
        conn.close()


@app.post("/api/admin/pf-import/bulk/{owner}", dependencies=[Depends(require_admin)])
def admin_pf_import_bulk(owner: str, files: list[UploadFile] = File(...)):
    table = _pf_table(owner)
    conn = get_conn()
    results = []
    try:
        for file in files:
            fname = file.filename or "passbook.pdf"
            if not fname.lower().endswith(".pdf"):
                results.append({
                    "filename": fname, "status": "error",
                    "message": "Only .pdf files are accepted",
                })
                continue
            try:
                meta, rows, warnings = parse_passbook_pdf(file.file.read())
            except Exception as e:
                results.append({
                    "filename": fname, "status": "error",
                    "message": f"Failed to parse PDF: {e}",
                })
                continue
            for r in rows:
                r["account"] = meta["account"]
            inserted, updated = _upsert_pf_rows(conn, table, rows)
            conn.commit()
            results.append({
                "filename": fname, "status": "ok",
                "account": meta["account"], "inserted": inserted,
                "updated": updated, "warnings": warnings, "count": len(rows),
            })
        return {"status": "ok", "results": results}
    finally:
        conn.close()


# ── TRAILING RETURNS (MF) ─────────────────────────────────────────────────────

RETURN_HORIZONS = [1, 2, 3, 5, 10]

# In-memory TTL cache for historical NAV series.  mftool caches in-memory only
# per Mftool() instance, so cache here too to avoid re-downloading history from
# AMFI on every request within the same process.
_MF_HIST_CACHE: dict[int, tuple[float, list]] = {}
_MF_HIST_TTL = 24 * 3600
_MF_HIST_LOCK = threading.Lock()


def _get_historical_nav(mft, code: int) -> list | None:
    """Return the cached AMFI historical NAV series (newest first) or None."""
    now = time.time()
    with _MF_HIST_LOCK:
        cached = _MF_HIST_CACHE.get(code)
        if cached and now - cached[0] < _MF_HIST_TTL:
            return cached[1]
    try:
        data = mft.get_scheme_historical_nav(int(code))
        series = (data or {}).get("data") if data else None
        if not isinstance(series, list) or not series:
            return None
    except Exception as e:
        logger.warning("Failed to fetch history for code %s: %s", code, e)
        return None
    with _MF_HIST_LOCK:
        _MF_HIST_CACHE[code] = (now, series)
    return series


def _trailing_returns(series: list, today: date | None = None) -> dict:
    """Trailing annualized (CAGR) returns for 1/2/3/5/10 year horizons.

    ``series`` is the AMFI historical NAV list (newest first), each item being
    {"date": "DD-MM-YYYY", "nav": "xx.xxxxx"}.  Returns a dict mapping horizon
    keys ('r1y', 'r2y', ...) to CAGR % or None when the fund does not go back
    far enough.
    """
    today = today or date.today()
    points: list[tuple[date, float]] = []
    for item in series:
        try:
            d = datetime.strptime(str(item["date"]), "%d-%m-%Y").date()
            nav = float(item["nav"])
        except (KeyError, ValueError, TypeError):
            continue
        if nav > 0:
            points.append((d, nav))
    result = {f"r{y}y": None for y in RETURN_HORIZONS}
    if not points:
        return result
    points.sort(key=lambda p: p[0])
    cur_date, cur_nav = points[-1]
    for years in RETURN_HORIZONS:
        target = today - timedelta(days=round(365.25 * years))
        lookback = next((p for p in reversed(points) if p[0] <= target), None)
        if lookback is None:
            continue
        lb_date, lb_nav = lookback
        days = (cur_date - lb_date).days
        if lb_nav <= 0 or cur_nav <= 0 or days <= 0:
            continue
        cagr = ((cur_nav / lb_nav) ** (365.25 / days) - 1) * 100
        result[f"r{years}y"] = round(cagr, 2)
    return result


def _build_returns_response(rows) -> list[dict]:
    """Attach trailing-return horizons to each grouped MF row and append a
    portfolio-wide value-weighted average row."""
    data = rows_to_list(rows)
    from mftool import Mftool
    mft = Mftool()
    today = date.today()
    for r in data:
        r["invested"] = r["invested"] or 0
        r["value_now"] = r["value_now"] or 0
        series = _get_historical_nav(mft, int(r["AMFI_CODE"]))
        r.update(_trailing_returns(series, today) if series
                 else {f"r{y}y": None for y in RETURN_HORIZONS})
    if not data:
        return data
    avg = {"AMFI_CODE": None, "Fund_Name": "Portfolio (weighted avg)",
           "Category": "", "invested": sum(r["invested"] for r in data),
           "value_now": sum(r["value_now"] for r in data)}
    for years in RETURN_HORIZONS:
        key = f"r{years}y"
        weighted = sum(r["value_now"] * r[key] for r in data if r[key] is not None)
        weight = sum(r["value_now"] for r in data if r[key] is not None)
        avg[key] = round(weighted / weight, 2) if weight else None
    data.append(avg)
    return data


# ── MUTUAL FUNDS ─────────────────────────────────────────────────────────────

@app.get("/api/mutual-funds")
def mutual_funds():
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT f.Fund_Name, f.Units,
                   f.Purchase_NAV, f.Current_NAV, f.Previous_NAV,
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


@app.get("/api/mutual-funds/returns")
def mf_returns_all():
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT f.AMFI_CODE,
                   MAX(f.Fund_Name) Fund_Name,
                   COALESCE(MAX(s.Category), 'Other') Category,
                   SUM(f.Value_at_cost) invested,
                   SUM(f.Value_now) value_now
            FROM (
                SELECT * FROM User1_MF
                UNION ALL
                SELECT * FROM User2_MF
            ) f
            LEFT JOIN MF_Summary s ON f.AMFI_CODE = s.AMFI_CODE
            WHERE f.Fund_Name IS NOT NULL AND TRIM(f.Fund_Name) != ''
              AND f.AMFI_CODE IS NOT NULL
            GROUP BY f.AMFI_CODE
        """).fetchall()
        return _build_returns_response(rows)
    finally:
        conn.close()


@app.get("/api/mutual-funds/returns/{owner}")
def mf_returns_by_owner(owner: str):
    table = _mf_table(owner)
    conn = get_conn()
    try:
        rows = conn.execute(f"""
            SELECT f.AMFI_CODE,
                   MAX(f.Fund_Name) Fund_Name,
                   COALESCE(MAX(s.Category), 'Other') Category,
                   SUM(f.Value_at_cost) invested,
                   SUM(f.Value_now) value_now
            FROM {table} f
            LEFT JOIN MF_Summary s ON f.AMFI_CODE = s.AMFI_CODE
            WHERE f.Fund_Name IS NOT NULL AND TRIM(f.Fund_Name) != ''
              AND f.AMFI_CODE IS NOT NULL
            GROUP BY f.AMFI_CODE
        """).fetchall()
        return _build_returns_response(rows)
    finally:
        conn.close()


@app.get("/api/mutual-funds/{owner}")
def mf_by_owner(owner: str):
    table = _mf_table(owner)
    conn = get_conn()
    try:
        rows = conn.execute(f"""
            SELECT r.Fund_Name, r.Units, r.Purchase_NAV, r.Current_NAV, r.Previous_NAV,
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
                   mf_invested, mf_value, stock_invested, stock_value,
                   pf_invested, pf_value, recorded_date
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
        r_pf  = conn.execute("SELECT SUM(employee_contrib + employer_contrib) ac, SUM(interest) int FROM User1_PF").fetchone()
        s_pf  = conn.execute("SELECT SUM(employee_contrib + employer_contrib) ac, SUM(interest) int FROM User2_PF").fetchone()

        mf_inv = (r_mf["ac"] or 0) + (s_mf["ac"] or 0)
        mf_val = (r_mf["vn"] or 0) + (s_mf["vn"] or 0)
        st_inv = (r_sto["ac"] or 0) + (s_sto["ac"] or 0)
        st_val = (r_sto["vn"] or 0) + (s_sto["vn"] or 0)
        r_initial = _get_pf_opening(conn, "user1")
        s_initial = _get_pf_opening(conn, "user2")
        r_ac = r_pf["ac"] or 0
        s_ac = s_pf["ac"] or 0
        r_int = r_pf["int"] or 0
        s_int = s_pf["int"] or 0
        pf_inv = r_initial + s_initial + r_ac + s_ac
        pf_val = r_initial + s_initial + r_ac + s_ac + r_int + s_int

        now = datetime.now()
        conn.execute("""
            INSERT INTO networth_history (year, month, total_invested, total_value,
                                         mf_invested, mf_value, stock_invested, stock_value,
                                         pf_invested, pf_value)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(year, month) DO UPDATE SET
                total_invested=excluded.total_invested, total_value=excluded.total_value,
                mf_invested=excluded.mf_invested, mf_value=excluded.mf_value,
                stock_invested=excluded.stock_invested, stock_value=excluded.stock_value,
                pf_invested=excluded.pf_invested, pf_value=excluded.pf_value,
                recorded_date=CURRENT_TIMESTAMP
        """, (now.year, now.month, mf_inv + st_inv + pf_inv, mf_val + st_val + pf_val,
              mf_inv, mf_val, st_inv, st_val, pf_inv, pf_val))
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
        _refresh_nav()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.post("/api/refresh/backfill-prev-nav", dependencies=[Depends(verify_api_key)])
def backfill_prev_nav():
    try:
        n = _backfill_previous_nav()
        return {"status": "ok", "backfilled": n}
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
        try:
            nav = float(data["nav"])
            nav_date = data.get("last_updated", "")
        except (TypeError, ValueError):
            fb = _navall_lookup(code)
            if not fb:
                raise HTTPException(404, f"Scheme {code} NAV unavailable")
            nav, nav_date = float(fb[0]), fb[1]
        return {
            "AMFI_CODE": code,
            "Fund_Name": scheme_name,
            "Fund_House": scheme_name.split(" ")[0] if scheme_name else "",
            "Current_NAV": nav,
            "NAV_Date": nav_date,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.post("/api/refresh/stocks", dependencies=[Depends(verify_api_key)])
def refresh_stocks():
    try:
        _refresh_stocks()
        return {"status": "ok"}
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
            f"SELECT id AS rowid, * FROM {table} WHERE Fund_Name IS NOT NULL AND TRIM(Fund_Name) != '' ORDER BY Fund_Name"
        ).fetchall()
        return rows_to_list(rows)
    finally:
        conn.close()


@app.post("/api/admin/mf", dependencies=[Depends(require_admin)])
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


@app.put("/api/admin/mf/{owner}/{rowid}", dependencies=[Depends(require_admin)])
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


@app.delete("/api/admin/mf/{owner}/{rowid}", dependencies=[Depends(require_admin)])
def admin_delete_mf(owner: str, rowid: int):
    table = _mf_table(owner)
    conn = get_conn()
    try:
        conn.execute(f"DELETE FROM {table} WHERE rowid=?", (rowid,))
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


# ── RETIREMENT: 3-BUCKET STRATEGY ────────────────────────────────────────────

VALID_BUCKETS = ("cash", "safety", "growth")


class RetirementConfigRequest(BaseModel):
    swr_pct: float
    inflation_pct: float
    bucket1_years: float
    bucket2_years: float
    cash_amount: float
    refill_trigger_years: float = 2


class BucketAssignRequest(BaseModel):
    entity: str
    key: str
    bucket: str


def _default_bucket(entity: str, category: str | None) -> str:
    if entity == "pf":
        return "cash"
    if entity == "mf" and (category or "").lower() == "debt":
        return "safety"
    return "growth"


@app.get("/api/retirement")
def retirement():
    conn = get_conn()
    try:
        cfg = conn.execute(
            "SELECT swr_pct, inflation_pct, bucket1_years, bucket2_years, cash_amount, refill_trigger_years "
            "FROM Retirement_Config WHERE id = 1"
        ).fetchone()
        config = dict(cfg) if cfg else {
            "swr_pct": 3.5, "inflation_pct": 6, "bucket1_years": 3, "bucket2_years": 4,
            "cash_amount": 0, "refill_trigger_years": 2,
        }

        assignments = {
            (r["entity"], r["key"]): r["bucket"]
            for r in conn.execute("SELECT entity, key, bucket FROM Bucket_Assignments")
        }

        holdings = []

        mf_rows = conn.execute("""
            SELECT m.AMFI_CODE, MAX(m.Fund_Name) Fund_Name,
                   COALESCE(MAX(s.Category), 'Other') Category,
                   SUM(m.Value_now) Value_now
            FROM (
                SELECT AMFI_CODE, Fund_Name, Value_now FROM User1_MF
                UNION ALL
                SELECT AMFI_CODE, Fund_Name, Value_now FROM User2_MF
            ) m
            LEFT JOIN MF_Summary s ON s.AMFI_CODE = m.AMFI_CODE
            WHERE m.AMFI_CODE IS NOT NULL
            GROUP BY m.AMFI_CODE
        """).fetchall()
        for r in mf_rows:
            key = str(int(r["AMFI_CODE"]))
            holdings.append({
                "entity": "mf",
                "key": key,
                "name": r["Fund_Name"],
                "category": r["Category"],
                "value": round(r["Value_now"] or 0, 2),
                "bucket": assignments.get(("mf", key)) or _default_bucket("mf", r["Category"]),
            })

        stock_rows = conn.execute("""
            SELECT Ticker, MAX(Instrument) Instrument, SUM(Value_now) Value_now
            FROM (
                SELECT Ticker, Instrument, Value_now FROM User1_Stocks
                UNION ALL
                SELECT Ticker, Instrument, Value_now FROM User2_Stocks
            )
            GROUP BY Ticker
        """).fetchall()
        for r in stock_rows:
            holdings.append({
                "entity": "stock",
                "key": r["Ticker"],
                "name": r["Instrument"] or r["Ticker"],
                "category": "Stock",
                "value": round(r["Value_now"] or 0, 2),
                "bucket": assignments.get(("stock", r["Ticker"])) or _default_bucket("stock", None),
            })

        for owner in ("user1", "user2"):
            tbl = _pf_table(owner)
            row = conn.execute(
                f"SELECT SUM(employee_contrib + employer_contrib + interest) v FROM {tbl}"
            ).fetchone()
            pf_value = (row["v"] or 0) + _get_pf_opening(conn, owner)
            if pf_value <= 0:
                continue
            holdings.append({
                "entity": "pf",
                "key": owner,
                "name": f"Provident Fund ({owner})",
                "category": "PF",
                "value": round(pf_value, 2),
                "bucket": assignments.get(("pf", owner)) or _default_bucket("pf", None),
            })

        # Affordable spend is derived from the corpus itself: swr_pct% per year
        # of the total corpus on this date — so targets grow with the corpus.
        corpus = (config["cash_amount"] or 0) + sum(h["value"] for h in holdings)
        annual = corpus * (config["swr_pct"] or 0) / 100

        # Waterfall allocation: money pours into Bucket 1 until its tenure
        # target is met, overflows into Bucket 2 until its target is met, and
        # the remainder lands in Growth.  A holding's assigned bucket only
        # sets its pour priority; a single holding can straddle two buckets.
        # Each covered year is inflated: Bucket 1 covers years 1..y1, Bucket 2
        # the years after that (y1+1..y1+y2), so its target inflates further.
        infl = (config["inflation_pct"] or 0) / 100
        y1 = int(round(config["bucket1_years"]))
        y2 = int(round(config["bucket2_years"]))
        targets = {
            "cash": annual * sum((1 + infl) ** k for k in range(0, y1)),
            "safety": annual * sum((1 + infl) ** k for k in range(y1, y1 + y2)),
            "growth": None,
        }
        priority = {"cash": 0, "safety": 1, "growth": 2}
        pool = []
        if (config["cash_amount"] or 0) > 0:
            pool.append({"entity": "cash", "key": "manual", "name": "Cash / FD on hand",
                         "value": config["cash_amount"], "bucket": "cash"})
        pool += sorted(holdings, key=lambda h: (priority[h["bucket"]], -h["value"]))

        slices = {b: [] for b in VALID_BUCKETS}
        actuals = {b: 0.0 for b in VALID_BUCKETS}
        level = 0  # index into VALID_BUCKETS: current bucket being filled
        for h in pool:
            remaining = h["value"]
            while remaining > 0.005:
                b = VALID_BUCKETS[level]
                room = math.inf if targets[b] is None else max(targets[b] - actuals[b], 0)
                take = min(remaining, room)
                if take > 0.005:
                    slices[b].append({
                        "entity": h["entity"], "key": h["key"], "name": h["name"],
                        "amount": round(take, 2), "partial": take < h["value"] - 0.005,
                        "priority": h["bucket"],
                    })
                    actuals[b] += take
                    remaining -= take
                if targets[b] is not None and actuals[b] >= targets[b] - 0.005:
                    level = min(level + 1, len(VALID_BUCKETS) - 1)
                elif remaining > 0.005:
                    break  # growth is bottomless; shouldn't happen

        # Years of (inflated) spending each bucket covers, from the year that
        # bucket takes over: B1 covers years 1..y1, B2 starts after B1, growth
        # after B2 — so later buckets face costlier years.
        def _years_covered(amount: float, start_year: int) -> float | None:
            if annual <= 0:
                return None
            yrs, k = 0.0, start_year
            while amount > 0.005 and yrs < 100:
                cost = annual * (1 + infl) ** k
                if amount >= cost:
                    yrs += 1
                    amount -= cost
                    k += 1
                else:
                    yrs += amount / cost
                    break
            return round(yrs, 1)

        start_year = {"cash": 0, "safety": y1, "growth": y1 + y2}
        buckets = {
            b: {
                "actual": round(actuals[b], 2),
                "target": round(targets[b], 2) if targets[b] is not None else None,
                "slices": slices[b],
                "years_covered": _years_covered(actuals[b], start_year[b]),
            }
            for b in VALID_BUCKETS
        }
        # Refill strategy: when Bucket 1 falls below the trigger, top it up —
        # from Growth when equity is up over 12 months, else from Safety.
        nifty_12m = _nifty_12m_return()
        market = None if nifty_12m is None else ("up" if nifty_12m >= 0 else "down")
        source = None if market is None else ("growth" if market == "up" else "safety")
        b1_years = buckets["cash"]["years_covered"]
        trigger = config["refill_trigger_years"] or 2
        action_needed = b1_years is not None and b1_years < trigger
        topup = round(max(targets["cash"] - actuals["cash"], 0), 2) if action_needed else 0

        return {
            "config": config,
            "holdings": holdings,
            "buckets": buckets,
            "corpus": round(corpus, 2),
            "annual_affordable": round(annual, 2),
            "monthly_affordable": round(annual / 12, 2),
            "refill": {
                "nifty_12m_pct": nifty_12m,
                "market": market,
                "source": source,
                "trigger_years": trigger,
                "b1_years": b1_years,
                "action_needed": action_needed,
                "topup_amount": topup,
            },
        }
    finally:
        conn.close()


@app.put("/api/retirement/config", dependencies=[Depends(verify_api_key)])
def update_retirement_config(req: RetirementConfigRequest):
    if req.cash_amount < 0:
        raise HTTPException(400, "cash amount must be >= 0")
    # Bounds match what the model can sensibly represent: beyond these, the
    # combined bucket targets can exceed the corpus many times over.
    if not (0 < req.swr_pct <= 5):
        raise HTTPException(400, "withdrawal rate must be between 0 and 5%")
    if not (0 <= req.inflation_pct <= 10):
        raise HTTPException(400, "inflation must be between 0 and 10%")
    if not (0 < req.bucket1_years <= 5 and 0 < req.bucket2_years <= 8):
        raise HTTPException(400, "bucket years out of range")
    if not (0 < req.refill_trigger_years <= req.bucket1_years):
        raise HTTPException(400, "refill trigger must be between 0 and the Bucket 1 horizon")
    conn = get_conn()
    try:
        conn.execute(
            "UPDATE Retirement_Config SET swr_pct = ?, inflation_pct = ?, bucket1_years = ?, "
            "bucket2_years = ?, cash_amount = ?, refill_trigger_years = ? WHERE id = 1",
            (req.swr_pct, req.inflation_pct, req.bucket1_years, req.bucket2_years,
             req.cash_amount, req.refill_trigger_years),
        )
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


@app.put("/api/retirement/assign", dependencies=[Depends(verify_api_key)])
def assign_bucket(req: BucketAssignRequest):
    if req.bucket not in VALID_BUCKETS:
        raise HTTPException(400, f"bucket must be one of {VALID_BUCKETS}")
    if req.entity not in ("mf", "stock", "pf"):
        raise HTTPException(400, "entity must be 'mf', 'stock', or 'pf'")
    conn = get_conn()
    try:
        conn.execute(
            "INSERT INTO Bucket_Assignments (entity, key, owner, bucket) VALUES (?, ?, '', ?) "
            "ON CONFLICT(entity, key, owner) DO UPDATE SET bucket = excluded.bucket",
            (req.entity, req.key, req.bucket),
        )
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


# ── ADMIN: STOCKS UPLOAD ─────────────────────────────────────────────────────

@app.post("/api/admin/upload-stocks/{owner}", dependencies=[Depends(require_admin)])
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

        # Coerce remaining numeric columns too — a single unbindable cell must
        # not be able to abort the insert batch.
        for col in ("Qty", "Purchase_cost", "Value_at_cost"):
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

        final = df[["Ticker", "Instrument", "Qty", "Purchase_cost", "LTP", "Value_now", "Value_at_cost"]]

        conn = get_conn()
        try:
            # Explicit transaction: sqlite3 runs DDL in autocommit by default,
            # which made the DROP durable before the inserts — a failed upload
            # destroyed the table. BEGIN makes drop+create+insert atomic.
            conn.execute("BEGIN")
            conn.execute(f"DROP TABLE IF EXISTS {table}")
            conn.execute(f"""
                CREATE TABLE {table} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Ticker TEXT, Instrument TEXT, Qty REAL,
                    Purchase_cost REAL, LTP REAL, Value_now REAL, Value_at_cost REAL
                )
            """)
            conn.executemany(
                f"INSERT INTO {table} (Ticker, Instrument, Qty, Purchase_cost, LTP, Value_now, Value_at_cost) VALUES (?,?,?,?,?,?,?)",
                final.values.tolist(),
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
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
