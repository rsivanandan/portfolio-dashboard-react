# Portfolio Dashboard — React/TypeScript + FastAPI

A fluid, dark-themed investment tracker converting your Streamlit app to a full React/TS dashboard.

## Prerequisites
- Python 3.10+
- Node.js 18+

---

## Quick Start

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

Backend runs at **http://localhost:8000**
API docs at **http://localhost:8000/docs**

### 2. Frontend (new terminal)

```bash
cd frontend
npm install
npm run dev
```

Dashboard opens at **http://localhost:5173**

---

## Structure

```
portfolio/
├── backend/
│   ├── main.py            # FastAPI app — all API endpoints
│   ├── investments.db     # Your SQLite database (copy here)
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── Dashboard.tsx     # KPIs + Nifty chart + portfolio chart
    │   │   ├── Summary.tsx       # Pie charts + stocks vs MF comparison
    │   │   ├── Analytics.tsx     # Timeline, monthly patterns, snapshots
    │   │   ├── Stocks.tsx        # All stock holdings + returns chart
    │   │   └── MutualFunds.tsx   # MF holdings, User 1/User 2 tabs, category pie
    │   ├── components/
    │   │   ├── UI.tsx            # StatCard, Table, Badge, Spinner etc.
    │   │   ├── Sidebar.tsx       # Navigation + Refresh/Save buttons
    │   │   └── Marquee.tsx       # Live market ticker banner
    │   ├── hooks/
    │   │   └── useApi.ts         # All React Query hooks + TypeScript types
    │   └── utils/
    │       └── format.ts         # formatINR, formatPct, chart theme
    └── package.json
```

---

## Features

| Feature | Details |
|---------|---------|
| **Dashboard** | Live KPIs, Nifty 50 chart (14 days), portfolio value vs invested |
| **Summary** | Donut charts (invested vs now, invested vs returns), stocks vs MF bar |
| **Analytics** | Year-wise investment timeline, monthly patterns, snapshot tracker with CAGR |
| **Stocks** | Full table with search, returns % bar chart, sortable |
| **Mutual Funds** | All/User 1/User 2 tabs, category pie, invested vs current bar, holdings table |
| **Portfolio Management** | `/admin` — add/edit/delete mutual funds, upload stock CSV files |
| **System Admin** | `/system` — configure user names, manage accounts, app preferences |
| **Refresh NAV** | One click — updates all MF NAVs from AMFI via mftool |
| **Refresh Stocks** | One click — updates all stock LTPs from yfinance |
| **Save Snapshot** | Saves today's portfolio value to history for CAGR tracking |
| **Market Ticker** | Live scrolling marquee: Nifty, Sensex, Nifty Bank, USD/INR, Gold, Crude |
| **Today in Markets** | AI-distilled India market headlines on the Dashboard (RSS + LLM summary) |
| **AI Portfolio Insights** | Deterministic metrics (concentration, stale NAVs, laggards) narrated by the LLM |
| **Ask Samridhi** | Floating chat widget — natural-language Q&A over your portfolio |

---

## AI Features (opt-in)

The AI features are **deterministic-first**: every metric is computed locally from
your DB and the LLM only narrates the numbers — it invents nothing. Without a key the
app degrades gracefully (raw headlines + deterministic facts, with an "AI not
configured" indicator).

### 1. Get a free Gemini key

1. Go to **https://aistudio.google.com** and sign in with any Google account.
2. **Get API key** → create one. No credit card, permanent free tier.
3. Copy `backend/.env.example` to `backend/.env` and paste the key:

   ```bash
   cp backend/.env.example backend/.env
   # GEMINI_API_KEY=paste-your-key-here  → edit backend/.env
   ```

   `.env` is git-ignored and never synced.

### 2. Swap providers (optional)

Defaults target Gemini's OpenAI-compatible endpoint. To use Groq / OpenRouter /
Ollama instead, set these in `.env` — no code changes:

```bash
GEMINI_API_KEY=                         # or LLM_API_KEY=
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
LLM_MODEL=gemini-3.6-flash
```

For Docker, pass the same variables to compose (`GEMINI_API_KEY=${GEMINI_API_KEY}` is
already wired in `docker-compose.yml`).

### 3. Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/ai/status` | Is AI configured, and which model? |
| `GET /api/ai/briefing` | Today's India market headlines, LLM-distilled (cached daily) |
| `GET /api/ai/insights` | Portfolio metrics + LLM narration and risk flags (cached daily) |
| `POST /api/ai/ask` | Ask anything about the portfolio in plain English |
| `GET /api/ai/holding-news` | Headlines matched to your holdings (N2/N3) |
| `GET /api/ai/holding/{entity}/{key}` | Deep-dive on one holding (`mf`/`stocks`, name/ticker) |
| `GET /api/ai/rebalance` | Equity/debt/PF allocation vs targets + advice |
| `GET /api/ai/tax` | STCG/LTCG, ₹1.25L exemption, per-holding gains |
| `GET /api/ai/retirement` | 3-bucket readiness + refill recommendation + narrative |
| `GET /api/ai/risk` | Portfolio risk score + drivers |
| `POST /api/ai/scenario` | "What if NIFTY moves ±X%" impact on corpus |
| `GET /api/ai/report` | Everything for the monthly report (rendered in UI, download as `.txt`) |

Every endpoint degrades to deterministic data with `ai_enabled: false` when no
LLM key is present — metrics are always computed locally, the LLM only narrates.

Full implementation detail and roadmap: see `AI_PLAN.md`.

---

## Database

The database (`investments.db`) is created automatically in `backend/` on first startup
— all tables are generated by `ensure_schema()` in `main.py`.

**Populating data** — two options:

1. **Admin page** (`/admin` → Portfolio Management) — upload stock CSV files or add mutual funds manually via the CRUD form.
2. **`setupdb.py`** — imports from an existing Excel file:
   ```bash
   cd backend
   python setupdb.py /path/to/My_Investments.xlsx
   ```

Tables created automatically:
- `User1_MF` / `User2_MF` — Mutual fund transactions per user
- `User1_Stocks` / `User2_Stocks` — Stock holdings per user
- `MF_Summary` — Fund category reference data
- `networth_history` — Portfolio snapshots (saved from Dashboard)
- `users` — Authentication accounts

---

## Production Build

```bash
cd frontend
npm run build
# Serves from dist/ — can be served via nginx or any static host
```
