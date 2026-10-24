# SwingLens

SwingLens combines sourced market charts, deterministic stock analysis, market
scans, portfolio imports, research reports, thesis tracking and Gemini/Groq chat.
AI explains supplied facts; market numbers come from data and calculations.
Research and education only, not investment advice.

**Live app:** https://swinglens-cyan.vercel.app

## Mobile_APP_update

The Chart tab now opens a searchable instrument library with market categories.
Choose a stock before opening its chart. The chart terminal follows the supplied
visual reference while retaining actual provider candles and the existing
TradingView Lightweight Charts renderer.

The update fixes narrow headers, search races, off-screen menus, nested modal
scroll locks, mobile chat page jumps, chart error overlays and stale analysis.
Charts include a separate volume pane, OHLC values, zoom/fit/reset/refresh,
expanded view and computed support/resistance/trendlines. Daily bars preserve
the exchange's trading date. See [MOBILE_APP_UPDATE.md](MOBILE_APP_UPDATE.md)
for behavior, verification scope and the browser test matrix.

## Local development

Requires Python 3.12+ and Node.js 22+.

```powershell
python -m venv backend/venv
backend/venv/Scripts/python -m pip install -r requirements-dev.txt
Copy-Item backend/.env.example backend/.env
npm ci --prefix frontend
```

Do not overwrite an existing `.env` when upgrading. Set a random `SECRET_KEY`
and `GEMINI_API_KEY` and/or `GROQ_API_KEY` in `backend/.env`. Existing plural
key settings remain supported. Start the API and frontend in separate terminals:

```powershell
backend/venv/Scripts/python -m uvicorn app.main:app --app-dir backend --port 8000
npm run dev --prefix frontend
```

Open http://localhost:5173, create an account, select Chart, choose an instrument
and run Analyze. Use the global stock search for instruments outside the curated
library. `/` focuses search; Ctrl/Cmd+K opens commands. Normal vertical scrolling
moves the page, horizontal chart dragging pans, pinch or +/− zooms, and dragging
the price axis changes scale. Menus and expanded views support Escape.

## Hosted AI

Create provider keys at [Google AI Studio](https://aistudio.google.com/apikey)
and [Groq Console](https://console.groq.com/keys). `LLM_PROVIDER=gemini,groq`
selects provider order; `GEMINI_MODEL` and `GROQ_MODEL` select available models.
Keys belong only in backend environment variables, never in Git or `VITE_` settings.

Free quotas depend on the account/model. Failover performs at most one request
per provider per chat, with process-local cooldowns for failures. Numeric
consistency checks remove unsupported claims; they do not prove every AI statement
correct. Chart narration falls back to deterministic explanations when necessary.
Chart-analysis and scan commands work without hosted AI; general conversation
requires working provider quota. No local model server is needed.

## Verification

```powershell
backend/venv/Scripts/python -m pytest -q
npm run typecheck --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend
npm audit --prefix frontend --audit-level=high
cd frontend
npx playwright install chromium firefox webkit
npm run test:e2e
```

Backend tests use a temporary database. UI tests use clearly identified
deterministic fixtures and ten device/viewport profiles; production always uses
provider data. GitHub Actions runs backend checks, TypeScript, frontend tests,
build/audit and the full browser matrix. Browser reports/screenshots are uploaded
as CI artifacts. Physical-device gesture behavior still benefits from manual testing.

## Deployment and data

Deploy the repository root to Vercel. `vercel.json` builds the frontend and routes
`/api/*` to Python. Hosted accounts/chats require PostgreSQL, while SQLite remains
available for local development. See [DEPLOY.md](DEPLOY.md) for setup. Verify the
Git destination before pushing: the intended repository is
https://github.com/hanamaraddi9620adi/swinglens.

Provider-adjusted OHLC is labeled explicitly. Daily/weekly bars use exchange
session dates, intraday bars use UTC instants, and a short cache keeps chart and
analysis requests consistent. Free Yahoo/RSS data may be delayed, missing or
rate-limited. This is not a real-time tick feed or the complete TradingView platform.

Before high-volume use, add edge abuse controls for registration/login and
expensive analytics, email verification/reset, monitoring, backups and reviewed
database migrations. Existing incompatible legacy tables are preserved rather
than deleted automatically. Tests establish covered behavior, not a bug-free app.

## Development handoff

Preserve sourced deterministic market facts, account/conversation ownership,
category-first chart navigation, stale-response guards and nested modal focus/
scroll behavior. Keep secrets server-side and PostgreSQL persistent in hosted
environments. Finish changes with backend, frontend and browser regression checks,
updated documentation and whole-file rewrites per `skills/swinglens-dev/SKILL.md`.
