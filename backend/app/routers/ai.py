from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import get_current_user
from ..services.llm.base import LLMUnavailable, get_llm

router = APIRouter(prefix="/api/ai", tags=["ai"], dependencies=[Depends(get_current_user)])

SYSTEM_PROMPT = (
    "You are the assistant inside SwingLens, a stock research platform. "
    "Be concise and factual, 3-5 sentences maximum. You have NO live market "
    "data in this chat — never state prices or invent numbers. If the user "
    "asks you to analyze a stock, find a setup, or give targets, tell them "
    "to load the symbol on the chart and press the gold Analyze button: that "
    "pipeline computes real levels from real data and draws them on the "
    "chart, which you cannot do from chat. Answer general concept questions "
    "(what is RSI, what is a breakout) normally. Never present yourself as a "
    "financial adviser; everything is research and education."
)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


@router.post("/chat")
def chat(body: ChatIn):
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
    return {"reply": reply, "provider": llm.provider_name}


@router.get("/status")
def status():
    try:
        return get_llm().status()
    except LLMUnavailable as exc:
        return {"online": False, "detail": exc.message}
