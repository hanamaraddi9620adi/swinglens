from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import get_current_user
from ..services.llm.base import LLMUnavailable, get_llm

router = APIRouter(prefix="/api/ai", tags=["ai"], dependencies=[Depends(get_current_user)])

SYSTEM_PROMPT = (
    "You are the analysis assistant inside SwingLens, a stock research platform. "
    "Be concise and factual. You do not have live market data in this chat yet "
    "(that arrives in Phase 2), so never state current prices or invent numbers — "
    "if asked for live data, say the charting panel is the source of truth. "
    "Never present yourself as a financial adviser; frame everything as research "
    "and education."
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
