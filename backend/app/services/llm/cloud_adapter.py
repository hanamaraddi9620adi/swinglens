"""Hosted LLM adapters with quota-aware key/provider failover."""
from __future__ import annotations

import logging
import time

import httpx

from ... import config
from .base import LLMAdapter, LLMUnavailable

logger = logging.getLogger(__name__)

_HINT = (
    "Configure valid keys in GEMINI_API_KEYS or GROQ_API_KEYS. "
    "Keys are server-side only and must be comma-separated."
)
_COOLDOWN_SECONDS = 15 * 60
_OPENAI_PROVIDERS = {
    "groq": ("https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"),
    "xai": ("https://api.x.ai/v1", "grok-3-mini"),
}
_key_cooldowns: dict[tuple[str, str], float] = {}


def _keys_for(provider: str) -> list[str]:
    pool_name = {
        "gemini": "GEMINI_API_KEYS",
        "groq": "GROQ_API_KEYS",
        "xai": "XAI_API_KEYS",
    }.get(provider)
    if not pool_name:
        return []
    pooled = getattr(config, pool_name, "")
    # CLOUD_LLM_API_KEY remains supported only for the old single-provider
    # configuration, avoiding accidental use of a Gemini key at Groq.
    legacy = ""
    configured = config.LLM_PROVIDER
    legacy_provider = config.CLOUD_LLM_PROVIDER if configured == "cloud" else configured
    if legacy_provider == provider and "," not in configured:
        legacy = config.CLOUD_LLM_API_KEY
    return list(dict.fromkeys(
        key.strip() for key in f"{pooled},{legacy}".split(",") if key.strip()
    ))


def _providers() -> list[str]:
    configured = config.LLM_PROVIDER
    if configured == "cloud":
        configured = config.CLOUD_LLM_PROVIDER
    requested = [p.strip().lower() for p in configured.split(",") if p.strip()]
    # Empty key pools are not providers. This prevents xAI from appearing in
    # failover/status when it is listed but has no configured key.
    return [
        provider for provider in requested
        if provider in {"gemini", "groq", "xai"} and _keys_for(provider)
    ]


def _requested_providers() -> list[str]:
    configured = config.LLM_PROVIDER
    if configured == "cloud":
        configured = config.CLOUD_LLM_PROVIDER
    return [
        provider.strip().lower()
        for provider in configured.split(",")
        if provider.strip().lower() in {"gemini", "groq", "xai"}
    ]


def _available_keys(provider: str) -> list[str]:
    now = time.monotonic()
    return [
        key for key in _keys_for(provider)
        if _key_cooldowns.get((provider, key), 0) <= now
    ]


def _cooldown(provider: str, key: str) -> None:
    _key_cooldowns[(provider, key)] = time.monotonic() + _COOLDOWN_SECONDS


def _model_for(provider: str) -> str:
    if provider == "gemini":
        return config.GEMINI_MODEL or config.CLOUD_LLM_MODEL or "gemini-3.8-flash"
    if provider == "groq":
        return config.GROQ_MODEL or "llama-3.1-8b-instant"
    return config.CLOUD_LLM_MODEL or "grok-3-mini"


def _failure(provider: str, model: str, status_code: int, category: str) -> LLMUnavailable:
    logger.warning(
        "LLM provider failure provider=%s model=%s status=%s category=%s",
        provider, model, status_code, category,
    )
    messages = {
        "invalid_key": f"{provider} rejected the API key.",
        "invalid_model": f"{provider} rejected model '{model}'.",
        "quota": f"{provider} quota or rate limit reached.",
        "temporary": f"{provider} is temporarily unavailable.",
        "response": f"{provider} returned an unexpected response.",
    }
    return LLMUnavailable(
        messages[category],
        _HINT,
        category=category,
        provider=provider,
        model=model,
        status_code=status_code,
    )


class CloudAdapter(LLMAdapter):
    def __init__(self):
        self.provider_name = config.LLM_PROVIDER

    def chat(self, messages: list[dict]) -> str:
        providers = _providers()
        if not providers:
            raise LLMUnavailable(
                "No configured cloud LLM provider has an available key.",
                _HINT,
                category="no_keys",
            )

        attempted: list[str] = []
        failures: list[LLMUnavailable] = []
        last_error: LLMUnavailable | None = None
        for provider in providers:
            for key in _available_keys(provider):
                attempted.append(provider)
                try:
                    if provider == "gemini":
                        reply = self._gemini_chat(messages, key)
                    else:
                        reply = self._openai_compatible_chat(messages, provider, key)
                    self.provider_name = provider
                    return reply
                except LLMUnavailable as exc:
                    last_error = exc
                    failures.append(exc)
                    if exc.category in {"invalid_key", "quota", "temporary"}:
                        _cooldown(provider, key)

        providers_used = ", ".join(dict.fromkeys(attempted)) or ", ".join(providers)
        reasons = "; ".join(
            f"{failure.provider or provider}={failure.category}"
            f"({failure.status_code or 'network'})"
            for provider, failure in zip(attempted, failures)
        )
        if failures and all(failure.category == "invalid_model" for failure in failures):
            raise LLMUnavailable(
                "Configured cloud model IDs were rejected.",
                f"Provider diagnostics: {reasons}. Check GEMINI_MODEL and GROQ_MODEL.",
                category="invalid_model",
            )
        exhaustion = LLMUnavailable(
            "All configured cloud LLM keys are unavailable or exhausted.",
            f"Tried {providers_used}. Diagnostics: {reasons}. "
            "Retry temporary failures later; check rejected keys/models.",
            category="exhausted",
        )
        raise exhaustion from last_error

    def _openai_compatible_chat(self, messages: list[dict], provider: str, key: str) -> str:
        base_url, _ = _OPENAI_PROVIDERS[provider]
        model = _model_for(provider)
        try:
            resp = httpx.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={"model": model, "messages": messages, "stream": False},
                timeout=120.0,
            )
        except httpx.HTTPError as exc:
            raise _failure(provider, model, 0, "temporary") from exc
        if resp.status_code in (401, 403):
            category = "invalid_key"
        elif resp.status_code == 404 or resp.status_code == 400:
            category = "invalid_model"
        elif resp.status_code == 429:
            category = "quota"
        elif resp.status_code >= 500:
            category = "temporary"
        elif resp.status_code != 200:
            category = "temporary"
        else:
            category = ""
        if category:
            raise _failure(provider, model, resp.status_code, category)
        try:
            return resp.json()["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError, TypeError, AttributeError) as exc:
            raise _failure(provider, model, 200, "response") from exc

    def _gemini_chat(self, messages: list[dict], key: str) -> str:
        system_parts = [m["content"] for m in messages if m["role"] == "system"]
        contents = [
            {
                "role": "model" if message["role"] == "assistant" else "user",
                "parts": [{"text": message["content"]}],
            }
            for message in messages
            if message["role"] != "system"
        ]
        if system_parts:
            contents.insert(0, {"role": "user", "parts": [{"text": system_parts[0]}]})
        model = _model_for("gemini")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        try:
            resp = httpx.post(
                url,
                params={"key": key},
                json={"contents": contents},
                timeout=120.0,
            )
        except httpx.HTTPError as exc:
            raise _failure("gemini", model, 0, "temporary") from exc
        if resp.status_code in (401, 403):
            category = "invalid_key"
        elif resp.status_code == 404 or resp.status_code == 400:
            category = "invalid_model"
        elif resp.status_code == 429:
            category = "quota"
        elif resp.status_code >= 500:
            category = "temporary"
        elif resp.status_code != 200:
            category = "temporary"
        else:
            category = ""
        if category:
            raise _failure("gemini", model, resp.status_code, category)
        try:
            return resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        except (KeyError, IndexError, TypeError, AttributeError) as exc:
            raise _failure("gemini", model, 200, "response") from exc

    def status(self) -> dict:
        configured = _providers()
        requested = _requested_providers()
        available = sum(len(_available_keys(provider)) for provider in configured)
        cooldowns = sum(len(_keys_for(provider)) - len(_available_keys(provider))
                        for provider in configured)
        return {
            "online": available > 0,
            "provider": config.LLM_PROVIDER,
            "providers": configured,
            "configured_keys": sum(len(_keys_for(provider)) for provider in configured),
            "available_keys": available,
            "cooldown_keys": cooldowns,
            "models": {provider: _model_for(provider) for provider in configured},
            "model_installed": available > 0,
            "detail": (
                "Cloud LLM failover pool ready."
                if available
                else (
                    f"No available keys for {', '.join(requested) or 'configured providers'}."
                )
            ),
        }
