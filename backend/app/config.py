"""Central configuration for the hosted application."""
import os
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-insecure-key")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./swinglens.db")

# Cloud LLM providers. Gemini uses its native API; groq/xai use the
# OpenAI-compatible chat-completions API.
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini,groq").lower()
CLOUD_LLM_API_KEY = os.getenv("CLOUD_LLM_API_KEY", "")
CLOUD_LLM_MODEL = os.getenv("CLOUD_LLM_MODEL", "gemini-3.8-flash")
CLOUD_LLM_BASE_URL = os.getenv("CLOUD_LLM_BASE_URL", "https://api.groq.com/openai/v1")
CLOUD_LLM_PROVIDER = os.getenv("CLOUD_LLM_PROVIDER", "groq").lower()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# Comma-separated server-side key pools. The adapter rotates through these
# pools when a provider reports a quota, rate-limit, or authentication error.
GEMINI_API_KEYS = os.getenv("GEMINI_API_KEYS", "")
GROQ_API_KEYS = os.getenv("GROQ_API_KEYS", "")
XAI_API_KEYS = os.getenv("XAI_API_KEYS", "")

# Demo mode for showcases/hackathons: seeds a ready-made account and shows
# a one-click "Try the demo" button on the login page.
DEMO_MODE = os.getenv("DEMO_MODE", "0") == "1"
DEMO_EMAIL = "demo@swinglens.app"
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "swingdemo123")

ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))

JWT_ALGORITHM = "HS256"
