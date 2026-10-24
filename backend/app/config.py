"""Environment-only settings; secrets never belong in the frontend bundle."""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
PRODUCTION = bool(os.getenv("VERCEL")) or os.getenv("APP_ENV") == "production"
SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-insecure-key")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./swinglens.db")
if PRODUCTION:
    if len(SECRET_KEY) < 32 or SECRET_KEY.startswith(("dev-only", "change-me")):
        raise RuntimeError("Set SECRET_KEY to a random secret of at least 32 characters.")
    if not DATABASE_URL.startswith(("postgres://", "postgresql://", "postgresql+psycopg://")):
        raise RuntimeError("Public deployments require a persistent PostgreSQL DATABASE_URL.")

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini,groq").lower()
CLOUD_LLM_API_KEY = os.getenv("CLOUD_LLM_API_KEY", "")
CLOUD_LLM_MODEL = os.getenv("CLOUD_LLM_MODEL", "")
CLOUD_LLM_BASE_URL = os.getenv("CLOUD_LLM_BASE_URL", "https://api.groq.com/openai/v1")
CLOUD_LLM_PROVIDER = os.getenv("CLOUD_LLM_PROVIDER", "groq").lower()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
GEMINI_API_KEYS = os.getenv("GEMINI_API_KEYS", "")
GROQ_API_KEYS = os.getenv("GROQ_API_KEYS", "")
XAI_API_KEYS = os.getenv("XAI_API_KEYS", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "20"))
LLM_MAX_OUTPUT_TOKENS = int(os.getenv("LLM_MAX_OUTPUT_TOKENS", "2048"))
CHAT_REQUESTS_PER_MINUTE = int(os.getenv("CHAT_REQUESTS_PER_MINUTE", "10"))
CORS_ORIGINS = [s.strip() for s in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if s.strip()]
DEMO_MODE = os.getenv("DEMO_MODE", "0") == "1" and not PRODUCTION
DEMO_EMAIL = "demo@swinglens.app"
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "swingdemo123")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))
JWT_ALGORITHM = "HS256"
