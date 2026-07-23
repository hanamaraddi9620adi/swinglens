from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine
from .routers import ai, analysis, auth_routes, stocks

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SwingLens API",
    version="0.2.0",
    description="Phase 2 — the Analyst Engine: annotated setups, verified narration.",
)

# Local development: the Vite dev server proxies /api to us, but we also
# allow direct browser calls from any LAN device. Tightened in the SaaS phase.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(stocks.router)
app.include_router(ai.router)
app.include_router(analysis.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "SwingLens", "phase": 1}
