"""SQLite for local development, pooled PostgreSQL for hosted deployments."""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool
from .config import DATABASE_URL

url = DATABASE_URL
if url.startswith(("postgres://", "postgresql://")):
    url = "postgresql+psycopg://" + url.split("://", 1)[1]
options = {"connect_args": {"check_same_thread": False}} if url.startswith("sqlite") else {
    "poolclass": NullPool, "connect_args": {"connect_timeout": 10},
}
engine = create_engine(url, pool_pre_ping=True, **options)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    with SessionLocal() as db:
        yield db
