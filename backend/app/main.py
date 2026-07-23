from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine
from .routers import ai, auth_routes, stocks

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SwingLens API",
    version="0.1.0",
    description="Phase 1 — auth, market data with source transparency, local AI.",
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


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "SwingLens", "phase": 1}
