import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import get_current_user
from ..services.llm.base import LLMUnavailable, get_llm
from ..services.market_data import search_symbols

router = APIRouter(prefix="/api/ai", tags=["ai"], dependencies=[Depends(get_current_user)])

# ---------------------------------------------------------------- intent
# Deterministic, zero-hallucination: if the user asks to analyze something,
# we resolve the symbol ourselves and tell the frontend to run the REAL
# pipeline. The LLM is never asked to produce an analysis from chat.

_ANALYZE_RE = re.compile(r"\b(analy[sz]e|analysis|analyse|setup|levels|breakout|targets?)\b", re.I)
_STOPWORDS = {
    "analyze", "analyse", "analysis", "please", "give", "show", "find", "check",
    "stock", "share", "chart", "swing", "trade", "trading", "setup", "levels",
    "target", "targets", "breakout", "for", "the", "of", "me", "my", "a", "an",
    "next", "this", "that", "week", "weeks", "month", "months", "term", "short",
    "long", "term", "on", "in", "and", "do", "can", "you", "u", "its", "it",
}


def detect_analyze_intent(message: str) -> str | None:
    if not _ANALYZE_RE.search(message):
        return None
    words = re.findall(r"[A-Za-z][A-Za-z0-9.&-]*", message)
    tokens = [w for w in words if w.lower() not in _STOPWORDS]
    if not tokens:
        return None
    query = " ".join(tokens[:3])
    try:
        results = search_symbols(query)["results"]
    except Exception:
        return None
    if not results:
        return None
    # This platform is India-first: prefer NSE/BSE listings for bare names,
    # while exact US tickers (AAPL, NVDA) still win when typed as symbols.
    for r in results:
        if r["symbol"] and r["symbol"].upper() == query.upper():
            return r["symbol"]
    for r in results:
        if r["symbol"] and r["symbol"].endswith((".NS", ".BO")):
            return r["symbol"]
    return results[0]["symbol"]


SYSTEM_PROMPT = (
    "You are the assistant inside SwingLens, a stock research platform. "
    "Be concise and factual, 3-5 sentences maximum. You have NO live market "
    "data in this chat — never state prices or invent numbers. If the user "
    "asks for a stock analysis, tell them to type it like 'analyse <stock "
    "name>' so the platform runs its real data pipeline, or to press the "
    "gold Analyze button on the chart. Answer general concept questions "
    "(what is RSI, what is a breakout) normally. Never present yourself as "
    "a financial adviser; everything is research and education."
)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


@router.post("/chat")
def chat(body: ChatIn):
    # Analysis request? Resolve the symbol and hand the frontend an action —
    # the real pipeline runs, the chart gets annotated, the setup card renders.
    symbol = detect_analyze_intent(body.message)
    if symbol:
        return {
            "reply": f"Running the full analysis for {symbol} — loading the chart, "
                     f"marking the levels, and building the setup card now.",
            "provider": "intent-router",
            "action": {"type": "analyze", "symbol": symbol},
        }

    llm = get_llm()
    try:
        reply = llm.chat(
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": body.message},
            ]
        )
    except LLMUnavailable as exc:
        raise HTTPException(503, {"message": exc.message, "hint": exc.hint})
    return {"reply": reply, "provider": llm.provider_name, "action": None}


@router.get("/status")
def status():
    try:
        return get_llm().status()
    except LLMUnavailable as exc:
        return {"online": False, "detail": exc.message}
