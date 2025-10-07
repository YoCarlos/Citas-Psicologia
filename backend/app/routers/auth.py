# app/routers/auth.py
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from jose import jwt
from passlib.context import CryptContext
from fastapi.security import OAuth2PasswordRequestForm  # 👈 nuevo

from ..db import get_db
from ..config import settings
from .. import models

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---------- Schemas ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = Field(default="patient", pattern="^(doctor|patient)$")
    doctor_id: Optional[int] = None
    region: Optional[str] = Field(default=None)

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int

class LoginIn(BaseModel):
    email: EmailStr
    password: str

# ---------- Helpers ----------
def create_access_token(data: dict, expires_minutes: int) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALG)

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def _issue_token_for_user(user: models.User) -> TokenOut:
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    claims = {
        "sub": str(user.id),
        "email": user.email,
        "role": role,
        "name": user.name,
    }
    if role == "patient" and user.doctor_id:
        claims["doctor_id"] = user.doctor_id
    expires = settings.ACCESS_TOKEN_EXPIRE_MINUTES
    token = create_access_token(data=claims, expires_minutes=expires)
    return TokenOut(access_token=token, expires_in=expires)

# ---------- Endpoints ----------
@router.post("/register", status_code=201)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    name = (payload.name or payload.full_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name es requerido")

    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="El correo ya está registrado")

    role = payload.role or "patient"
    if role not in ("doctor", "patient"):
        raise HTTPException(status_code=400, detail="role inválido")

    user = models.User(
        name=name,
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role=role,
        doctor_id=payload.doctor_id if role == "patient" else None,
        region=payload.region,
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "region": user.region,
        "doctor_id": user.doctor_id,
        "created_at": user.created_at,
    }

# --- Login JSON (para tu frontend actual) ---
@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")
    return _issue_token_for_user(user)

# --- Login FORM (para Swagger /docs con OAuth2PasswordRequestForm) ---
@router.post("/token", response_model=TokenOut)
def login_token(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # Swagger envía "username" como el identificador; usamos email como username
    email = form.username.lower().strip()
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")
    return _issue_token_for_user(user)
