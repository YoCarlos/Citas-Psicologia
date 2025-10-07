# app/routers/patients.py
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List, Optional

from ..db import get_db
from .. import models, schemas
from ..security import require_role, get_current_user

router = APIRouter(prefix="/patients", tags=["patients"])

# -----------------------------
# Endpoints "self-service"
# -----------------------------

@router.get("/me", response_model=schemas.PatientProfileOut)
def get_my_profile(current=Depends(get_current_user), db: Session = Depends(get_db)):
    if current.role != models.UserRole.patient:
        raise HTTPException(status_code=403, detail="Solo pacientes.")
    prof = db.get(models.PatientProfile, current.id)
    if not prof:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    return prof

@router.post("/me", response_model=schemas.PatientProfileOut, status_code=201)
def create_my_profile(
    payload: schemas.PatientProfileUpdate,
    current=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current.role != models.UserRole.patient:
        raise HTTPException(status_code=403, detail="Solo pacientes.")
    existing = db.get(models.PatientProfile, current.id)
    if existing:
        raise HTTPException(status_code=409, detail="Ya tienes un perfil creado.")
    prof = models.PatientProfile(
        user_id=current.id,
        residence=payload.residence,
        emergency_contact=payload.emergency_contact,
        whatsapp=payload.whatsapp,
        reason=payload.reason,
    )
    db.add(prof)
    db.commit()
    db.refresh(prof)
    return prof

@router.put("/me", response_model=schemas.PatientProfileOut)
def update_my_profile(
    payload: schemas.PatientProfileUpdate,
    current=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current.role != models.UserRole.patient:
        raise HTTPException(status_code=403, detail="Solo pacientes.")
    prof = db.get(models.PatientProfile, current.id)
    if not prof:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(prof, f, v)
    db.commit()
    db.refresh(prof)
    return prof

# -----------------------------
# Endpoints para la doctora
# -----------------------------

@router.post(
    "",
    response_model=schemas.PatientProfileOut,
    status_code=201,
    dependencies=[Depends(require_role(models.UserRole.doctor))],
)
def create_profile(payload: schemas.PatientProfileCreate, db: Session = Depends(get_db)):
    user = db.get(models.User, payload.user_id)
    if not user or user.role != models.UserRole.patient:
        raise HTTPException(400, "user_id debe ser un paciente")
    prof = models.PatientProfile(
        user_id=payload.user_id,
        residence=payload.residence,
        emergency_contact=payload.emergency_contact,
        whatsapp=payload.whatsapp,
        reason=payload.reason,
    )
    db.add(prof)
    db.commit()
    db.refresh(prof)
    return prof

@router.get("", response_model=List[schemas.PatientProfileOut])
def list_profiles(
    db: Session = Depends(get_db),
    doctor_id: Optional[int] = None,
    skip: int = 0,
    limit: int = Query(50, le=200),
):
    stmt = select(models.PatientProfile)
    if doctor_id is not None:
        stmt = (
            stmt.join(models.User, models.User.id == models.PatientProfile.user_id)
            .where(models.User.doctor_id == doctor_id)
        )
    stmt = stmt.offset(skip).limit(limit)
    return list(db.scalars(stmt))

@router.get("/{user_id:int}", response_model=schemas.PatientProfileOut)
def get_profile(user_id: int, db: Session = Depends(get_db)):
    prof = db.get(models.PatientProfile, user_id)
    if not prof:
        raise HTTPException(404, "Perfil no encontrado")
    return prof

@router.put("/{user_id:int}", response_model=schemas.PatientProfileOut)
def update_profile(
    user_id: int,
    payload: schemas.PatientProfileUpdate,
    db: Session = Depends(get_db),
    current=Depends(get_current_user),
):
    # permitir doctora o el mismo paciente
    if not (
        (current.role == models.UserRole.doctor) or
        (current.role == models.UserRole.patient and current.id == user_id)
    ):
        raise HTTPException(403, "Permisos insuficientes")

    prof = db.get(models.PatientProfile, user_id)
    if not prof:
        raise HTTPException(404, "Perfil no encontrado")

    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(prof, f, v)
    db.commit()
    db.refresh(prof)
    return prof


@router.delete(
    "/{user_id:int}",
    status_code=204,
    dependencies=[Depends(require_role(models.UserRole.doctor))],
)
def delete_profile(user_id: int, db: Session = Depends(get_db)):
    prof = db.get(models.PatientProfile, user_id)
    if not prof:
        raise HTTPException(404, "Perfil no encontrado")
    db.delete(prof)
    db.commit()
    return None
