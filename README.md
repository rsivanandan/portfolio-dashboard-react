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
| **Refresh NAV** | One click — updates all MF NAVs from AMFI via mftool |
| **Refresh Stocks** | One click — updates all stock LTPs from yfinance |
| **Save Snapshot** | Saves today's portfolio value to history for CAGR tracking |
| **Market Ticker** | Live scrolling marquee: Nifty, Sensex, Nifty Bank, USD/INR, Gold, Crude |

---

## Database

Place your `investments.db` in the `backend/` directory.
The schema expected:
- `User1_MF` — User 1's MF transactions
- `User2_MF` — User 2's MF transactions
- `MF_Summary` — Fund categories
- `Stocks` — Stock holdings
- `networth_history` — Created automatically on first snapshot save

---

## Production Build

```bash
cd frontend
npm run build
# Serves from dist/ — can be served via nginx or any static host
```
