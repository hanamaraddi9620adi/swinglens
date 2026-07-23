from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class TradePlan(Base):
    """Every generated setup is stored so the platform can grade itself
    later (Phase 2 roadmap: the public accuracy scorecard)."""
    __tablename__ = "trade_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    symbol = Column(String(24), index=True, nullable=False)
    interval = Column(String(8), nullable=False)
    setup_state = Column(String(48), nullable=False)
    entry_low = Column(Float)
    entry_high = Column(Float)
    stop_loss = Column(Float)
    target1 = Column(Float)
    target2 = Column(Float)
    risk_reward = Column(Float)
    confidence = Column(Integer)
    status = Column(String(16), default="open")  # open | hit_t1 | hit_t2 | stopped | expired
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
