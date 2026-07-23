# SwingLens — Phase 1

A local-first stock analysis platform. Phase 1 delivers the living skeleton:
multi-user login, live NSE/BSE/US candlestick charts (15m / 1H / 1D / 1W) with
source transparency on every data payload, and a local AI assistant running
through Ollama on your own machine.

> Rename the app any time: the name appears in `frontend/index.html`,
> `frontend/src/pages/Login.jsx`, `frontend/src/pages/Workspace.jsx`,
> and `backend/app/main.py`.

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

## Roadmap

- **Phase 2 — Analyst Engine**: support/resistance zones, trendlines, breakout
  detection drawn ON the chart, entry/stop/target setup card, AI narration
  with verifier pass, prediction self-grading.
- **Phase 3 — Newsroom**: real-time RSS news with 2-source corroboration, NSE
  insider/bulk-deal disclosures, animated news dashboard.
- **Phase 4 — Mirror**: INDMoney/Groww CSV import, portfolio dashboard,
  trading-behavior analytics.
- **Phase 5 — SaaS**: Docker, PostgreSQL, broker API adapters, deployment.
