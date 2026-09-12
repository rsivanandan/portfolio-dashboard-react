# Samridhi — AI Features Plan

Goal: bring AI into the portfolio dashboard. All features are new FastAPI
endpoints + React components built on top of data that already exists in the
SQLite database — no schema changes required.

## Status

- ✅ **M1 (done)** — N1 news briefing + I1 insights + I3 Q&A + C1 chat widget,
  backend & frontend, degradation-safe, tests passing (108 backend / 26 frontend).
- ✅ **M2 (done)** — I2 holding deep-dive + N2/N3 holding news strip
  (`/api/ai/holding-news`, `/api/ai/holding/{entity}/{key}`) wired into Holdings.
- ✅ **M3 (done)** — I4 rebalance, I5 tax, I6 retirement narrative, P1 risk,
  P2 scenario simulator, C2 monthly report (all backend + Dashboard/Retirement UI,
  `.txt` download; print-to-PDF via browser when needed).
- ⏳ Setup: copy `backend/.env.example` → `backend/.env` and add your free
  Gemini key (aistudio.google.com) to activate LLM narration; without it
  everything runs in deterministic degraded mode (all metrics still shown).

## 1. News & Awareness

| # | Feature | What it does | Effort |
|---|---------|--------------|--------|
| N1 | **Daily India market briefing** | Auto-pull India finance headlines (RSS: Economic Times, Moneycontrol, Google News) → LLM summarizes into a 5-bullet "Today in markets" card on Dashboard | Low |
| N2 | **Holdings-triggered news** | Feed is filtered/scored for relevance against actual stock tickers (`.NS`) and MF fund houses (HDFC, SBI, ICICI…). Only news touching the portfolio bubbles up | Low-Med |
| N3 | **News alert banners** | A holding with breaking news gets a highlighted strip on Dashboard/Holdings with 1-line "what it means" | Med |

## 2. Portfolio Insights (highest priority)

| # | Feature | What it does | Effort |
|---|---------|--------------|--------|
| I1 | **AI Insights panel** | Backend computes deterministic metrics (concentration %, sector exposure, XIRR by fund, stale NAVs, underperformers vs category) → LLM turns them into 3–5 sharp insights + flagged risks | Med |
| I2 | **Holding deep-dive** | For each significant holding: why it's up/down, benchmarks vs category average (`MF_Summary.category`), holding-period return | Med |
| I3 | **Natural-language Q&A** | "How much did I invest in 2023?", "What's my HDFC SBI exposure?", "Should I redeem X?" — backend converts portfolio to structured text context, LLM answers with numbers | Med |
| I4 | **Rebalancing suggestions** | Rule-based allocation targets + LLM explanation ("you're 68% equity vs 30% target…") | Med |
| I5 | **Tax-aware insights** | India-specific: STCG/LTCG, ₹1.25L LTCG exemption, per-folio gains using Purchase_NAV vs Current_NAV | Med-High |
| I6 | **Retirement readiness narrative** | Feed the 3-bucket/refill data into LLM for a plain-English "are you on track" assessment | Med |

## 3. Prediction / Scenario (not investment advice)

| # | Feature | What it does | Effort |
|---|---------|--------------|--------|
| P1 | **Risk/trend scoring** | Deterministic score per holding vs 200-day MA (mostly exists as `asset-pulse`) → LLM narrates | Low-Med |
| P2 | **Scenario simulator** | "If NIFTY drops 10% / rupee weakens 5%", show impact on corpus + narrative | Med |

## 4. Copilot UX

| # | Feature | What it does | Effort |
|---|---------|--------------|--------|
| C1 | **"Ask Samridhi" chat widget** | Floating assistant on Dashboard wired to I3 | Med-High |
| C2 | **Auto monthly report (PDF/email)** | Generated narrative + charts snapshot, downloadable | Med-High |

## Architecture decisions

1. **LLM provider** — **Google Gemini via AI Studio** (free tier, permanent, no
   credit card). "Flash-Lite" (~15 RPM / 1,000 req/day) or "Flash" (~10 RPM /
   250 req/day). Backend built provider-agnostic via env config
   (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`) so we can fall back to Groq /
   OpenRouter / local Ollama without a rewrite. Send aggregate metrics only,
   never raw tables. (Research Sept 2026: Google AI Studio = no card, permanent
   free tier; free-tier prompts may be used for product improvement.)
2. **Deterministic-first** — all metrics computed in FastAPI from the DB; LLM
   only narrates numbers already computed. Keeps output honest and lets the app
   degrade gracefully if the LLM is unavailable.
3. **Caching & rate-limit safety** — LLM calls are serialized (a lock prevents the
   dashboard's parallel cards from exceeding RPM), success responses are cached
   ~6h, deterministic fallbacks ~20min, and any LLM failure pauses all narration
   for 90s so a degraded provider is never hammered.

## Recommended milestones

1. **M1** ✅: N1 + I1 — "Today in markets" card + AI Insights panel (self-contained,
   high-visibility, zero schema changes). + I3/C1 Q&A assistant.
2. **M2** ✅: I2 deep-dive, N2/N3 news relevance.
3. **M3** ✅: I4, I5, I6, P1, P2, C2.
4. **Next** 💡: C2 polish (print stylesheet), email delivery, Ollama/Groq fallback
   config, backtest vs 200-DMA for P1.