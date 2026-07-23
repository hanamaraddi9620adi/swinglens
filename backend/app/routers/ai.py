import json
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import get_current_user
from ..services.llm.base import LLMUnavailable, get_llm
from ..services.market_data import search_symbols

router = APIRouter(prefix="/api/ai", tags=["ai"], dependencies=[Depends(get_current_user)])

# ---------------------------------------------------------------- intent
# Deterministic, zero-hallucination routing: analysis requests run the REAL
# pipeline; the LLM is never asked to produce an analysis from chat.

_ANALYZE_RE = re.compile(r"\b(analy[sz]e|analysis|analyse|setup|levels|breakout|targets?)\b", re.I)
_THIS_RE = re.compile(r"\b(this|current)\s+(stock|chart|share|scrip|symbol|one)\b", re.I)
_STOPWORDS = {
    "analyze", "analyse", "analysis", "please", "give", "show", "find", "check",
    "stock", "share", "chart", "swing", "trade", "trading", "setup", "levels",
    "target", "targets", "breakout", "for", "the", "of", "me", "my", "a", "an",
    "next", "this", "that", "week", "weeks", "month", "months", "term", "short",
    "long", "on", "in", "and", "do", "can", "you", "u", "its", "it", "current",
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
    for r in results:
        if r["symbol"] and r["symbol"].upper() == query.upper():
            return r["symbol"]
    for r in results:
        if r["symbol"] and r["symbol"].endswith((".NS", ".BO")):
            return r["symbol"]
    return results[0]["symbol"]


SYSTEM_PROMPT = (
    "You are SwingLens AI - a sharp, friendly markets mentor living inside a "
    "stock research platform. Match the user's language and energy; be warm, "
    "clear, and genuinely engaging. Formatting: short paragraphs, **bold** the "
    "key idea, use a compact bulleted list only when comparing or listing "
    "things, and reach for a vivid analogy when it truly helps a beginner. "
    "Length: as short as the question allows; never pad.\n\n"
    "GROUNDING (hard rules): a CONTEXT block may accompany the question with "
    "the chart symbol, the latest computed analysis, and real fetched news "
    "headlines. You may cite ONLY numbers that literally appear in CONTEXT; "
    "if no context numbers exist, use no numbers at all. Never invent news - "
    "reference only the provided headline titles, and note which are marked "
    "confirmed vs unverified. If a question needs live data that CONTEXT "
    "lacks, say so plainly and point to the Analyze button or the news panel.\n\n"
    "You explain concepts (RSI, breakouts, stop-losses, position sizing...) "
    "masterfully at any level. You never give personal financial advice - you "
    "teach, interpret the computed facts, and let the person decide. "
    "Everything is research and education."
)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    context: dict | None = None  # {symbol, analysis, news_titles} from the UI


@router.post("/chat")
def chat(body: ChatIn):
    ctx = body.context or {}

    # "analyse this stock" -> run the pipeline on whatever chart is open.
    if _ANALYZE_RE.search(body.message) and _THIS_RE.search(body.message) and ctx.get("symbol"):
        sym = ctx["symbol"]
        return {
            "reply": f"Running the full analysis for {sym} - marking the levels and building the setup card now.",
            "provider": "intent-router",
            "action": {"type": "analyze", "symbol": sym},
        }

    # Named-stock analysis request -> resolve and route to the real pipeline.
    symbol = detect_analyze_intent(body.message)
    if symbol:
        return {
            "reply": f"Running the full analysis for {symbol} - loading the chart, "
                     f"marking the levels, and building the setup card now.",
            "provider": "intent-router",
            "action": {"type": "analyze", "symbol": symbol},
        }

    llm = get_llm()
    user_content = body.message
    if ctx:
        trimmed = json.dumps(ctx, ensure_ascii=False)[:4000]
        user_content = f"CONTEXT (cite only numbers present here):\n{trimmed}\n\nUSER: {body.message}"
    try:
        reply = llm.chat(
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
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
