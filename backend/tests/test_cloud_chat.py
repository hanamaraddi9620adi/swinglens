import uuid
import httpx
import jwt
import pytest
from fastapi.testclient import TestClient
from app import config
from app.main import app
from app.services.llm import cloud_adapter as cloud
from app.services.llm.base import LLMUnavailable

@pytest.fixture(autouse=True)
def providers(monkeypatch):
    cloud._key_cooldowns.clear()
    for name, value in {"LLM_PROVIDER": "gemini,groq", "GEMINI_API_KEYS": "gemini-test", "GROQ_API_KEYS": "groq-test",
                        "GEMINI_API_KEY": "", "GROQ_API_KEY": "", "CLOUD_LLM_API_KEY": ""}.items():
        monkeypatch.setattr(config, name, value)
    def deny_network(*args, **kwargs):
        raise AssertionError("Unexpected live provider call in unit test")
    monkeypatch.setattr(cloud.httpx, "post", deny_network)

def response(code, data=None):
    return httpx.Response(code, json=data or {})

def test_gemini_system_instruction_header_and_text_parts(monkeypatch):
    def post(url, **kwargs):
        assert kwargs['headers'] == {'x-goog-api-key': 'gemini-test'}
        assert 'params' not in kwargs
        assert kwargs['json']['systemInstruction']['parts'][0]['text'] == 'Rules'
        assert kwargs['json']['contents'][0]['role'] == 'user'
        return response(200, {'candidates': [{'content': {'parts': [{'text': 'private', 'thought': True}, {'text': 'Hello'}, {'text': 'World'}]}}]})
    monkeypatch.setattr(cloud.httpx, 'post', post)
    adapter = cloud.CloudAdapter()
    assert adapter.chat([{'role': 'system', 'content': 'Rules'}, {'role': 'user', 'content': 'Hi'}]) == 'Hello\nWorld'
    assert adapter.provider_name == 'gemini'

@pytest.mark.parametrize('failure', [400, 401, 404, 429, 500, 503])
def test_provider_failover(monkeypatch, failure):
    calls = []
    def post(url, **kwargs):
        calls.append(url)
        return response(failure) if 'googleapis' in url else response(200, {'choices': [{'message': {'content': 'Groq answer'}}]})
    monkeypatch.setattr(cloud.httpx, 'post', post)
    adapter = cloud.CloudAdapter()
    assert adapter.chat([{'role': 'user', 'content': 'Hi'}]) == 'Groq answer'
    assert adapter.provider_name == 'groq' and len(calls) == 2

@pytest.mark.parametrize('payload', [[], {}, {'candidates': []}, {'candidates': [{'content': {'parts': [{'text': ''}]}}]}])
def test_malformed_gemini_falls_back(monkeypatch, payload):
    monkeypatch.setattr(cloud.httpx, 'post', lambda url, **kw: httpx.Response(200, json=payload) if 'googleapis' in url else response(200, {'choices': [{'message': {'content': 'Fallback'}}]}))
    assert cloud.CloudAdapter().chat([{'role': 'user', 'content': 'Hi'}]) == 'Fallback'

def test_non_json_and_timeout_are_sanitized(monkeypatch):
    monkeypatch.setattr(cloud.httpx, 'post', lambda *a, **k: httpx.Response(200, text='<html>down</html>'))
    with pytest.raises(LLMUnavailable):
        cloud.CloudAdapter().chat([{'role': 'user', 'content': 'Hi'}])
    cloud._key_cooldowns.clear()
    def timeout(*args, **kwargs):
        raise httpx.ReadTimeout('secret-request-value')
    monkeypatch.setattr(cloud.httpx, 'post', timeout)
    with pytest.raises(LLMUnavailable) as caught:
        cloud.CloudAdapter().chat([{'role': 'user', 'content': 'Hi'}])
    assert 'secret-request-value' not in str(caught.value)

def test_no_keys_and_status_does_not_claim_verified(monkeypatch):
    assert cloud.CloudAdapter().status()['verified'] is False
    monkeypatch.setattr(config, 'GEMINI_API_KEYS', '')
    monkeypatch.setattr(config, 'GROQ_API_KEYS', '')
    with pytest.raises(LLMUnavailable) as caught:
        cloud.CloudAdapter().chat([])
    assert caught.value.category == 'no_keys'
    assert not cloud.CloudAdapter().status()['online']

def test_quota_cools_all_provider_keys(monkeypatch):
    monkeypatch.setattr(config, 'GEMINI_API_KEYS', 'key-one,key-two')
    monkeypatch.setattr(cloud.httpx, 'post', lambda url, **kw: response(429))
    with pytest.raises(LLMUnavailable):
        cloud.CloudAdapter().chat([])
    assert not cloud._available_keys('gemini')

@pytest.fixture
def client():
    return TestClient(app)

def account(client):
    name = 'test_' + uuid.uuid4().hex[:12]
    result = client.post('/api/auth/register', json={'username': name, 'email': name + '@example.com', 'password': 'test-password'})
    assert result.status_code == 200
    return {'Authorization': 'Bearer ' + result.json()['access_token']}

def test_blank_message_and_context_limits(client):
    headers = account(client)
    assert client.post('/api/ai/chat', headers=headers, json={'message': '   '}).status_code == 422
    assert client.post('/api/ai/chat', headers=headers, json={'message': 'Hi', 'context': {'x': 'a' * 25000}}).status_code == 422

def test_chat_isolation_and_actions_without_keys(client, monkeypatch):
    headers = account(client)
    monkeypatch.setattr(config, 'GEMINI_API_KEYS', '')
    monkeypatch.setattr(config, 'GROQ_API_KEYS', '')
    result = client.post('/api/ai/chat', headers=headers, json={'message': 'scan the market'}).json()
    assert result['action']['type'] == 'scan'
    other = account(client)
    conv = result['conversation_id']
    for method, path, body in [('post', '/api/ai/chat', {'message': 'Hi', 'conversation_id': conv}),
                                ('get', f'/api/ai/conversations/{conv}/messages', None),
                                ('delete', f'/api/ai/conversations/{conv}', None)]:
        kwargs = {'headers': other}
        if body is not None:
            kwargs['json'] = body
        assert getattr(client, method)(path, **kwargs).status_code == 404

def test_failed_chat_returns_conversation_for_retry(client, monkeypatch):
    monkeypatch.setattr(config, 'GEMINI_API_KEYS', '')
    monkeypatch.setattr(config, 'GROQ_API_KEYS', '')
    result = client.post('/api/ai/chat', headers=account(client), json={'message': 'Hello'})
    assert result.status_code == 503 and result.json()['detail']['conversation_id'] > 0

def test_numeric_grounding_and_history_order(client, monkeypatch):
    seen = []
    def chat(self, messages):
        seen.append(messages)
        return 'The price is 123.45. It will reach 98765 next week.'
    monkeypatch.setattr(cloud.CloudAdapter, 'chat', chat)
    headers = account(client)
    first = client.post('/api/ai/chat', headers=headers, json={'message': 'Explain the price', 'context': {'price': 123.45}}).json()
    assert '123.45' in first['reply'] and '98765' not in first['reply']
    assert first['verification']['unsupported_sentences_removed'] == 1
    client.post('/api/ai/chat', headers=headers, json={'message': 'Tell me more', 'conversation_id': first['conversation_id']})
    assert [m['role'] for m in seen[1]] == ['system', 'user', 'assistant', 'user']

def test_chat_rate_limit(client, monkeypatch):
    monkeypatch.setattr(config, 'CHAT_REQUESTS_PER_MINUTE', 1)
    headers = account(client)
    assert client.post('/api/ai/chat', headers=headers, json={'message': 'scan the market'}).status_code == 200
    assert client.post('/api/ai/chat', headers=headers, json={'message': 'scan the market'}).status_code == 429

def test_auth_validation_and_malformed_subject(client):
    assert client.post('/api/auth/register', json={'username': '   ', 'email': 'x@y.com', 'password': 'password'}).status_code == 422
    token = jwt.encode({'sub': 'not-a-number', 'exp': 9999999999}, config.SECRET_KEY, algorithm='HS256')
    assert client.get('/api/auth/me', headers={'Authorization': 'Bearer ' + token}).status_code == 401

def test_health_and_documented_chat_route(client):
    assert client.get('/api/health').json()['status'] == 'ok'
    assert '/api/ai/chat' in client.get('/openapi.json').json()['paths']
    assert client.get('/api/does-not-exist').status_code == 404
