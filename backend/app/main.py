"""FastAPI entry point for local development, Docker and Vercel."""
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text
from . import config
from .auth import hash_password
from .database import Base, SessionLocal, engine
from .models import User
from .routers import ai, analysis, auth_routes, indicators, markets, news, portfolio, research, scan, stocks, thesis, tracking

def seed_demo_user():
    if config.DEMO_MODE:
        with SessionLocal() as db:
            if not db.query(User).filter(User.email == config.DEMO_EMAIL).first():
                db.add(User(username="demo_trader", email=config.DEMO_EMAIL, password_hash=hash_password(config.DEMO_PASSWORD)))
                db.commit()

def initialize_database():
    inspector = inspect(engine)
    for table, required in {"watchlist": "added_at", "alerts": "direction"}.items():
        if table in inspector.get_table_names() and required not in {c["name"] for c in inspector.get_columns(table)}:
            raise RuntimeError(f"Legacy {table} schema requires a reviewed migration; existing data was preserved.")
    Base.metadata.create_all(bind=engine)
    seed_demo_user()

@asynccontextmanager
async def lifespan(app):
    initialize_database()
    yield

if not config.PRODUCTION:
    initialize_database()

app = FastAPI(title="SwingLens API", version="0.3.0", lifespan=lifespan,
              description="Market research, verified chart analysis and hosted AI chat.")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS,
                   allow_credentials=False, allow_methods=["GET", "POST", "DELETE"],
                   allow_headers=["Authorization", "Content-Type"])
for module in (auth_routes, stocks, ai, analysis, indicators, markets, news, scan, portfolio, tracking, research, thesis):
    app.include_router(module.router)

@app.get("/api/health")
def health():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok", "app": "SwingLens", "demo": config.DEMO_MODE}

_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if (_DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(404, "API endpoint not found.")
        candidate = (_DIST / full_path).resolve()
        if not candidate.is_relative_to(_DIST.resolve()):
            raise HTTPException(404, "Not found.")
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_DIST / "index.html")
