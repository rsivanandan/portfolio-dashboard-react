import json
from datetime import date, datetime, timedelta

from . import db


def _pf_opening(conn, owner: str) -> float:
    row = conn.execute(
        "SELECT COALESCE(SUM(opening_balance), 0) opening FROM PF_Accounts WHERE user = ?",
        (owner,),
    ).fetchone()
    return row["opening"] or 0.0


def portfolio_metrics() -> dict:
    """Deterministic facts about the portfolio — every number here is computed
    locally from the DB. The LLM only narrates these; it invents nothing."""
    conn = db.get_conn()
    try:
        mf = [dict(r) for r in conn.execute("""
            SELECT f.Fund_Name, f.Units, f.Folio_Number, f.Purchase_Date,
                   f.Purchase_NAV, f.Current_NAV, f.NAV_Date,
                   f.AMFI_CODE, f.Value_at_cost, f.Value_now,
                   COALESCE(s.Category, 'Other') Category
            FROM (SELECT * FROM User1_MF UNION ALL SELECT * FROM User2_MF) f
            LEFT JOIN MF_Summary s ON f.AMFI_CODE = s.AMFI_CODE
        """).fetchall()]

        stocks = [dict(r) for r in conn.execute("""
            SELECT Ticker, Instrument, Qty, Purchase_cost, LTP,
                   Value_at_cost, Value_now
            FROM (SELECT * FROM User1_Stocks UNION ALL SELECT * FROM User2_Stocks)
        """).fetchall()]

        pf_mf = conn.execute(
            "SELECT COALESCE(SUM(employee_contrib + employer_contrib), 0) ac, "
            "COALESCE(SUM(interest), 0) int FROM User1_PF"
        ).fetchone()
        pf2 = conn.execute(
            "SELECT COALESCE(SUM(employee_contrib + employer_contrib), 0) ac, "
            "COALESCE(SUM(interest), 0) int FROM User2_PF"
        ).fetchone()
        pf_opening = _pf_opening(conn, "user1") + _pf_opening(conn, "user2")
    finally:
        conn.close()

    def total(field, default=0.0):
        return sum(float(r.get(field) or 0) for r in mf) + \
            sum(float(r.get(field) or 0) for r in stocks)

    mf_invested = sum(float(r.get("Value_at_cost") or 0) for r in mf)
    mf_now = sum(float(r.get("Value_now") or 0) for r in mf)
    st_invested = sum(float(r.get("Value_at_cost") or 0) for r in stocks)
    st_now = sum(float(r.get("Value_now") or 0) for r in stocks)
    pf_ac = float(pf_mf["ac"] or 0) + float(pf2["ac"] or 0)
    pf_int = float(pf_mf["int"] or 0) + float(pf2["int"] or 0)
    pf_invested = pf_opening + pf_ac
    pf_now = pf_opening + pf_ac + pf_int

    all_invested = mf_invested + st_invested + pf_invested
    all_now = mf_now + st_now + pf_now

    def pct_return(inv, now):
        return round(((now - inv) / inv) * 100, 2) if inv else 0.0

    # Group MF purchase rows by fund (AMFI code, falling back to name) so a
    # scheme with many SIP instalments counts as ONE holding. Without this a
    # count of 82 transactions would be misread as 82 mutual funds.
    groups = {}
    for r in mf:
        if not r.get("Fund_Name"):
            continue  # unnamed rows are junk, not funds
        key = r.get("AMFI_CODE") if r.get("AMFI_CODE") is not None else f"name:{r.get('Fund_Name')}"
        if key not in groups:
            groups[key] = dict(r)
            groups[key]["Value_at_cost"] = float(r.get("Value_at_cost") or 0)
            groups[key]["Value_now"] = float(r.get("Value_now") or 0)
            groups[key]["Units"] = float(r.get("Units") or 0)
            groups[key]["current"] = r
        else:
            g = groups[key]
            g["Value_at_cost"] += float(r.get("Value_at_cost") or 0)
            g["Value_now"] += float(r.get("Value_now") or 0)
            g["Units"] += float(r.get("Units") or 0)
    mf_g = list(groups.values())

    # Per-fund holding maths
    for r in mf_g:
        vc = float(r.get("Value_at_cost") or 0)
        vn = float(r.get("Value_now") or 0)
        r["_ret_pct"] = round(((vn - vc) / vc) * 100, 2) if vc else 0.0
        r["_ret_abs"] = round(vn - vc, 2)

    for r in stocks:
        vc = float(r.get("Value_at_cost") or 0)
        vn = float(r.get("Value_now") or 0)
        r["_ret_pct"] = round(((vn - vc) / vc) * 100, 2) if vc else 0.0
        r["_ret_abs"] = round(vn - vc, 2)

    funded = [r for r in mf_g if float(r.get("Value_now") or 0) > 0] + \
        [r for r in stocks if float(r.get("Value_now") or 0) > 0]

    standings = sorted(
        funded, key=lambda r: r["_ret_pct"], reverse=True
    )
    biggest = standings[:3]
    laggards = standings[-4:][::-1]

    mfv = sorted(mf_g, key=lambda r: float(r.get("Value_now") or 0), reverse=True)
    stv = sorted(stocks, key=lambda r: float(r.get("Value_now") or 0), reverse=True)
    top_mf = mfv[0] if mfv else None
    top_stock = stv[0] if stv else None

    stale_cutoff = (date.today() - timedelta(days=5)).isoformat()
    stale = list(dict.fromkeys(
        r["Fund_Name"]
        for r in mf_g
        if r.get("NAV_Date") and str(r["NAV_Date"]) < stale_cutoff
    ))

    # Category concentration (MF only)
    cat_value = {}
    for r in mf_g:
        cat = r.get("Category") or "Other"
        cat_value[cat] = cat_value.get(cat, 0.0) + float(r.get("Value_now") or 0)

    return {
        "as_of": date.today().isoformat(),
        "totals": {
            "mf_invested": round(mf_invested, 2),
            "mf_now": round(mf_now, 2),
            "stocks_invested": round(st_invested, 2),
            "stocks_now": round(st_now, 2),
            "pf_invested": round(pf_invested, 2),
            "pf_now": round(pf_now, 2),
            "total_invested": round(all_invested, 2),
            "total_now": round(all_now, 2),
        },
        "overall_return_pct": pct_return(all_invested, all_now),
        "mf_count": len(mf_g),
        "stock_count": len(stocks),
        "top_funds": [
            {"name": r["Fund_Name"], "value": float(r.get("Value_now") or 0),
             "ret_pct": r["_ret_pct"]}
            for r in mfv[:3]
        ],
        "top_stocks": [
            {"ticker": r.get("Ticker"), "value": float(r.get("Value_now") or 0),
             "ret_pct": r["_ret_pct"]}
            for r in stv[:5]
        ],
        "biggest_gainers": [
            {"name": r.get("Fund_Name") or r.get("Ticker"), "ret_pct": r["_ret_pct"]}
            for r in biggest
        ],
        "biggest_laggards": [
            {"name": r.get("Fund_Name") or r.get("Ticker"), "ret_pct": r["_ret_pct"]}
            for r in laggards
        ],
        "stale_nav_count": len(stale),
        "stale_nav_funds": stale[:5],
        "category_allocation": {
            cat: round(val, 2) for cat, val in sorted(cat_value.items(), key=lambda kv: -kv[1])
        },
        "top_holding_share_pct": round(
            (float(top_mf.get("Value_now") or 0) / mf_now) * 100, 2
        ) if top_mf and mf_now else 0.0,
    }


def metrics_context(metrics: dict) -> str:
    """Compact context block sent to the LLM."""
    return json.dumps(metrics, indent=None, ensure_ascii=False)