# app/security.py
from datetime import datetime, timezone
from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from . import models

# Para /docs: FastAPI usa tokenUrl para probar OAuth2 password flow
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    """
    Decodifica el JWT, valida expiración y devuelve el usuario de DB.
    Espera claims: sub (id), email, role, name, exp
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autorizado",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
    except JWTError:
        raise credentials_exc

    sub = payload.get("sub")
    if not sub:
        raise credentials_exc

    # Validación extra de exp (por si el cliente no la respeta)
    exp = payload.get("exp")
    if exp is not None:
        now_ts = int(datetime.now(timezone.utc).timestamp())
        if now_ts >= int(exp):
            raise credentials_exc

    try:
        user_id = int(sub)
    except (TypeError, ValueError):
        raise credentials_exc

    user = db.get(models.User, user_id)
    if not user:
        raise credentials_exc

    return user


def require_role(required_role: models.UserRole) -> Callable:
    """
    Dependencia para endpoints:
        @router.get(..., dependencies=[Depends(require_role(models.UserRole.doctor))])
    """
    def _dep(current: models.User = Depends(get_current_user)) -> None:
        if current.role != required_role:
            raise HTTPException(status_code=403, detail="Permisos insuficientes")
    return _dep
