"""Explain engine facts and remove unsupported numeric claims."""
from __future__ import annotations
import json
import math
import re
from .llm.base import LLMUnavailable, get_llm

_SECTIONS = ("pattern", "why", "confirmation", "invalidation")
_NUM_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")
_SYSTEM = (
    "Explain the supplied chart facts. Return only a JSON object with nonempty string keys "
    "pattern, why, confirmation, invalidation. Use only numeric facts in the supplied JSON. "
    "Do not invent prices, guarantees or recommendations. If there is no plan, explain why "
    "there is no clean entry. Keep each field to one or two short sentences."
)

def _allowed_numbers(payload):
    allowed = set()
    def visit(value):
        if isinstance(value, bool) or value is None:
            return
        if isinstance(value, (int, float)) and math.isfinite(value):
            for number in (str(value), f"{value:.2f}", f"{value:.1f}", f"{value:.0f}", f"{value:,.2f}", f"{value:,.0f}"):
                allowed.add(number)
                if '.' in number:
                    allowed.add(number.rstrip('0').rstrip('.'))
        elif isinstance(value, dict):
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)
    visit(payload)
    # Periods in standard indicator names, retained for compatibility.
    allowed.update({'1', '2', '14', '20', '50', '200', '100'})
    return allowed

def _verify(text, allowed):
    kept, removed = [], 0
    for sentence in re.split(r"(?<=[.!?])\s+|\n+", text.strip()):
        numbers = _NUM_RE.findall(sentence)
        if all(n in allowed or n.replace(',', '') in allowed or
               (n.replace(',', '').rstrip('0').rstrip('.') if '.' in n else n) in allowed for n in numbers):
            kept.append(sentence)
        else:
            removed += 1
    return '\n'.join(kept), removed

def _fallback(payload):
    setup, indicators = payload['setup'], payload['indicators']
    plan = setup.get('plan')
    state = setup['state'].replace('_', ' ')
    if not plan:
        watch = setup.get('watch') or {}
        support = watch.get('nearest_support')
        support_text = f"the {support['price_low']}–{support['price_high']} support zone" if support else 'an established support zone'
        return {
            'pattern': f"Current state: {state}. No clean long entry on this chart right now.",
            'why': 'The engine has not identified an entry with a suitable risk-reward balance.',
            'confirmation': f"Watch for a controlled pullback that holds {support_text}, or a confirmed breakout on stronger volume.",
            'invalidation': 'A break below established support weakens the bullish case. Waiting is a valid choice.',
        }
    return {
        'pattern': f"Detected state: {state}, bias {setup['bias']}, last price {indicators['last_close']}.",
        'why': f"Computed entry zone: {plan['entry_low']}–{plan['entry_high']}; protective stop: {plan['stop_loss']}.",
        'confirmation': f"Volume ratio: {indicators['volume_ratio']}. Computed targets: {plan['target1']} and {plan['target2']}; risk-reward: {plan['risk_reward']}.",
        'invalidation': f"A close below {plan['stop_loss']} invalidates this setup.",
    }

def narrate(payload):
    try:
        llm = get_llm()
        facts = {k: payload[k] for k in ('setup', 'indicators', 'zones')}
        raw = llm.chat([{'role': 'system', 'content': _SYSTEM}, {'role': 'user', 'content': json.dumps(facts, ensure_ascii=False)}])
        raw = raw.strip().removeprefix('```json').removeprefix('```').removesuffix('```').strip()
        parsed = json.loads(raw)
        if not isinstance(parsed, dict) or any(not isinstance(parsed.get(k), str) or not parsed[k].strip() for k in _SECTIONS):
            raise ValueError('Invalid narration schema')
        allowed, fallback = _allowed_numbers(payload), _fallback(payload)
        narration, removed_total = {}, 0
        for key in _SECTIONS:
            clean, removed = _verify(parsed[key], allowed)
            narration[key] = clean or fallback[key]
            removed_total += removed
        return narration, {'status': 'edited' if removed_total else 'verified', 'unsupported_sentences_removed': removed_total, 'provider': llm.provider_name}
    except (LLMUnavailable, ValueError, TypeError, AttributeError):
        return _fallback(payload), {'status': 'template_fallback', 'detail': 'Cloud AI unavailable or response invalid; explanation generated from computed facts.'}
