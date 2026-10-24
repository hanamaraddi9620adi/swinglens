# SwingLens

SwingLens is a stock research application with a React interface, FastAPI backend,
computed chart analysis, market scans, portfolio imports, research reports, thesis
tracking and a Gemini/Groq chatbot. Market numbers come from data and calculations;
AI explains the supplied facts. Research and education only, not investment advice.

## Run locally

Requires Python 3.12+ and Node.js 22+.

```powershell
python -m venv backend/venv
backend/venv/Scripts/python -m pip install -r requirements-dev.txt
Copy-Item backend/.env.example backend/.env
npm ci --prefix frontend
```

Set a random `SECRET_KEY` and your own `GEMINI_API_KEY` and/or `GROQ_API_KEY`
in `backend/.env`. Existing plural `GEMINI_API_KEYS` / `GROQ_API_KEYS` settings
remain supported. Do not overwrite an existing `.env` when upgrading.

Run the API and frontend in separate terminals:

```powershell
backend/venv/Scripts/python -m uvicorn app.main:app --app-dir backend --port 8000
npm run dev --prefix frontend
```

Open http://localhost:5173, create an account, choose a stock, run Analyze, and
ask the chatbot to explain the setup. “Scan the market” and “Analyse this stock”
use the deterministic engine and work without an AI key. General conversation
requires a provider with working quota. No Ollama or local model server is needed.

## Hosted AI

- Gemini: create a key at https://aistudio.google.com/apikey.
- Groq: create a key at https://console.groq.com/keys.
- `LLM_PROVIDER=gemini,groq` selects the provider order; only configured providers run.
- Model IDs are configurable through `GEMINI_MODEL` / `GROQ_MODEL`.
- Keys stay in backend environment variables; never use a `VITE_` prefix for secrets.
- Free-tier availability and quotas depend on the provider, model and account.
  Authentication alone does not prove that a model has generation quota.
- Failover makes one request per configured provider; quota failures cool down the
  provider instead of cycling keys to bypass its allowance. Cooldowns are per process.
- The chatbot checks numeric claims against supplied context and removes unsupported
  sentences. This is a numeric consistency check, not proof of correctness or a guarantee
  against every hallucination. Chart narration falls back to deterministic templates.

## Deployment

The repository includes `vercel.json`, a Python API entry point and a Vite build.
Use the repository root as the Vercel project root. Connect a persistent PostgreSQL
database (for example the Neon free plan). SQLite is for local use only.
See [DEPLOY.md](DEPLOY.md) for environment variables and verification steps.

The existing GitHub repository is https://github.com/hanamaraddi9620adi/swinglens.
The local checkout may use `upstream` for that repository; verify the destination
with `git remote -v` before pushing. Do not push SwingLens updates to another fork.

## Verification

```powershell
backend/venv/Scripts/python -m pytest -q
npm run build --prefix frontend
npm audit --prefix frontend --omit=dev --audit-level=high
```

Tests use a temporary database. Coverage includes deterministic analytics,
provider failover, malformed provider replies, chat history and ownership,
numeric grounding, input validation, session handling and portfolio flows.

## Operational limits

Yahoo Finance and RSS feeds are third-party services and can return delayed,
missing or rate-limited data. The curated market scanner can be slow on cold
requests; Vercel function durations and free-tier quotas still apply. Public chat
has a database-backed per-account rate limit. Before high-volume operation, add
edge abuse controls for registration/login and expensive analytics, email
verification/reset, monitoring, backups and reviewed schema migrations. Existing
legacy schemas are preserved and require migration rather than automatic deletion.
The test suite is evidence for covered behavior; it does not establish a bug-free app.

## Development handoff

Continue work in this existing repository, keeping market facts deterministic,
provider secrets server-side, and source information visible. Preserve account
and conversation ownership, use persistent PostgreSQL in hosted environments,
and report third-party failures honestly. Review the remaining operational limits
before adding features, and update deployment instructions when configuration
changes. Finish with backend regression tests, a production frontend build and
whole-file rewrites as required by `skills/swinglens-dev/SKILL.md`.
