"""Hosted providers with bounded requests and sanitized diagnostics."""
from __future__ import annotations
import logging
import time
from threading import Lock
import httpx
from ... import config
from .base import LLMAdapter, LLMUnavailable
logger = logging.getLogger(__name__)
_key_cooldowns: dict[tuple[str, str], float] = {}
_lock = Lock()
_OPENAI_PROVIDERS = {'groq': 'https://api.groq.com/openai/v1', 'xai': 'https://api.x.ai/v1'}
_HINT = "Check the server's Gemini/Groq keys and model settings, or retry later."

def _keys_for(provider):
    pool = getattr(config, f'{provider.upper()}_API_KEYS', '')
    single = getattr(config, f'{provider.upper()}_API_KEY', '')
    legacy_provider = config.CLOUD_LLM_PROVIDER if config.LLM_PROVIDER == 'cloud' else config.LLM_PROVIDER
    legacy = config.CLOUD_LLM_API_KEY if legacy_provider == provider else ''
    return list(dict.fromkeys((k.strip() for k in f'{pool},{single},{legacy}'.split(',') if k.strip())))

def _requested_providers():
    value = config.CLOUD_LLM_PROVIDER if config.LLM_PROVIDER == 'cloud' else config.LLM_PROVIDER
    return list(dict.fromkeys((p.strip() for p in value.split(',') if p.strip() in {'gemini', 'groq', 'xai'})))

def _providers():
    return [p for p in _requested_providers() if _keys_for(p)]

def _available_keys(provider):
    with _lock:
        return [k for k in _keys_for(provider) if _key_cooldowns.get((provider, k), 0) <= time.monotonic()]

def _model_for(provider):
    if provider == 'gemini':
        return config.GEMINI_MODEL
    if provider == 'groq':
        return config.GROQ_MODEL
    return config.CLOUD_LLM_MODEL or 'grok-3-mini'

def _failure(provider, status, category):
    logger.warning('LLM failure provider=%s status=%s category=%s', provider, status, category)
    return LLMUnavailable(f'{provider} could not complete the response ({category}).', _HINT, category=category, provider=provider, model=_model_for(provider), status_code=status)

def _response_json(response, provider):
    code = response.status_code
    if code != 200:
        category = 'invalid_key' if code in (401, 403) else 'invalid_model' if code == 404 else 'quota' if code == 429 else 'request' if code == 400 else 'temporary'
        raise _failure(provider, code, category)
    try:
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError('Expected an object')
        return data
    except (ValueError, TypeError) as exc:
        raise _failure(provider, code, 'response') from exc

class CloudAdapter(LLMAdapter):

    def __init__(self):
        self.provider_name = config.LLM_PROVIDER

    def chat(self, messages):
        providers = _providers()
        if not providers:
            raise LLMUnavailable('Cloud AI has not been configured.', _HINT, category='no_keys')
        failures = []
        for provider in providers:
            keys = _available_keys(provider)
            if not keys:
                continue
            key = keys[0]
            try:
                reply = self._gemini_chat(messages, key) if provider == 'gemini' else self._openai_compatible_chat(messages, provider, key)
                self.provider_name = provider
                return reply
            except LLMUnavailable as exc:
                failures.append(exc)
                duration = 60 if exc.category in {'temporary', 'response'} else 300
                with _lock:
                    for affected in _keys_for(provider) if exc.category == 'quota' else [key]:
                        _key_cooldowns[provider, affected] = time.monotonic() + duration
        category = 'invalid_model' if failures and all((e.category == 'invalid_model' for e in failures)) else 'exhausted'
        raise LLMUnavailable('Cloud AI is temporarily unavailable. Please try again later.', _HINT, category=category)

    def _post(self, provider, url, **kwargs):
        try:
            response = httpx.post(url, timeout=httpx.Timeout(config.LLM_TIMEOUT_SECONDS, connect=5.0), **kwargs)
        except httpx.HTTPError as exc:
            raise _failure(provider, 0, 'temporary') from exc
        return _response_json(response, provider)

    def _openai_compatible_chat(self, messages, provider, key):
        model = _model_for(provider)
        payload = {'model': model, 'messages': messages, 'stream': False, 'temperature': 0.3}
        if provider == 'groq':
            payload['max_completion_tokens'] = config.LLM_MAX_OUTPUT_TOKENS
            if model.startswith('openai/gpt-oss-'):
                payload['reasoning_effort'] = 'low'
        else:
            payload['max_tokens'] = config.LLM_MAX_OUTPUT_TOKENS
        data = self._post(provider, f'{_OPENAI_PROVIDERS[provider]}/chat/completions', headers={'Authorization': f'Bearer {key}'}, json=payload)
        try:
            reply = data['choices'][0]['message']['content'].strip()
            if not reply:
                raise ValueError('Empty reply')
            return reply
        except (KeyError, IndexError, TypeError, AttributeError, ValueError) as exc:
            raise _failure(provider, 200, 'response') from exc

    def _gemini_chat(self, messages, key):
        payload = {'contents': [{'role': 'model' if m['role'] == 'assistant' else 'user', 'parts': [{'text': m['content']}]} for m in messages if m['role'] != 'system'], 'generationConfig': {'maxOutputTokens': config.LLM_MAX_OUTPUT_TOKENS, 'temperature': 0.3}}
        system = [m['content'] for m in messages if m['role'] == 'system']
        if system:
            payload['systemInstruction'] = {'parts': [{'text': '\n\n'.join(system)}]}
        data = self._post('gemini', f"https://generativelanguage.googleapis.com/v1beta/models/{_model_for('gemini')}:generateContent", headers={'x-goog-api-key': key}, json=payload)
        try:
            parts = data['candidates'][0]['content']['parts']
            reply = '\n'.join((p['text'] for p in parts if isinstance(p.get('text'), str) and (not p.get('thought')))).strip()
            if not reply:
                raise ValueError('Empty or blocked reply')
            return reply
        except (KeyError, IndexError, TypeError, AttributeError, ValueError) as exc:
            raise _failure('gemini', 200, 'response') from exc

    def status(self):
        providers = _providers()
        available = sum((len(_available_keys(p)) for p in providers))
        configured = sum((len(_keys_for(p)) for p in providers))
        return {'online': available > 0, 'configured': bool(providers), 'verified': False, 'provider': config.LLM_PROVIDER, 'providers': providers, 'configured_keys': configured, 'available_keys': available, 'cooldown_keys': configured - available, 'models': {p: _model_for(p) for p in providers}, 'model_installed': available > 0, 'detail': 'Cloud AI configured; availability is checked when you send a message.' if available else 'Cloud AI is cooling down. Try again shortly.' if providers else f"No keys configured for {', '.join(_requested_providers())}. Chart analysis and market scans remain available."}
