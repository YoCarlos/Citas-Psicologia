# app/routers/users.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from typing import List, Optional

from ..db import get_db
from .. import models, schemas
from ..security import get_password_hash

router = APIRouter(prefix="/users", tags=["users"])

# Helpers
def _ensure_doctor_exists(db: Session, doctor_id: int):
    doc = db.scalar(select(models.User).where(models.User.id == doctor_id))
    if not doc or doc.role != models.UserRole.doctor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="doctor_id debe pertenecer a un usuario con rol 'doctor'."
        )
    return doc


@router.post("", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    # email único
    exists = db.scalar(
        select(func.count())
        .select_from(models.User)
        .where(models.User.email == payload.email)
    )
    if exists:
        raise HTTPException(status_code=400, detail="El correo ya está registrado.")

    # regla de negocio
    if payload.role == "patient":
        if not payload.doctor_id:
            raise HTTPException(
                status_code=400,
                detail="Los pacientes deben estar asociados a un doctor (doctor_id)."
            )
        _ensure_doctor_exists(db, payload.doctor_id)

    user = models.User(
        name=payload.name.strip(),
        email=payload.email.lower(),
        role=models.UserRole(payload.role),
        password_hash=get_password_hash(payload.password),
        doctor_id=payload.doctor_id if payload.role == "patient" else None,
        region=payload.region,  # 👈 nuevo campo
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("", response_model=List[schemas.UserOut])
def list_users(
    db: Session = Depends(get_db),
    role: Optional[str] = Query(None),           
    doctor_id: Optional[int] = None,
    q: Optional[str] = None,
    skip: int = 0,
    limit: int = Query(200, le=1000),            
):
    stmt = select(models.User).order_by(models.User.id.desc())

    if role:
        role = role.strip().lower()
        if role not in ("doctor", "patient"):
            raise HTTPException(
                status_code=400,
                detail="Parámetro role inválido (usa 'doctor' o 'patient')."
            )
        stmt = stmt.where(models.User.role == models.UserRole(role))

    if doctor_id is not None:
        stmt = stmt.where(models.User.doctor_id == doctor_id)

    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            func.lower(models.User.name).like(like) |
            func.lower(models.User.email).like(like)
        )

    stmt = stmt.offset(skip).limit(limit)
    return list(db.scalars(stmt))


@router.get("/{user_id}", response_model=schemas.UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    return user


@router.put("/{user_id}", response_model=schemas.UserOut)
def update_user(user_id: int, payload: schemas.UserUpdate, db: Session = Depends(get_db)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

 
    if payload.email and payload.email.lower() != user.email:
        exists = db.scalar(
            select(func.count())
            .select_from(models.User)
            .where(models.User.email == payload.email.lower())
        )
        if exists:
            raise HTTPException(status_code=400, detail="El correo ya está registrado por otro usuario.")
        user.email = payload.email.lower()

    if payload.name is not None:
        user.name = payload.name.strip()
    if payload.password:
        user.password_hash = get_password_hash(payload.password)

   
    new_role = models.UserRole(payload.role) if payload.role else user.role
    new_doctor_id = payload.doctor_id if payload.doctor_id is not None else user.doctor_id

    if new_role == models.UserRole.patient:
        
        if not new_doctor_id:
            raise HTTPException(
                status_code=400,
                detail="Los pacientes deben estar asociados a un doctor (doctor_id)."
            )
        _ensure_doctor_exists(db, new_doctor_id)
        user.doctor_id = new_doctor_id
    else:
       
        user.doctor_id = None

    user.role = new_role

   
    if payload.region is not None:
        user.region = payload.region

    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    # Regla: no permitir eliminar doctor con pacientes asociados
    if user.role == models.UserRole.doctor:
        count_patients = db.scalar(
            select(func.count())
            .select_from(models.User)
            .where(models.User.doctor_id == user.id)
        ) or 0
        if count_patients > 0:
            raise HTTPException(
                status_code=400,
                detail=f"No se puede eliminar el doctor: tiene {count_patients} paciente(s) asociados."
            )

    db.delete(user)
    db.commit()
    return None
