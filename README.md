# SwingLens

Sourced market charts, deterministic stock analysis, market scans, portfolio
imports, company research, thesis tracking and Gemini/Groq chat. AI explains
supplied facts; numbers come from data and calculations. Research and education
only, not investment advice.

**Live app:** https://swinglens-cyan.vercel.app

## Portfolio upload and AI review

Choose the broker and upload a CSV or XLSX holdings statement or tradebook.
Calculated results appear immediately, followed automatically by a cloud review.
Saved portfolios load without external-provider calls. Refresh quotes and
Generate AI review are available separately. A CSV template downloads in the app.

- Required: Symbol or Stock Name, Quantity, Average Price (Trade Price for
  tradebooks). Tradebooks also require Buy/Sell; Trade Date is recommended.
- Supports CSV preambles, UTF-8/BOM, UTF-16, Windows encoding and comma,
  semicolon, tab or pipe delimiters. Common broker headers are mapped.
- XLSX sheets are inspected and the richest recognized sheet is selected and
  named in the result. Sheets are not merged: exports often duplicate reports.
  Convert legacy XLS files to XLSX in Excel first.
- Limits: 5 MB upload, 10,000 data rows, 20 workbook sheets, 40 MB uncompressed
  XLSX. Invalid files/rows produce actionable messages. A failed import preserves
  previous data. Reimport replaces the same broker and file type only.
- Holdings show cost, value, unrealized P&L, concentration and price basis.
  Duplicate lots count toward the same instrument exposure. INR/USD remain
  separate without FX conversion. Unresolved instruments use separate original
  file-unit groups and file prices; no exchange is guessed for unknown tickers.
- Every tradebook shows counts, FIFO matched P&L and unmatched sell rows, even
  below the Trader Mirror's five-match threshold. Missing dates, incomplete
  histories, and fees/taxes excluded from P&L are disclosed.
- Yahoo daily-close lookup has a twelve-second request deadline and short
  process-local cache. File LTP/average cost remains usable on failure. These
  are not real-time quotes or a historical portfolio performance series.
- Sourced annual company snapshots cover up to three distinct holdings within
  currency groups, with a ten-second deadline. Periods and provider links are
  displayed. Missing company data stays missing; coverage is not exhaustive.
- AI receives bounded computed holding/trade summaries and available company
  facts, not raw files or account/contact columns. Selected instrument names
  are treated as untrusted data. Numerical sentences are checked against facts;
  this does not prove all qualitative statements correct. Invalid/unavailable
  AI produces a labeled computed explanation while retaining calculated results.
- Successful reviews have an account-scoped five-minute process-local cache,
  invalidated on import/clear. Failures are not cached as successful reviews.
  Serverless instances do not share these caches.

Authenticated routes: POST /api/portfolio/import, GET /api/portfolio/report,
GET /api/portfolio/report?refresh_quotes=true, POST /api/portfolio/review,
legacy GET /api/portfolio/summary and /behavior, DELETE /api/portfolio.

## Mobile_APP_update

Chart opens a searchable instrument library with market categories, then the
chosen instrument's real provider candles using TradingView Lightweight Charts.
The terminal includes separate volume, OHLC, zoom/fit/reset/refresh, expanded
view and computed support/resistance/trendlines. Daily bars preserve exchange
dates. Responsive headers, search races, off-screen menus, nested modal scroll
locks, chat jumps and stale analysis were corrected. See
[MOBILE_APP_UPDATE.md](MOBILE_APP_UPDATE.md) for the earlier release.

## Local development

Requires Python 3.12+ and Node.js 22+.

```powershell
python -m venv backend/venv
backend/venv/Scripts/python -m pip install -r requirements-dev.txt
Copy-Item backend/.env.example backend/.env
npm ci --prefix frontend
```

Do not overwrite an existing .env. Set a random SECRET_KEY and GEMINI_API_KEY
and/or GROQ_API_KEY in backend/.env. Plural key settings remain supported.
Start API and frontend in separate terminals:

```powershell
backend/venv/Scripts/python -m uvicorn app.main:app --app-dir backend --port 8000
npm run dev --prefix frontend
```

Open http://localhost:5173 and create an account. Slash focuses search;
Ctrl/Cmd+K opens commands. Vertical scrolling moves the page, horizontal chart
dragging pans, pinch or +/- zooms, and dragging the price axis changes scale.
Menus support Escape. Portfolio tables scroll locally.

## Hosted AI

Create keys at [Google AI Studio](https://aistudio.google.com/apikey) and
[Groq Console](https://console.groq.com/keys). LLM_PROVIDER=gemini,groq selects
order; GEMINI_MODEL and GROQ_MODEL select models. Keys belong only in backend
environment variables, never Git or VITE settings. No new dependency or paid
service was added for portfolio review.

Free quota depends on account/model: [Gemini limits](https://ai.google.dev/gemini-api/docs/rate-limits),
[Groq limits](https://console.groq.com/docs/rate-limits). Failover makes one
request per provider per generation with process-local cooldowns. Groq GPT-OSS
uses low reasoning effort so final content fits the output budget. General chat
needs provider quota; chart analysis/scans work without AI. No local model needed.

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

Backend tests use disposable databases and cover real CSV/XLSX parsing,
replacement safety, ownership, currency/FIFO math, provider failures/deadlines
and numerical grounding. Browser tests use labeled deterministic fixtures
across ten phone/tablet/laptop/desktop/reduced-motion profiles. Upload checks
cover immediate results, invalid files, retries, slow/failed AI, small tradebooks
and mixed currencies. GitHub Actions runs all checks and uploads browser reports.
Physical-device gestures still benefit from manual testing; tests cannot promise
every possible bug is eliminated.

## Deployment and data

Deploy the repository root to Vercel. vercel.json builds the frontend and routes
API requests to Python. Hosted accounts/chats need persistent PostgreSQL; local
SQLite remains supported. See [DEPLOY.md](DEPLOY.md). The intended GitHub repo is
https://github.com/hanamaraddi9620adi/swinglens (upstream locally).

Provider-adjusted OHLC is labeled. Daily/weekly bars use exchange dates;
intraday bars use UTC instants. Free Yahoo/RSS data can be delayed, incomplete
or rate-limited. Before high-volume use, add edge abuse controls, email
verification/reset, monitoring, backups and reviewed database migrations.
Existing incompatible legacy tables are preserved.

## Development handoff

Maintain SwingLens in its existing repository, preserving account ownership,
server secrets, persistent hosted PostgreSQL, category-first chart browsing and
responsive search/modal behavior; validate complete broker files before replacing
rows, return immediate file reports, preserve currency/original-unit separation,
expose missing quotes/dates/unmatched sells and keep cloud explanation optional
through the adapter with bounded sourced company context, numerical checks,
account-scoped caches and honest fallbacks; never send raw account/contact columns
to models, retain real-format upload and provider/error/mobile regression coverage,
and finish with passing backend/frontend/browser tests, a production build,
updated documentation and whole-file rewrites per skills/swinglens-dev/SKILL.md.
