from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..dependencies import current_auth_session, current_user
from ..models import AuthSession, User, utcnow
from ..schemas import AuthResponse, LoginRequest, MessageResponse, UserResponse
from ..security import new_token, token_digest, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    token = new_token()
    settings = get_settings()
    db.add(
        AuthSession(
            token_hash=token_digest(token),
            user_id=user.id,
            expires_at=utcnow() + timedelta(hours=settings.session_ttl_hours),
        )
    )
    db.commit()
    return AuthResponse(token=token, user=user)


@router.post("/logout", response_model=MessageResponse)
def logout(
    auth_session: AuthSession = Depends(current_auth_session),
    db: Session = Depends(get_db),
) -> MessageResponse:
    db.delete(auth_session)
    db.commit()
    return MessageResponse(message="Logged out")


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(current_user)) -> User:
    return user

