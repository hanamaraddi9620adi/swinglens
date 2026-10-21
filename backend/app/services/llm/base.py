"""LLM adapter contract.

Every part of the platform talks to AI through this interface only.
Cloud providers implement the same two methods. Nothing else in the codebase
needs to know which provider is configured.
"""
from abc import ABC, abstractmethod


class LLMAdapter(ABC):
    provider_name: str = "unknown"

    @abstractmethod
    def chat(self, messages: list[dict]) -> str:
        """messages: [{"role": "system"|"user"|"assistant", "content": str}, ...]
        Returns the assistant's reply text. Raises LLMUnavailable on failure."""

    @abstractmethod
    def status(self) -> dict:
        """Returns {"online": bool, "model": str, "detail": str}."""


class LLMUnavailable(Exception):
    def __init__(self, message: str, hint: str = "", *, category: str = "unavailable",
                 provider: str = "", model: str = "", status_code: int | None = None):
        self.message = message
        self.hint = hint
        self.category = category
        self.provider = provider
        self.model = model
        self.status_code = status_code
        super().__init__(message)


def get_llm() -> LLMAdapter:
    from .cloud_adapter import CloudAdapter

    from ...config import LLM_PROVIDER
    configured_providers = {provider.strip() for provider in LLM_PROVIDER.split(",")}
    if configured_providers & {"gemini", "groq", "xai", "cloud"}:
        return CloudAdapter()
    raise LLMUnavailable(
        f"Unknown LLM_PROVIDER '{LLM_PROVIDER}'.",
        hint="Set LLM_PROVIDER to gemini, groq, or xai in the environment.",
    )
