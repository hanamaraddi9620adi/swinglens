# Vercel deployment

Deploy from the repository root. Vercel builds `frontend/dist` and serves FastAPI
through `api/index.py`. API and frontend share an origin; `/api/*` is routed to
Python, while application navigation routes serve the React entry point.

## Required configuration

1. Connect `hanamaraddi9620adi/swinglens` to the SwingLens Vercel project.
2. Attach a PostgreSQL database through Vercel Storage (Neon free plan works).
   Use a pooled connection URL with TLS. The Neon integration supplies `DATABASE_URL`.
3. Set a cryptographically random `SECRET_KEY` of at least 32 characters.
4. Set `LLM_PROVIDER=gemini,groq`, `GEMINI_API_KEY` and/or `GROQ_API_KEY`.
   Existing plural key settings remain supported. Set `GEMINI_MODEL` and
   `GROQ_MODEL` to model IDs actually available to those accounts.
5. Keep demo mode off. The shared demo account is disabled in public environments.
6. Deploy and check `/api/health`, `/docs`, registration, login, chart analysis,
   chat and persistence after refreshing the page.

All secrets belong in Vercel environment settings, never Git or frontend code.
`.vercelignore` excludes local keys, databases, virtual environments and test files.
The app refuses to start publicly with SQLite or a missing/weak signing secret.

## CLI

```powershell
vercel login
vercel link --project swinglens
vercel git connect https://github.com/hanamaraddi9620adi/swinglens.git
vercel integration add neon --name swinglens-db --plan free_v3 -m region=sin1 -m auth=false
vercel env add SECRET_KEY production
vercel env add GEMINI_API_KEY production
vercel env add GROQ_API_KEY production
vercel --prod
```

If a database is already attached, do not create another. Configure Preview secrets
separately when using previews; prefer a separate database/branch for preview data.
The provider keys require free quota on the selected models. Never enable paid
upgrades merely to resolve a quota error without the account owner's agreement.

## Storage and schema

The driver is psycopg 3; `postgres://` and `postgresql://` URLs are normalized to
`postgresql+psycopg://`. Connections use NullPool so the hosted database pooler
controls connection reuse across serverless instances. Tables are created on first
startup. Legacy incompatible tables fail startup with a migration message and are
never dropped automatically. Back up data and use reviewed migrations for future
schema changes. Local SQLite contents are not automatically uploaded to production.

## Limits and troubleshooting

- `503` from chat: inspect server logs for sanitized provider/category/status details,
  verify model availability and account quota, then retry after cooldown.
- `429` from chat: the per-account minute limit was reached. Wait and retry.
- Data-provider errors: free Yahoo/RSS sources may throttle cloud IPs or return no data.
- Function timeouts: large scans can exceed hosting limits; add background jobs/caching
  for larger workloads. The current function permits up to 300 seconds where the plan allows.
- Authentication: changing `SECRET_KEY` signs out existing sessions.
- CORS: same-origin Vercel needs no extra origin. Set `CORS_ORIGINS` explicitly for
  any separately hosted client; credentials are not allowed from arbitrary origins.

References: [Vercel Python](https://vercel.com/docs/functions/runtimes/python),
[Gemini models](https://ai.google.dev/gemini-api/docs/models),
[Groq models](https://console.groq.com/docs/models).
