"""Account endpoints with normalized input and race-safe uniqueness checks."""
import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from ..auth import create_access_token, get_current_user, hash_password, verify_password
from ..database import get_db
from ..models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])

class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower()

class RegisterIn(LoginIn):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value):
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Username must contain at least three characters.")
        return value

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str

@router.post("/register", response_model=TokenOut)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", body.email):
        raise HTTPException(422, "That email address doesn't look valid.")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(409, "An account with this email already exists. Try signing in.")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(409, "That username is taken. Pick another one.")
    user = User(username=body.username, email=body.email, password_hash=hash_password(body.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Email or username is already registered.") from exc
    db.refresh(user)
    return TokenOut(access_token=create_access_token(user.id, user.username), username=user.username)

@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Email or password is incorrect.")
    return TokenOut(access_token=create_access_token(user.id, user.username), username=user.username)

@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "username": user.username, "email": user.email}
