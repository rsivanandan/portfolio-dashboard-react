import sqlite3
import pytest
import main  # noqa: F401  (ensures app + global auth deps are wired)
from ai import config, llm, news


def _no_key(monkeypatch):
    monkeypatch.setattr(config, "api_key", lambda: "")


def _fake_key(monkeypatch):
    monkeypatch.setattr(config, "api_key", lambda: "test-key")


@pytest.fixture(autouse=True)
def _reset_ai_state():
    """Clear narration cooldown between tests — it is global state."""
    from ai import routes as ai_routes

    ai_routes._cool["until"] = 0.0
    yield
    ai_routes._cool["until"] = 0.0


FAKE_HEADLINES = [
    {
        "title": "Nifty touches fresh record high",
        "url": "https://example.com/nifty",
        "source": "Test Feed",
        "published": "2026-09-05T10:00:00+05:30",
    },
]


def test_status_disabled(client, monkeypatch):
    _no_key(monkeypatch)
    r = client.get("/api/ai/status")
    assert r.status_code == 200
    assert r.json()["ai_enabled"] is False


def test_status_enabled(client, monkeypatch):
    _fake_key(monkeypatch)
    r = client.get("/api/ai/status")
    assert r.status_code == 200
    body = r.json()
    assert body["ai_enabled"] is True
    assert body["model"]


def test_briefing_degraded_without_key(client, monkeypatch):
    _no_key(monkeypatch)
    monkeypatch.setattr(news, "fetch_news", lambda limit=12: FAKE_HEADLINES)
    r = client.get("/api/ai/briefing")
    assert r.status_code == 200
    body = r.json()
    assert body["ai_enabled"] is False
    assert body["items"][0]["title"] == "Nifty touches fresh record high"


def test_briefing_with_llm(client, monkeypatch):
    _fake_key(monkeypatch)
    monkeypatch.setattr(news, "fetch_news", lambda limit=12: FAKE_HEADLINES)
    monkeypatch.setattr(
        llm,
        "complete_json",
        lambda *a, **k: {
            "brief": "Markets are buoyant.",
            "items": [{"title": "Nifty record", "link": "https://x", "takeaway": "Optimism"}],
        },
    )
    r = client.get("/api/ai/briefing")
    assert r.status_code == 200
    body = r.json()
    assert body["ai_enabled"] is True
    assert body["brief"] == "Markets are buoyant."
    assert body["items"][0]["takeaway"] == "Optimism"


def test_briefing_survives_network_failure(client, monkeypatch):
    _no_key(monkeypatch)

    def boom(limit=12):
        raise RuntimeError("network down")

    monkeypatch.setattr(news, "fetch_news", boom)
    r = client.get("/api/ai/briefing")
    assert r.status_code == 200
    assert r.json()["items"] == []


def test_insights_degraded_without_key(client, monkeypatch):
    _no_key(monkeypatch)
    r = client.get("/api/ai/insights")
    assert r.status_code == 200
    body = r.json()
    assert body["ai_enabled"] is False
    m = body["metrics"]
    assert m["totals"]["total_invested"] > 0
    assert m["totals"]["total_now"] > 0
    assert m["overall_return_pct"] is not None
    assert m["top_funds"]
    assert m["top_stocks"]
    # 3 MF purchase rows exist (2 named + 1 junk/unnamed) but only 2 funds
    assert m["mf_count"] == 2


def test_mf_count_counts_funds_not_transactions(tmp_path, monkeypatch):
    """SIP instalments of the same scheme must count as ONE fund, not many."""
    import sqlite3
    import main as _main
    from ai.insights import portfolio_metrics
    from tests.conftest import _seed_db

    db = str(tmp_path / "t.db")
    conn = sqlite3.connect(db)
    _seed_db(conn)
    # Two more purchases of the VERY SAME fund (via user2's folio) + a new fund
    conn.execute("""
        INSERT INTO User2_MF (Fund_House, Fund_Name, Folio_Number, AMFI_CODE,
                                Units, Purchase_NAV, Purchase_Date, Current_NAV,
                                Value_at_cost, Value_now)
        VALUES ('ICICI', 'ICICI Bluechip', '9999', 200456, 10, '41', '2026-01-01', 45.0, 410, 450)
    """)
    conn.execute("""
        INSERT INTO User1_MF (Fund_House, Fund_Name, Folio_Number, AMFI_CODE,
                                Units, Purchase_NAV, Purchase_Date, Current_NAV,
                                Value_at_cost, Value_now)
        VALUES ('SBI', 'SBI Small Cap', '7777', 300789, 20, '80', '2025-06-01', 95.0, 1600, 1900)
    """)
    conn.commit()
    conn.close()

    monkeypatch.setattr(_main, "DB_PATH", db)
    metrics = portfolio_metrics()
    assert metrics["mf_count"] == 3  # HDFC + ICICI (3 purchases merged) + SBI
    assert len(metrics["top_funds"]) == 3
    # totalled per fund, so the merged fund's value = both instalments
    icici = next(f for f in metrics["top_funds"] if f["name"] == "ICICI Bluechip")
    assert icici["value"] == 4500 + 450


def test_insights_with_llm(client, monkeypatch):
    _fake_key(monkeypatch)
    monkeypatch.setattr(
        llm,
        "complete_json",
        lambda *a, **k: {
            "summary": "Portfolio gained ground.",
            "insights": [{"title": "Concentration", "detail": "Top fund is 60%."}],
            "risks": [{"title": "Stale NAV", "detail": "One fund stale."}],
        },
    )
    r = client.get("/api/ai/insights")
    assert r.status_code == 200
    body = r.json()
    assert body["summary"] == "Portfolio gained ground."
    assert body["insights"][0]["title"] == "Concentration"
    assert body["risks"][0]["title"] == "Stale NAV"


def test_ask_with_llm(client, monkeypatch):
    _fake_key(monkeypatch)
    monkeypatch.setattr(llm, "complete", lambda *a, **k: "Total invested is above zero.")
    r = client.post("/api/ai/ask", json={"question": "What did I invest?"})
    assert r.status_code == 200
    body = r.json()
    assert body["question"] == "What did I invest?"
    assert "invested" in body["answer"]


def test_ask_requires_question(client, monkeypatch):
    _fake_key(monkeypatch)
    r = client.post("/api/ai/ask", json={"question": "   "})
    assert r.status_code == 400


def test_ask_rejects_when_disabled(client, monkeypatch):
    _no_key(monkeypatch)
    r = client.post("/api/ai/ask", json={"question": "anything"})
    assert r.status_code == 503


def test_json_extraction_handles_fences():
    from ai.llm import _extract_json

    assert _extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert _extract_json('Here you go: {"a": 1} trailing') == {"a": 1}
    assert _extract_json("not json") is None


# ── I2 / I4 / I5 / I6 / P1 / P2 / C2 / N2 ──────────────────────────────────


def test_holding_deepdive_mf(client, monkeypatch):
    _no_key(monkeypatch)
    r = client.get("/api/ai/holding/mf/100123")
    assert r.status_code == 200
    body = r.json()
    assert body["metrics"]["entity"] == "mf"
    assert body["metrics"]["category"] == "Equity"
    assert body["metrics"]["invested"] > 0
    assert body["metrics"]["ret_pct"] is not None


def test_holding_deepdive_stock(client, monkeypatch):
    _no_key(monkeypatch)
    r = client.get("/api/ai/holding/stock/INFY")
    assert r.status_code == 200
    body = r.json()
    assert body["metrics"]["entity"] == "stock"
    assert body["metrics"]["key"] == "INFY"
    assert body["metrics"]["invested"] > 0


def test_holding_deepdive_missing(client, monkeypatch):
    _no_key(monkeypatch)
    assert client.get("/api/ai/holding/mf/999999").status_code == 404
    assert client.get("/api/ai/holding/stock/NOPE").status_code == 404
    assert client.get("/api/ai/holding/bogus/1").status_code == 400


def test_rebalance_deterministic(client, monkeypatch):
    _no_key(monkeypatch)
    r = client.get("/api/ai/rebalance")
    assert r.status_code == 200
    body = r.json()
    plan = body["plan"]["allocation"]
    assert {"equity_pct", "debt_pct", "pf_pct", "equity_inr", "debt_inr", "pf_inr"} <= set(plan)
    assert body["ai_enabled"] is False


def test_tax_insights_deterministic(client, monkeypatch):
    _no_key(monkeypatch)
    r = client.get("/api/ai/tax")
    assert r.status_code == 200
    body = r.json()
    assert body["summary"]["total_unrealized_gain"] is not None
    assert body["rows"]


def test_retirement_narrative_deterministic(client, monkeypatch):
    _no_key(monkeypatch)
    r = client.get("/api/ai/retirement")
    assert r.status_code == 200
    body = r.json()
    assert body["readiness"] in ("on-track", "gap", "progress")
    assert len(body["buckets"]) == 3


def test_risk_scores_deterministic(client, monkeypatch):
    _no_key(monkeypatch)
    r = client.get("/api/ai/risk")
    assert r.status_code == 200
    body = r.json()
    assert 0 <= body["portfolio_risk"] <= 100
    assert body["tier"] in ("low", "medium", "high")


def test_scenario_deterministic(client, monkeypatch):
    _no_key(monkeypatch)
    r = client.post("/api/ai/scenario", json={"nifty_change_pct": -10})
    assert r.status_code == 200
    body = r.json()
    sim = body["sim"]
    assert sim["delta_inr"] < 0
    assert abs(sim["delta_inr"] / sim["equity_exposure"] * 100 - (-10)) < 1
    assert client.post("/api/ai/scenario", json={"nifty_change_pct": 99}).status_code == 400


def test_report_deterministic(client, monkeypatch):
    _no_key(monkeypatch)
    r = client.get("/api/ai/report")
    assert r.status_code == 200
    body = r.json()
    assert body["as_of"]
    assert body["metrics"]["totals"]["total_now"] > 0
    assert body["risk"]["portfolio_risk"] is not None


def test_holding_news_with_mocked_feed(client, monkeypatch):
    _no_key(monkeypatch)

    def fake_fetch(url):
        assert "INFY" in url
        return [{
            "title": "Infosys (INFY) beats estimates",
            "url": "https://x",
            "source": "Test",
            "published": "2026-09-05T10:00:00+05:30",
        }]

    monkeypatch.setattr("ai.news._fetch", fake_fetch)
    r = client.get("/api/ai/holding-news")
    assert r.status_code == 200
    body = r.json()
    assert any("Infosys" in m["title"] for m in body["matches"])
    assert any(len(m.get("matched_terms", [])) >= 1 for m in body["matches"])


def test_narrative_shape_on_grouped_endpoints(client, monkeypatch):
    _fake_key(monkeypatch)
    monkeypatch.setattr(llm, "complete_json", lambda *a, **k: {"summary": "S", "points": ["P1"]})
    for path in ("/api/ai/rebalance", "/api/ai/tax", "/api/ai/retirement", "/api/ai/risk"):
        r = client.get(path)
        assert r.status_code == 200, path
        body = r.json()
        assert body["ai_enabled"] is True, path
        assert body["narrative"]["summary"] == "S", path
        assert body["narrative"]["points"] == ["P1"], path


def test_holding_news_with_llm(client, monkeypatch):
    _fake_key(monkeypatch)

    def fake_fetch(url):
        return [{
            "title": "Infosys (INFY) beats estimates",
            "url": "https://x",
            "source": "Test",
            "published": "2026-09-05T10:00:00+05:30",
        }]

    monkeypatch.setattr("ai.news._fetch", fake_fetch)
    monkeypatch.setattr(
        llm,
        "complete_json",
        lambda *a, **k: {"items": [{"title": "Infosys (INFY) beats estimates", "link": "https://x", "why": "Growth"}]},
    )
    r = client.get("/api/ai/holding-news")
    assert r.status_code == 200
    body = r.json()
    assert body["ai_enabled"] is True
    assert body["items"][0]["why"] == "Growth"

def test_ai_endpoints_survive_stocks_schema_drift(client):
    """Regression (2026-09-12): the live DB's User1_Stocks carries a legacy
    `id` PRIMARY KEY that User2_Stocks never got — a real drift found in
    production. `_union_stocks()`-style helpers used to do
    `SELECT * FROM User1_Stocks UNION ALL SELECT * FROM User2_Stocks`, which
    raises sqlite3.OperationalError ("SELECTs to the left and right of UNION
    ALL do not have the same number of result columns") the moment the two
    tables' column counts differ. On the live app this took down every AI
    endpoint that touches stocks (insights, holding-news, rebalance, tax,
    risk, report) while the news-only briefing kept working — which is
    exactly what made it look like "only the first AI tab has data" rather
    than an obvious 500. Both offending queries (ai/features.py and
    ai/insights.py) now list columns explicitly instead of `SELECT *`; this
    test recreates the asymmetry so neither can regress silently."""
    conn = sqlite3.connect(main.DB_PATH)
    conn.execute("ALTER TABLE User1_Stocks ADD COLUMN id INTEGER")
    conn.commit()
    conn.close()

    for ep in (
        "/api/ai/insights", "/api/ai/holding-news", "/api/ai/rebalance",
        "/api/ai/tax", "/api/ai/risk", "/api/ai/report",
    ):
        r = client.get(ep)
        assert r.status_code == 200, f"{ep} failed: {r.text}"
