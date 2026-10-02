from fastapi import APIRouter, Depends, HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.core.allowed_emails import allowed_emails
from app.core.config import settings
from app.core.security import create_access_token, get_current_user
from app.schemas.auth import (
    DevLoginRequest,
    GoogleLoginRequest,
    TokenResponse,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _verify_google(token: str) -> dict:
    try:
        return id_token.verify_oauth2_token(
            token, google_requests.Request(), settings.GOOGLE_CLIENT_ID
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ID Token de Google invalido",
        ) from exc


@router.post("/google", response_model=TokenResponse)
def google_login(payload: GoogleLoginRequest) -> TokenResponse:
    claims = _verify_google(payload.id_token)
    email = (claims.get("email") or "").strip().lower()
    if not email or not claims.get("email_verified", False):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo de Google no verificado",
        )
    if not allowed_emails.is_allowed(email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Correo no autorizado",
        )
    user = UserOut(
        email=email, name=claims.get("name"), picture=claims.get("picture")
    )
    token = create_access_token(
        email, extra={"name": user.name, "picture": user.picture}
    )
    return TokenResponse(access_token=token, user=user)


@router.post("/dev-login", response_model=TokenResponse)
def dev_login(payload: DevLoginRequest) -> TokenResponse:
    """Login de desarrollo (solo si DEV_LOGIN_ENABLED=true). Nunca usar en produccion."""
    if not settings.DEV_LOGIN_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No disponible"
        )
    email = payload.email.strip().lower()
    if not allowed_emails.is_allowed(email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Correo no autorizado"
        )
    user = UserOut(email=email, name=email.split("@")[0])
    token = create_access_token(email, extra={"name": user.name})
    return TokenResponse(access_token=token, user=user)


@router.get("/me", response_model=UserOut)
def me(current_user: dict = Depends(get_current_user)) -> UserOut:
    return UserOut(**current_user)
