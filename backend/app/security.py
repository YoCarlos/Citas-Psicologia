# app/security.py
from datetime import datetime, timezone
from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError  # 👈 importante

from .config import settings
from .db import get_db
from . import models

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

    # 1) Decodificar token
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
    except JWTError:
        raise credentials_exc

    sub = payload.get("sub")
    if not sub:
        raise credentials_exc

    # 2) Validar expiración
    exp = payload.get("exp")
    if exp is not None:
        now_ts = int(datetime.now(timezone.utc).timestamp())
        if now_ts >= int(exp):
            raise credentials_exc

    # 3) user_id numérico
    try:
        user_id = int(sub)
    except (TypeError, ValueError):
        raise credentials_exc

    # 4) Cargar usuario desde DB
    try:
        user = db.get(models.User, user_id)
    except OperationalError:
        # aquí es donde caía tu error:
        # sqlalchemy.exc.OperationalError: ... SSL connection has been closed unexpectedly
        # hacemos rollback y devolvemos algo más claro
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo conectar a la base de datos. Intenta de nuevo.",
        )

    if not user:
        raise credentials_exc

    return user


def require_role(required_role: models.UserRole) -> Callable:
    def _dep(current: models.User = Depends(get_current_user)) -> None:
        if current.role != required_role:
            raise HTTPException(status_code=403, detail="Permisos insuficientes")
    return _dep
