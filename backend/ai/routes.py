import logging
import threading
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import cache, config, db, features, insights as ai_insights, llm, news

logger = logging.getLogger("portfolio.ai")

router = APIRouter(prefix="/api/ai", tags=["ai"])

# Serializes LLM calls so a page load's parallel cards (briefing, insights,
# tax, rebalance, risk, …) don't all hit the provider in the same second and
# blow the free-tier RPM cap.
_LLM_LOCK = threading.Lock()
# Global cooldown after an LLM failure: narration is skipped (deterministic
# fallback served) until the timestamp, instead of re-attempting per request.
_cool = {"until": 0.0}

_SYSTEM_BRIEFING = """You are a concise financial news editor for a personal \
Indian investment dashboard. You are given today's India market headlines. \
Summarise them into EXACTLY the most relevant items (max 5), each with a \
one-line "what it means for an Indian retail investor" takeaway. \
Be factual, no speculation, no investment advice. Reply with a JSON object: \
{"brief": "one sentence market mood", "items": [{"title": "...", "link": "...", \
"takeaway": "..."}]}. Do not invent headlines that are not in the input."""

_SYSTEM_INSIGHTS = """You are a sharp quantitative analyst for a personal \
Indian investment portfolio. You receive a JSON snapshot of computed portfolio \
metrics. Write 3-6 concise, specific insights that a retail investor would \
actually act on: concentration risk, stale NAVs, laggards vs gainers, category \
allocation skew, overall return context. Every claim MUST trace to a number in \
the input — never invent figures. Flag risks explicitly. No buy/sell advice, no \
promises. Reply with a JSON object: {"summary": "2-3 sentence headline", \
"insights": [{"title": "...", "detail": "..."}], "risks": [{"title": "...", \
"detail": "..."}]}."""

_SYSTEM_ASK = """You are a personal-finance assistant for an Indian investor. \
You receive a JSON snapshot of their portfolio. Answer their question in plain \
English, citing numbers from the snapshot where relevant. If the question \
cannot be answered from the data, say so and suggest the nearest thing that CAN \
be answered. No buy/sell advice, no future promises. Keep it under 150 words."""

_SYSTEM_DEEP_DIVE = """You are an equity analyst. You receive the computed metrics \
for ONE holding plus (where available) its peer average in the same category. \
Explain in 2-4 sentences what the numbers say: is it outperforming peers, how long \
held, any red flags. Every claim must come from the input. No buy/sell advice. \
Reply as a JSON object: {"summary": "...", "points": ["...", "..."]}."""

_SYSTEM_REBALANCE = """You are a portfolio strategist. You receive computed \
allocation facts of a personal Indian portfolio. Give 2-4 objective observations \
about the split (equity/debt/PF), category concentration, and what a careful \
investor might weigh. Cite numbers from the input only. No buy/sell advice. \
Reply as a JSON object: {"summary": "...", "observations": ["...", "..."]}."""

_SYSTEM_TAX = """You are familiar with Indian mutual fund taxation. You receive \
computed unrealised gains and holding periods. State, carefully and generically: \
which gains fall under STCG vs LTCG, and flag any equity LTCG exposure above the \
₹1.25L/year exemption. Add one line that this is not tax advice. Cite only \
numbers from the input. Reply as JSON: {"summary": "...", "points": ["...", "..."]}."""

_SYSTEM_RETIREMENT = """You are a retirement planner. You receive the 3-bucket \
readiness snapshot (cash/safety/growth), years covered, and the refill signal. \
Give a plain-English assessment of whether the plan is on track, what the gaps \
are, and the refill implication. Cite only numbers from the input. Reply as a \
JSON object: {"summary": "...", "points": ["...", "..."]}."""

_SYSTEM_RISK = """You are a risk analyst. You receive explainable risk drivers and \
a portfolio risk score (0-100). Explain the score in one paragraph, walking \
through each driver, and what it would take to lower it. Cite only numbers from \
the input. Reply as a JSON object: {"summary": "...", "points": ["...", "..."]}."""

_SYSTEM_SCENARIO = """You are a scenario analyst. You receive a deterministic \
market-shock simulation (NIFTY move applied to equity exposure at beta-1). \
Explain the portfolio impact in plain English, note the simplifying assumption, \
and stress that this is not a forecast. Reply as JSON: {"summary": "...", \
"points": ["...", "..."]}."""

_SYSTEM_HOLDING_NEWS = """You are an analyst screening headlines for a personal \
portfolio. Given news items scored for relevance to specific holdings, pick at \
most 3 items a retail investor should actually know, each with a one-line why. \
Only use items present in the input. Reply as JSON: {"items": [{"title": "...", \
"link": "...", "why": "..."}]}."""


def _cache_key(name: str) -> str:
    return f"ai:{name}:{db.active_db()}"


def _not_configured(payload: dict) -> dict:
    payload["ai_enabled"] = False
    return payload


@router.get("/status")
def ai_status():
    return {
        "ai_enabled": config.enabled(),
        "model": config.model() if config.enabled() else None,
    }


@router.get("/briefing")
def briefing():
    """N1 — today's India market news, distilled by the LLM."""
    cache_key = _cache_key("briefing")
    cached = cache.get(cache_key, config.BRIEFING_TTL)
    if cached:
        return cached

    try:
        headlines = news.fetch_news()
    except Exception as exc:  # news infra failure should not 500 the dashboard
        logger.warning("News fetch failed: %s", exc)
        return _not_configured({"headlines": [], "brief": None, "items": []})

    if not config.enabled():
        return _not_configured({
            "headlines": headlines[:6],
            "brief": None,
            "items": [
                {"title": h["title"], "link": h["url"], "takeaway": ""}
                for h in headlines[:6]
            ],
        })

    payload = {
        "headlines": headlines[:6],
        "brief": None,
        "items": [],
    }
    narrative = _narrate(
        _SYSTEM_BRIEFING,
        f"Today's India market headlines:\n{news.news_context(headlines)}",
        max_tokens=900,
    )
    if narrative:
        payload["brief"] = narrative.get("brief")
        payload["items"] = narrative.get("items", [])
    else:
        payload["items"] = [
            {"title": h["title"], "link": h["url"], "takeaway": ""}
            for h in headlines[:6]
        ]

    payload["ai_enabled"] = narrative is not None
    return _store(cache_key, payload, narrated=narrative is not None, success_ttl=config.BRIEFING_TTL)


@router.get("/insights")
def insights():
    """I1 — deterministic metrics narrated by the LLM."""
    cache_key = _cache_key("insights")
    cached = cache.get(cache_key, config.INSIGHTS_TTL)
    if cached:
        return cached

    metrics = ai_insights.portfolio_metrics()

    if not config.enabled():
        return _not_configured({
            "metrics": metrics,
            "summary": None,
            "insights": [],
            "risks": [],
        })

    payload = {"metrics": metrics, "summary": None, "insights": [], "risks": []}
    narrative = _narrate(
        _SYSTEM_INSIGHTS,
        ai_insights.metrics_context(metrics),
        max_tokens=1400,
    )
    if narrative:
        payload["summary"] = narrative.get("summary")
        payload["insights"] = narrative.get("insights", [])
        payload["risks"] = narrative.get("risks", [])

    payload["ai_enabled"] = narrative is not None
    return _store(cache_key, payload, narrated=narrative is not None)


class AskRequest(BaseModel):
    question: str


@router.post("/ask")
def ask(body: AskRequest):
    """I3 — natural-language Q&A over the portfolio."""
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required")
    if not config.enabled():
        raise HTTPException(
            status_code=503,
            detail="AI not configured — set GEMINI_API_KEY in backend/.env",
        )

    metrics = ai_insights.portfolio_metrics()
    context = ai_insights.metrics_context(metrics)
    try:
        answer = llm.complete(
            _SYSTEM_ASK,
            f"Portfolio snapshot:\n{context}\n\nQuestion: {question}",
            max_tokens=700,
        )
    except llm.LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"question": question, "answer": answer}


def _narrate(system: str, context: str, *, max_tokens: int = 900) -> dict | None:
    """LLM narrative with graceful fallback — returns None when AI is off,
    on a cooldown, or the call fails. One call at a time across the app."""
    if not config.enabled():
        return None
    if time.time() < _cool["until"]:
        return None
    with _LLM_LOCK:
        if time.time() < _cool["until"]:  # re-check: maybe failed while queued
            return None
        try:
            return llm.complete_json(system, context, max_tokens=max_tokens)
        except llm.LLMError as exc:
            _cool["until"] = time.time() + config.LLM_COOLDOWN_S
            logger.warning(
                "LLM narration failed (%s); narration paused for %ss, serving deterministic facts",
                exc, config.LLM_COOLDOWN_S,
            )
            return None


def _store(key: str, payload: dict, *, narrated: bool, success_ttl: int | None = None) -> dict:
    """Cache with a long TTL only when narration succeeded; a deterministic
    fallback is cached briefly so a provider outage doesn't lock the dashboard
    into degraded mode for hours."""
    ttl = (success_ttl if success_ttl is not None else config.INSIGHTS_TTL) if narrated else config.FALLBACK_TTL
    cache.set(key, payload, ttl=ttl)
    return payload


# ── I2: Holding deep-dive ────────────────────────────────────────────────────

@router.get("/holding/{entity}/{key:path}")
def holding(entity: str, key: str):
    try:
        metrics = features.holding_deepdive(entity, key)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"{entity} '{key}' not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    payload = {"metrics": metrics}
    narrative = _narrate(
        _SYSTEM_DEEP_DIVE,
        ai_insights.metrics_context(metrics),
        max_tokens=600,
    )
    if narrative:
        payload.update(narrative)
    payload["ai_enabled"] = narrative is not None
    return payload


# ── N2: Holdings-triggered news ──────────────────────────────────────────────

@router.get("/holding-news")
def holding_news():
    """News scored against our actual holdings (top tickers + fund houses)."""
    cache_key = _cache_key("holding-news")
    cached = cache.get(cache_key, config.BRIEFING_TTL)
    if cached:
        return cached

    plan = features.holding_news()
    if not plan["terms"]:
        return _not_configured({"terms": [], "items": [], "ai_enabled": False, "matches": []})

    from . import news as news_mod

    gathered: list[dict] = []
    for term in plan["terms"]:
        try:
            q = f'India stock market "{term["term"]}"'
            items = news_mod._fetch(f"https://news.google.com/rss/search?q={q.replace(' ', '%20')}&hl=en-IN&gl=IN&ceid=IN:en")
            for it in items:
                it["related"] = term["label"]
                gathered.append(it)
        except Exception:
            continue

    # de-dupe + score by term matches in the title
    seen = set()
    scored = []
    for it in gathered:
        low = it["title"].lower()
        hits = [t["label"] for t in plan["terms"] if t["label"].lower() in low]
        if not hits:
            continue
        key = low
        if key in seen:
            continue
        seen.add(key)
        it["matched_terms"] = hits
        scored.append(it)
    scored.sort(key=lambda it: len(it["matched_terms"]), reverse=True)
    scored = scored[:12]

    payload = {
        "terms": plan["terms"],
        "matches": scored,
        "items": [
            {"title": it["title"], "link": it["url"], "related": it["related"], "matched_terms": it["matched_terms"]}
            for it in scored[:6]
        ],
        "ai_enabled": False,
    }

    narrative = _narrate(_SYSTEM_HOLDING_NEWS, news_mod.news_context(scored[:8]))
    if narrative:
        payload["items"] = narrative.get("items", []) or payload["items"]
        payload["ai_enabled"] = True
    return _store(cache_key, payload, narrated=narrative is not None, success_ttl=config.BRIEFING_TTL)


# ── I4: Rebalancing ──────────────────────────────────────────────────────────

@router.get("/rebalance")
def rebalance():
    cache_key = _cache_key("rebalance")
    cached = cache.get(cache_key, config.INSIGHTS_TTL)
    if cached:
        return cached
    payload = {"plan": features.rebalance_plan(), "narrative": None}
    narrative = _narrate(_SYSTEM_REBALANCE, ai_insights.metrics_context(payload["plan"]))
    if narrative:
        payload["narrative"] = narrative
    payload["ai_enabled"] = narrative is not None
    return _store(cache_key, payload, narrated=narrative is not None)


# ── I5: Tax-aware insights ───────────────────────────────────────────────────

@router.get("/tax")
def tax():
    cache_key = _cache_key("tax")
    cached = cache.get(cache_key, config.INSIGHTS_TTL)
    if cached:
        return cached
    data = features.tax_insights()
    payload = {**data, "narrative": None}
    narrative = _narrate(_SYSTEM_TAX, ai_insights.metrics_context(data))
    if narrative:
        payload["narrative"] = narrative
    payload["ai_enabled"] = narrative is not None
    return _store(cache_key, payload, narrated=narrative is not None)


# ── I6: Retirement readiness narrative ──────────────────────────────────────

@router.get("/retirement")
def retirement_narrative():
    cache_key = _cache_key("retirement-narrative")
    cached = cache.get(cache_key, config.INSIGHTS_TTL)
    if cached:
        return cached
    data = features.retirement_readiness()
    payload = {**data, "narrative": None}
    narrative = _narrate(_SYSTEM_RETIREMENT, ai_insights.metrics_context(data))
    if narrative:
        payload["narrative"] = narrative
    payload["ai_enabled"] = narrative is not None
    return _store(cache_key, payload, narrated=narrative is not None)


# ── P1: Risk / trend scoring ────────────────────────────────────────────────

@router.get("/risk")
def risk():
    cache_key = _cache_key("risk")
    cached = cache.get(cache_key, config.INSIGHTS_TTL)
    if cached:
        return cached
    data = features.risk_scores()
    payload = {**data, "narrative": None}
    narrative = _narrate(_SYSTEM_RISK, ai_insights.metrics_context(data))
    if narrative:
        payload["narrative"] = narrative
    payload["ai_enabled"] = narrative is not None
    return _store(cache_key, payload, narrated=narrative is not None)


# ── P2: Scenario simulator ──────────────────────────────────────────────────

class ScenarioRequest(BaseModel):
    nifty_change_pct: float


@router.post("/scenario")
def scenario(body: ScenarioRequest):
    change = body.nifty_change_pct
    if not -30 <= change <= 30:
        raise HTTPException(status_code=400, detail="nifty_change_pct must be between -30 and 30")
    data = features.scenario_impact(change)
    narrative = _narrate(_SYSTEM_SCENARIO, ai_insights.metrics_context(data))
    return {
        "sim": data,
        "summary": narrative.get("summary") if narrative else None,
        "points": narrative.get("points", []) if narrative else [],
        "ai_enabled": narrative is not None,
    }


# ── C2: Monthly report ──────────────────────────────────────────────────────

@router.get("/report")
def report():
    cache_key = _cache_key("report")
    cached = cache.get(cache_key, config.INSIGHTS_TTL)
    if cached:
        return cached
    from . import insights as ai_insights_mod
    data = features.report_payload()
    narrative = _narrate(
        _SYSTEM_INSIGHTS,
        ai_insights_mod.metrics_context(data["metrics"]),
        max_tokens=1400,
    )
    payload = {
        "as_of": data["as_of"],
        "metrics": data["metrics"],
        "rebalance": data["rebalance"],
        "tax": data["tax"],
        "risk": data["risk"],
        "stocks": data["stocks"],
        "narrative": narrative,
        "ai_enabled": narrative is not None,
    }
    return _store(cache_key, payload, narrated=narrative is not None)