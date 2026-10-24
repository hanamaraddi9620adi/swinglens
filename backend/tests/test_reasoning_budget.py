from app import config
from app.services.llm.cloud_adapter import CloudAdapter


def test_groq_reasoning_budget_preserves_final_answer(monkeypatch):
    monkeypatch.setattr(config, 'GROQ_MODEL', 'openai/gpt-oss-20b')
    def post(self, provider, url, **kwargs):
        payload = kwargs['json']
        assert payload['reasoning_effort'] == 'low'
        assert payload['max_completion_tokens'] == config.LLM_MAX_OUTPUT_TOKENS
        assert 'max_tokens' not in payload
        return {'choices': [{'message': {'content': 'Final answer', 'reasoning': 'Never display internal reasoning'}}]}
    monkeypatch.setattr(CloudAdapter, '_post', post)
    assert CloudAdapter()._openai_compatible_chat([], 'groq', 'test') == 'Final answer'


def test_nonreasoning_groq_models_do_not_receive_reasoning_option(monkeypatch):
    monkeypatch.setattr(config, 'GROQ_MODEL', 'llama-3.3-70b-versatile')
    def post(self, provider, url, **kwargs):
        assert 'reasoning_effort' not in kwargs['json']
        return {'choices': [{'message': {'content': 'Answer'}}]}
    monkeypatch.setattr(CloudAdapter, '_post', post)
    assert CloudAdapter()._openai_compatible_chat([], 'groq', 'test') == 'Answer'
