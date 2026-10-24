from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from ..auth import get_current_user
from ..services.markets import SEGMENTS, get_overview, get_segment, list_segments

router = APIRouter(prefix="/api/markets", tags=["markets"], dependencies=[Depends(get_current_user)])

@router.get("/segments")
def segments():
    return {"segments": list_segments()}

@router.get("/catalog")
def catalog():
    """Fast instrument navigation, independent of live quote availability."""
    return {"segments": [{"id": key, "label": value["label"], "group": value["group"],
                           "items": [{"symbol": symbol, "name": name} for symbol, name in value["symbols"].items()]}
                          for key, value in SEGMENTS.items()],
            "source": {"provider": "SwingLens curated instrument catalog",
                       "url": "https://github.com/hanamaraddi9620adi/swinglens",
                       "fetched_at": datetime.now(timezone.utc).isoformat(),
                       "note": "Curated instruments, not a complete exchange listing. Prices load only after selection."}}

@router.get("/overview")
def overview():
    try:
        return get_overview()
    except Exception as exc:
        raise HTTPException(502, "Market quotes are temporarily unavailable. Please retry.") from exc

@router.get("/{segment}")
def segment(segment: str):
    try:
        return get_segment(segment)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, "Market quotes are temporarily unavailable. Please retry.") from exc
