"""Deterministic feature engines for the AI layer.

Everything here is local DB maths — the LLM only narrates these numbers,
never invents them. Each function returns plain dicts that routes.py wraps
with caching + optional LLM narration.
"""

from datetime import date, datetime, timedelta

from . import db

EQUITY_CATEGORIES = {
    "Equity", "Flexicap", "Largecap", "Midcap", "Smallcap", "ELSS",
    "Thematic", "Multi Cap", "Multi cap", "Focused", "Index", "Value", "Growth",
}
DEBT_CATEGORIES = {
    "Debt", "Liquid", "Gilt", "Corporate", "Bond", "Money Market",
    "Arbitrage", "Short Term", "Ultra Short", "Overnight", "Low Duration",
}

NIFTY_BETA = 1.0  # simplifying assumption used ONLY in the scenario simulator
LTCG_EXEMPTION = 125_000  # equity LTCG exemption, FY India
EQUITY_STCG_YEARS = 1      # equity holdings < 1 yr are short-term
DEBT_LTCG_YEARS = 3        # debt holdings >= 3 yr are long-term


def _union_mf():
    conn = db.get_conn()
    try:
        return [dict(r) for r in conn.execute("""
            SELECT f.Fund_Name, f.AMFI_CODE, f.Units, f.Purchase_NAV,
                   f.Purchase_Date, f.Current_NAV, f.NAV_Date,
                   f.Value_at_cost, f.Value_now,
                   COALESCE(s.Category, 'Other') Category
            FROM (SELECT * FROM User1_MF UNION ALL SELECT * FROM User2_MF) f
            LEFT JOIN MF_Summary s ON f.AMFI_CODE = s.AMFI_CODE
        """).fetchall()]
    finally:
        conn.close()


def _union_stocks():
    conn = db.get_conn()
    try:
        return [dict(r) for r in conn.execute("""
            SELECT Ticker, Instrument, Qty, Purchase_cost, LTP,
                   Value_at_cost, Value_now
            FROM (SELECT * FROM User1_Stocks UNION ALL SELECT * FROM User2_Stocks)
        """).fetchall()]
    finally:
        conn.close()


def _mf_grouped():
    rows = _union_mf()
    by_fund = {}
    for r in rows:
        code = r.get("AMFI_CODE")
        key = str(int(code)) if code else (r.get("Fund_Name") or "?")
        g = by_fund.setdefault(key, {
            "key": key, "AMFI_CODE": code, "Fund_Name": r.get("Fund_Name"),
            "Category": r.get("Category") or "Other",
            "invested": 0.0, "now": 0.0, "rows": 0,
            "purchase_dates": [],
        })
        g["invested"] += float(r.get("Value_at_cost") or 0)
        g["now"] += float(r.get("Value_now") or 0)
        g["rows"] += 1
        if r.get("Purchase_Date"):
            g["purchase_dates"].append(r["Purchase_Date"])
    for g in by_fund.values():
        g["ret_pct"] = round(((g["now"] - g["invested"]) / g["invested"]) * 100, 2) if g["invested"] else 0.0
        g["ret_abs"] = round(g["now"] - g["invested"], 2)
        if g["purchase_dates"]:
            g["first_purchase"] = min(g["purchase_dates"])
            g["last_purchase"] = max(g["purchase_dates"])
    return by_fund


def _stocks_grouped():
    rows = _union_stocks()
    by_ticker = {}
    for r in rows:
        t = r.get("Ticker") or "?"
        g = by_ticker.setdefault(t, {
            "Ticker": t, "Instrument": r.get("Instrument") or t,
            "invested": 0.0, "now": 0.0, "qty": 0.0,
            "purchase_cost_list": [],
        })
        g["invested"] += float(r.get("Value_at_cost") or 0)
        g["now"] += float(r.get("Value_now") or 0)
        g["qty"] += float(r.get("Qty") or 0)
    for g in by_ticker.values():
        g["ret_pct"] = round(((g["now"] - g["invested"]) / g["invested"]) * 100, 2) if g["invested"] else 0.0
        g["ret_abs"] = round(g["now"] - g["invested"], 2)
        g["ltp"] = round(g["now"] / g["qty"], 2) if g["qty"] else None
    return by_ticker


def _allocation_split(mf_grouped, st_grouped):
    """Classify corpus into equity / debt / PF buckets."""
    eq_mf = sum(g["now"] for g in mf_grouped.values() if g["Category"] in EQUITY_CATEGORIES)
    debt_mf = sum(g["now"] for g in mf_grouped.values() if g["Category"] in DEBT_CATEGORIES)
    other_mf = sum(
        g["now"] for g in mf_grouped.values()
        if g["Category"] not in EQUITY_CATEGORIES and g["Category"] not in DEBT_CATEGORIES
    )
    equity = eq_mf + sum(g["now"] for g in st_grouped.values())
    total = equity + sum(g["now"] for g in mf_grouped.values())
    return {
        "equity": round(equity, 2),
        "equity_mf": round(eq_mf, 2),
        "debt_mf": round(debt_mf, 2),
        "other_mf": round(other_mf, 2),
        "stocks": round(sum(g["now"] for g in st_grouped.values()), 2),
        "total": round(total, 2),
    }


def holding_deepdive(entity: str, key: str | None) -> dict:
    """I2 — everything we can say about ONE holding, deterministically."""
    if entity == "mf":
        funds = _mf_grouped()
        g = funds.get(key)
        if not g:
            # fall back to a fund-name (non-AMFI) lookup
            g = next((f for f in funds.values() if f["Fund_Name"] == key), None)
            if not g:
                raise KeyError(key)
        peers = [
            f for f in funds.values()
            if f["Category"] == g["Category"] and f["key"] != g["key"]
        ]
        peer_avg = round(
            sum(p["ret_pct"] for p in peers) / len(peers), 2
        ) if peers else None
        today = date.today().isoformat()
        stale = not g.get("last_purchase") or False
        return {
            "entity": "mf",
            "key": g["key"],
            "name": g["Fund_Name"],
            "category": g["Category"],
            "invested": round(g["invested"], 2),
            "now": round(g["now"], 2),
            "ret_pct": g["ret_pct"],
            "ret_abs": g["ret_abs"],
            "rows": g["rows"],
            "first_purchase": g.get("first_purchase"),
            "last_purchase": g.get("last_purchase"),
            "peer_funds": len(peers),
            "peer_avg_ret_pct": peer_avg,
            "vs_peer_pct": round(g["ret_pct"] - peer_avg, 2) if peer_avg is not None else None,
        }
    if entity == "stock":
        stocks = _stocks_grouped()
        t = (key or "").upper()
        g = stocks.get(t) or (stocks.get(key) if key else None)
        if not g:
            raise KeyError(key)
        return {
            "entity": "stock",
            "key": g["Ticker"],
            "name": g["Instrument"],
            "invested": round(g["invested"], 2),
            "now": round(g["now"], 2),
            "ret_pct": g["ret_pct"],
            "ret_abs": g["ret_abs"],
            "qty": round(g["qty"], 2),
            "ltp": g["ltp"],
        }
    raise ValueError("entity must be 'mf' or 'stock'")


def holding_news(limit: int = 8) -> dict:
    """N2 — news specifically for our holdings: top stock tickers and fund
    houses are queried and keyword-scored against the feed."""
    stocks = _stocks_grouped()
    funds = _mf_grouped()

    top_stocks = sorted(stocks.values(), key=lambda s: -s["now"])[:4]
    houses = {}
    for f in funds.values():
        name = f["Fund_Name"] or ""
        house = name.split(" ")[0] if name else ""
        if house:
            houses[house] = houses.get(house, 0) + f["now"]
    top_houses = sorted(houses.items(), key=lambda kv: -kv[1])[:3]

    terms = []
    for s in top_stocks:
        terms.append({"term": s["Ticker"], "label": s["Ticker"], "kind": "stock"})
        if s["Instrument"] and s["Instrument"] != s["Ticker"]:
            terms.append({"term": s["Instrument"], "label": s["Ticker"], "kind": "stock"})
    for house, _v in top_houses:
        terms.append({"term": house, "label": house, "kind": "house"})

    return {
        "terms": terms[:6],
        "reason": "Top holdings by value are watched for news.",
    }


def _pf_value(conn) -> float:
    opening = conn.execute(
        "SELECT COALESCE(SUM(opening_balance), 0) o FROM PF_Accounts"
    ).fetchone()["o"] or 0.0
    contrib = conn.execute(
        "SELECT COALESCE(SUM(employee_contrib + employer_contrib + interest), 0) v "
        "FROM (SELECT * FROM User1_PF UNION ALL SELECT * FROM User2_PF)"
    ).fetchone()["v"] or 0.0
    return float(opening) + float(contrib)


def rebalance_plan() -> dict:
    """I4 — current allocation vs a neutral-suggestion read."""
    mf = _mf_grouped()
    st = _stocks_grouped()
    split = _allocation_split(mf, st)
    mf_total = sum(g["now"] for g in mf.values())

    conn = db.get_conn()
    try:
        pf_value = _pf_value(conn)
    finally:
        conn.close()

    equity = split["equity"]
    debt = split["debt_mf"] + split["other_mf"]
    grand_total = equity + debt + pf_value

    def share(v):
        return round((v / grand_total) * 100, 2) if grand_total else 0.0

    by_cat = {}
    for g in mf.values():
        by_cat[g["Category"]] = by_cat.get(g["Category"], 0.0) + g["now"]
    top_cat, top_cat_val = max(by_cat.items(), key=lambda kv: kv[1]) if by_cat else (None, 0.0)

    return {
        "allocation": {
            "equity_pct": share(equity),
            "debt_pct": share(debt),
            "pf_pct": share(pf_value),
            "equity_inr": round(equity, 2),
            "debt_inr": round(debt, 2),
            "pf_inr": round(pf_value, 2),
            "stock_inr": round(split["stocks"], 2),
        },
        "category_concentration": {
            "top_category": top_cat,
            "top_category_value": round(top_cat_val, 2),
            "top_category_share_pct": round((top_cat_val / mf_total) * 100, 2) if mf_total else 0.0,
        },
        "mf_count": len(mf),
        "stock_count": len(st),
    }


def tax_insights() -> dict:
    """I5 — India-specific tax-aware facts on UNREALIZED gains."""
    mf = _mf_grouped()
    st = _stocks_grouped()
    today = date.today()
    rows = []

    def holding_years(d, fallback=None):
        try:
            return (today - datetime.strptime(d, "%Y-%m-%d").date()).days / 365.0
        except (ValueError, TypeError):
            return fallback

    for g in mf.values():
        if g["Category"] not in (EQUITY_CATEGORIES | DEBT_CATEGORIES):
            continue
        years = holding_years(g.get("last_purchase", ""), None)
        is_equity = g["Category"] in EQUITY_CATEGORIES
        threshold = EQUITY_STCG_YEARS if is_equity else DEBT_LTCG_YEARS
        rows.append({
            "name": g["Fund_Name"],
            "category": g["Category"],
            "gain": g["ret_abs"],
            "held_years": round(years, 1) if years is not None else None,
            "nature": "STCG" if years is not None and years < threshold
                     else "LTCG" if years is not None else "unknown",
            "equity": is_equity,
        })

    for g in st.values():
        rows.append({
            "name": g["Instrument"],
            "category": "Stock",
            "gain": g["ret_abs"],
            "held_years": None,
            "nature": "Stock",
            "equity": True,
        })

    total_gain = sum(r["gain"] for r in rows)
    ltcg_gain = sum(r["gain"] for r in rows if r["nature"] == "LTCG" and r["equity"])
    stcg_gain = sum(r["gain"] for r in rows if r["nature"] == "STCG")
    row_count = len(rows)
    return {
        "rows": rows,
        "summary": {
            "total_unrealized_gain": round(total_gain, 2),
            "equity_ltcg_gain": round(ltcg_gain, 2),
            "equity_ltcg_exemption_remaining": round(max(LTCG_EXEMPTION - ltcg_gain, 0), 2),
            "equity_ltcg_vs_exemption_excess": round(max(ltcg_gain - LTCG_EXEMPTION, 0), 2),
            "stcg_gain": round(stcg_gain, 2),
            "holding_count": row_count,
        },
        "as_of": today.isoformat(),
    }


def retirement_readiness() -> dict:
    """I6 — plain-English readiness from the live 3-bucket plan."""
    import main as _main  # reuse the exact same computation the app serves

    data = _main.retirement()
    cfg = data["config"]
    targets = {
        "cash": cfg.get("cash_amount") or 0,
        "safety": cfg.get("target_soon") or 0,
        "growth": cfg.get("target_later") or 0,
    }
    actual = {b: (data["buckets"].get(b, {}).get("actual") or 0) for b in ("cash", "safety", "growth")}
    corpus = data.get("corpus") or sum(actual.values())

    filled = {}
    for b in ("cash", "safety", "growth"):
        target = targets[b]
        filled[b] = round((actual[b] / target) * 100, 1) if target else None

    readiness = "on-track" if all(
        p is None or p >= 100 for p in filled.values()
    ) else "gap" if any(p is not None and p < 50 for p in filled.values()) else "progress"

    return {
        "readiness": readiness,
        "buckets": [
            {
                "name": b,
                "actual": round(actual[b], 2),
                "target": round(targets[b], 2) if targets[b] else None,
                "filled_pct": filled[b],
            }
            for b in ("cash", "safety", "growth")
        ],
        "years_covered": {
            b: (data["buckets"].get(b, {}).get("years_covered"))
            for b in ("safety", "growth")
        },
        "refill": {
            "action_needed": bool(data.get("refill", {}).get("action_needed")),
            "topup": round(data.get("refill", {}).get("topup_amount") or 0, 2),
            "market": data.get("refill", {}).get("market"),
            "nifty_12m_pct": data.get("refill", {}).get("nifty_12m_pct"),
        },
    }


def risk_scores() -> dict:
    """P1 — explainable risk read built purely from observable data."""
    mf = _mf_grouped()
    st = _stocks_grouped()
    total = sum(g["now"] for g in mf.values()) + sum(g["now"] for g in st.values())
    if total <= 0:
        return {"portfolio_risk": 0, "score": 0, "tier": "low", "drivers": []}

    drivers = []

    # Concentration of the single largest holding
    holdings = list(mf.values()) + list(st.values())
    top = max(holdings, key=lambda h: h["now"])
    top_share = (top["now"] / total) * 100
    if top_share >= 25:
        drivers.append({"factor": "single_holding_concentration", "weight": 2,
                        "note": f"Largest holding is {round(top_share, 1)}% of invested corpus."})

    # Equity-heavy tilt
    mf_total = sum(g["now"] for g in mf.values())
    equity_mf = sum(g["now"] for g in mf.values() if g["Category"] in EQUITY_CATEGORIES)
    equity_share = ((equity_mf + sum(g["now"] for g in st.values())) / total) * 100
    if equity_share >= 80:
        drivers.append({"factor": "equity_tilt", "weight": 1,
                        "note": f"{round(equity_share, 1)}% in equity — high volatility exposure."})

    # Negative-return holders
    losers = [h for h in holdings if h["ret_pct"] < 0]
    if losers:
        worst = min(losers, key=lambda h: h["ret_pct"])
        drivers.append({"factor": "underperforming_holdings", "weight": 1,
                        "note": f"{len(losers)} holdings are underwater; worst is {worst.get('Fund_Name') or worst.get('Ticker')} at {round(worst['ret_pct'], 1)}%."})

    # Stale NAVs
    conn = db.get_conn()
    try:
        stale_cutoff = (date.today() - timedelta(days=5)).isoformat()
        stale_count = conn.execute(
            "SELECT COUNT(*) c FROM (SELECT NAV_Date FROM User1_MF UNION ALL SELECT NAV_Date FROM User2_MF) "
            "WHERE NAV_Date IS NOT NULL AND NAV_Date < ?", (stale_cutoff,)
        ).fetchone()["c"]
    finally:
        conn.close()
    if stale_count:
        drivers.append({"factor": "stale_navs", "weight": 1,
                        "note": f"{stale_count} NAV rows are older than 5 days."})

    score = min(100, sum(d["weight"] for d in drivers) * 12 + (10 if top_share >= 25 else 0))
    tier = "low" if score < 25 else "medium" if score < 55 else "high"
    return {
        "portfolio_risk": score,
        "tier": tier,
        "drivers": drivers,
        "top_holding_share_pct": round(top_share, 2),
        "equity_share_pct": round(equity_share, 2),
        "underwater_count": len(losers),
    }


def scenario_impact(nifty_change_pct: float) -> dict:
    """P2 — what happens to the corpus if NIFTY moves by X% (beta-1 model)."""
    mf = _mf_grouped()
    st = _stocks_grouped()
    equity_value = sum(g["now"] for g in st.values()) + sum(
        g["now"] for g in mf.values() if g["Category"] in EQUITY_CATEGORIES
    )
    debt_value = sum(g["now"] for g in mf.values() if g["Category"] not in EQUITY_CATEGORIES)
    delta = equity_value * (nifty_change_pct / 100.0) * NIFTY_BETA
    total = equity_value + debt_value
    return {
        "assumption": f"NIFTY {nifty_change_pct:+.1f}% × beta {NIFTY_BETA} on equity, debt unchanged",
        "equity_exposure": round(equity_value, 2),
        "debt_exposure": round(debt_value, 2),
        "total_before": round(total, 2),
        "delta_inr": round(delta, 2),
        "delta_pct": round((delta / total) * 100, 2) if total else 0.0,
        "total_after": round(total + delta, 2),
    }


def report_payload() -> dict:
    """C2 — everything needed to render/download a monthly-style report."""
    from . import insights as ai_insights

    metrics = ai_insights.portfolio_metrics()
    rebalance = rebalance_plan()
    tax = tax_insights()
    risk = risk_scores()
    st = _stocks_grouped()
    return {
        "as_of": metrics["as_of"],
        "metrics": metrics,
        "rebalance": rebalance,
        "tax": tax,
        "risk": risk,
        "stocks": {k: {"Instrument": v["Instrument"], "now": v["now"], "ret_pct": v["ret_pct"]} for k, v in st.items()},
    }