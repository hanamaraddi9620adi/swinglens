# SwingLens — Showcase & Deployment Guide

Three ways to put SwingLens in front of judges, from fastest to most public.
Everything here uses free tiers only. The app is a **single service**: the
backend serves both the API and the built frontend on one port.

> LLM note: the deployed app uses hosted APIs only; it does not require
> Ollama. Choose Gemini (recommended), Groq, or xAI and set
> `LLM_PROVIDER` plus provider key pools. Without a key, the analyst engine,
> scanner, indicators, Explore, Pulse news, and setup cards still work and
> narration uses deterministic templates.

---

## Option 1 — Any laptop, one command (Docker)

On a machine with Docker installed:

```
docker compose up --build
```

Open http://localhost:8000 — demo mode is on, so the login page shows
**✨ Try the demo account** (demo@swinglens.app / swingdemo123). Data
persists in a named volume. To share on the venue WiFi, give people
`http://<your-ip>:8000`.

No Docker on the hackathon machine? The manual path in README.md
(Python + Node) works exactly as before.

---

## Option 2 — Public URL on Render (free)

1. Push the project to a GitHub repo.
2. On render.com → New → **Web Service** → connect the repo.
3. Environment: **Docker** (it auto-detects the Dockerfile). Instance type: **Free**.
4. Add environment variables:
   - `DEMO_MODE=1`
   - `SECRET_KEY=<any long random string>`
   - `LLM_PROVIDER=gemini,groq`
   - `GEMINI_MODEL=gemini-3.8-flash`
   - `GROQ_MODEL=llama-3.3-70b-versatile`
   - `GEMINI_API_KEYS=<key1>,<key2>`
   - `GROQ_API_KEYS=<key1>,<key2>`
   - `XAI_API_KEYS=<key1>,<key2>`
5. Deploy → you get `https://your-app.onrender.com` that opens on anyone's
   laptop, exactly like a Vercel link.

Honest limits of the free tier: the service **sleeps after ~15 min idle and
cold-starts in ~1 minute** — open it once before your demo slot. Free
instances also have modest CPU; the first market scan takes a bit longer.

## Option 2b — Hugging Face Spaces (free, no sleep)

Create a **Docker** Space, push this repo into it, and in the Space's
`README.md` front-matter set `app_port: 8000` (or set a `PORT` env var —
the container respects it). Add the same environment variables under
Settings → Variables. Free CPU Spaces don't sleep the way Render does.

> Why not Vercel? Vercel is built for frontends/serverless — it can't run
> this persistent FastAPI+SQLite service. Render/HF Spaces give you the same
> "open my URL" experience for full-stack apps, free.

---

## Environment variables (all optional except SECRET_KEY in public deploys)

| Variable | Default | Purpose |
|---|---|---|
| `DEMO_MODE` | 0 | `1` seeds demo account + login button |
| `DEMO_PASSWORD` | swingdemo123 | demo account password |
| `SECRET_KEY` | dev value | JWT signing — set a real one publicly |
| `DATABASE_URL` | sqlite file | Postgres URL works unchanged (SaaS phase) |
| `LLM_PROVIDER` | gemini,groq | Ordered failover providers |
| `GEMINI_API_KEYS` | (empty) | Comma-separated Gemini keys |
| `GROQ_API_KEYS` | (empty) | Comma-separated Groq keys |
| `XAI_API_KEYS` | (empty) | Comma-separated xAI keys |
| `CLOUD_LLM_API_KEY` | (empty) | Legacy single-key fallback |
| `GEMINI_MODEL` | gemini-3.8-flash | Gemini model |
| `GROQ_MODEL` | llama-3.3-70b-versatile | Groq model |
| `CLOUD_LLM_MODEL` | gemini-3.8-flash | Legacy model variable |
| `CLOUD_LLM_BASE_URL` | Groq endpoint | Used by legacy `LLM_PROVIDER=cloud` |
| `CLOUD_LLM_PROVIDER` | groq | Provider used by legacy `cloud` mode |

## API keys and public deployment

### Gemini (recommended free option)

1. Open [Google AI Studio](https://aistudio.google.com/apikey) and sign in.
2. Select **Create API key** and copy it immediately.
3. In Render → your service → **Environment**, add
   `GEMINI_API_KEYS=<paste-key-1>,<paste-key-2>`. Keep the keys comma-separated
   with no spaces. Add `LLM_PROVIDER=gemini,groq` to enable failover.
4. Save changes and redeploy. Do not commit the key or add it to Vite.

### Groq (OpenAI-compatible alternative)

1. Open [Groq Console](https://console.groq.com/keys), sign in, and create an
   API key.
2. Add the key to `GROQ_API_KEYS=<paste-key-1>,<paste-key-2>` and include
   `groq` in `LLM_PROVIDER`.
   The adapter selects `llama-3.1-8b-instant` automatically.

### xAI / Grok

1. Create an API key in the [xAI Console](https://console.x.ai/).
2. xAI is not included in the recommended configuration and is not required
   for failover. Do not add `xai` to `LLM_PROVIDER`.
3. xAI availability and pricing are controlled by xAI; do not assume it has
   the same free allowance as Gemini or Groq.

### Vercel frontend with Render backend

This repository's Docker deployment serves both pieces together, so the
simplest public deployment is Render alone. If you already have a Vercel
frontend, deploy the backend on Render and configure the frontend's API base
URL only if you add one; the current frontend intentionally uses relative
`/api` paths and therefore expects the same-origin Docker deployment. A
Vercel static frontend cannot proxy these paths to Render without a Vercel
rewrite or a frontend API-base change. Do not paste LLM keys into Vercel.

---

## The 3-minute judge demo script

1. **Login page** → tap *Try the demo account* (nobody registers at a demo).
2. **Pulse** loads: real drifting headlines, each labeled CONFIRMED ×N
   sources or UNVERIFIED — say the line: *"nothing on this screen was
   written by an AI; every card links to the original article."*
3. **Explore** → Indian Stocks → Mid Cap → click a top gainer.
4. Chart opens → press **Analyze** → zones, trendlines, ENTRY/STOP/T1/T2
   draw themselves; scroll to the setup card → point at the **confidence
   factor breakdown** and the *"✓ Verified against data"* badge.
5. In the chat: type **"scan the market for bullish setups"** → the engine
   ranks the whole universe live, with the *Techniques applied* checklist
   open — say: *"the AI never picks stocks; the math does, and the AI only
   explains it."*
6. Close with the Sources footer on any panel: provider, link, timestamp.

That narrative — **transparency as the product** — is your differentiator.
