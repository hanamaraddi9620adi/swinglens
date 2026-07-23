# SwingLens

A local-first stock analysis platform. Phase 2 adds the Analyst Engine:
press **Analyze** on any chart and the platform detects swing pivots, draws
support/resistance zones and trendlines ON the chart, marks the breakout,
computes an entry/stop/target plan with an explainable confidence score, and
narrates it in four short verified blocks — every number from math, never
from the AI. Setups are saved for future self-grading. If Ollama is offline,
narration falls back to a deterministic template built from the computed
facts, so Analyze always works.

**Phase 2.5 adds the pro toolbox:** a chart-type menu (10 views incl.
Heikin Ashi, Hollow candles, Bars, Baseline, Area, Step...), and an
**Indicators dialog (fx button)** with 27 fully configurable indicators across
Trend / Momentum / Volatility / Volume / Levels — each with a plain-language
description and a "how to read" note, tagged beginner / intermediate /
advanced. Oscillators open in resizable sub-panes; overlays draw on price.
Your active indicators + settings persist across sessions (localStorage).

Run the engine tests any time:  cd backend, activate venv, `pytest -q`.

> Rename the app any time: the name appears in `frontend/index.html`,
> `frontend/src/pages/Login.jsx`, `frontend/src/pages/Workspace.jsx`,
> and `backend/app/main.py`.

**Showcase / hackathon:** see **DEPLOY.md** — one-command Docker run,
free public hosting (Render / HF Spaces), demo account mode, optional
free cloud AI, and the 3-minute judge demo script.

---

## Prerequisites (install once)

| Tool | Where | Notes |
|---|---|---|
| Python 3.11+ | python.org | Tick **"Add Python to PATH"** in the installer |
| Node.js 20 LTS | nodejs.org | Includes npm |
| Ollama | ollama.com | Windows installer; runs in the background |

After installing Ollama, open a terminal and pull the models (one-time, ~7 GB):

```
ollama pull qwen2.5:7b-instruct
ollama pull llama3.2:3b
```

---

## Run it (two terminals)

### Terminal 1 — Backend

```
cd swinglens\backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Leave it running. You should see `Uvicorn running on http://127.0.0.1:8000`.
(Only the first run needs the venv/pip/copy steps; afterwards just
`venv\Scripts\activate` + the `uvicorn` line.)

### Terminal 2 — Frontend

```
cd swinglens\frontend
npm install
npm run dev
```

Open **http://localhost:5173**, create an account, and search any stock.

---

## Let others on your WiFi use it

`npm run dev` already listens on your network. Find your IP with `ipconfig`
(look for "IPv4 Address", e.g. `192.168.1.7`) and share
`http://192.168.1.7:5173`. Each person creates their own account — the app is
multi-user from day one. Windows may ask to allow Node/Python through the
firewall the first time: allow on Private networks.

---

## Troubleshooting

**PowerShell refuses to activate the venv** ("running scripts is disabled"):
either run `venv\Scripts\activate.bat` from **cmd** instead of PowerShell, or
run once in PowerShell:
`Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

**AI panel shows "Ollama isn't ready"**: make sure the Ollama app is running
(check the system tray), and that you pulled the model:
`ollama pull qwen2.5:7b-instruct`. Test with `ollama list`.

**A stock shows "No data found"**: Indian stocks need the exchange suffix —
`RELIANCE.NS` (NSE) or `500325.BO` / `RELIANCE.BO` (BSE). Use the search box;
it resolves names to the right symbol.

**15m or 1H ranges are greyed out**: that's a data-provider limit, not a bug —
Yahoo keeps ~60 days of 15-minute bars and ~2 years of hourly bars. Daily and
weekly go back decades.

**Charts feel slow on first load**: the very first yfinance call downloads
fresh data; repeat loads of the same range are faster. A local cache layer
arrives in Phase 2.

**Port already in use**: change `--port 8000` (backend) or `port: 5173` in
`frontend/vite.config.js`, and update the proxy target in the same file if you
moved the backend.

---

## What's inside

```
swinglens/
├── backend/                 FastAPI + SQLite
│   └── app/
│       ├── main.py          App entry, CORS, routers
│       ├── config.py        All settings from .env
│       ├── auth.py          PBKDF2 passwords + JWT sessions
│       ├── models.py        User table
│       ├── routers/         /api/auth, /api/stocks, /api/ai
│       └── services/
│           ├── market_data.py   yfinance loader + source blocks
│           └── llm/             LLM adapter (Ollama now, cloud later)
└── frontend/                React + Vite + Tailwind v4
    └── src/
        ├── pages/           Login, Workspace
        └── components/      CandleChart, StockSearch, AIChat, SourceFooter
```

Design rules the whole project follows:

1. **Numbers come from data or math, never from the AI.**
2. **Every payload carries a `source` block** (provider, link, timestamp) and the UI shows it.
3. **Every external system sits behind an adapter** (LLM, data, later brokers) so local mode and SaaS mode are the same code.

**Phase 4.75 adds:** per-user ⭐ watchlist with live changes, 🔔 price
alerts (set from any chart, checked every 5 min while the app is open),
a position-size calculator in every setup card, and the **Engine Track
Record** on Pulse — every Analyze plan self-graded against what price
actually did (pessimistic same-candle rule), win rate shown publicly.

## Roadmap

- **Phase 2 — Analyst Engine**: DONE (this build).
- **Phase 3 — Newsroom**: DONE (this build) — real RSS headlines with the
  2-source CONFIRMED gate, Pulse dashboard with drifting headline sky,
  per-symbol news panel, name-first typo-tolerant search, clickable ticker.
  NSE insider/bulk-deal disclosures move to Phase 4 alongside portfolios.
- **Phase 4 — Mirror**: DONE (this build) — tolerant broker-file import
  (CSV/XLSX, header sniffing, column synonyms, tradebook vs holdings
  auto-detect), live-priced holdings dashboard, FIFO realized P&L, and the
  Trader Mirror personality with explainable traits, badges, and honest
  minimum-sample rules. Sample files in sample_data/. The AI chat can see
  a summary of your portfolio for grounded "how am I doing" questions.
- **Phase 5 — SaaS**: Docker, PostgreSQL, broker API adapters, deployment.
