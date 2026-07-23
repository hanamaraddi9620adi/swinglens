"""Central configuration. Every tunable lives in .env so that
local mode and (later) SaaS mode are the same code with different settings."""
import os
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-insecure-key")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./swinglens.db")

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b-instruct")

ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))

JWT_ALGORITHM = "HS256"
