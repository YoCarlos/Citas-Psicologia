# app/routers/clinical_histories.py
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List, Optional

from ..db import get_db
from .. import models, schemas
from ..security import require_role

router = APIRouter(prefix="/clinical_histories", tags=["clinical_histories"])

def _ensure_patient(db: Session, patient_id: int) -> models.User:
    pat = db.get(models.User, patient_id)
    if not pat or pat.role != models.UserRole.patient:
        raise HTTPException(status_code=400, detail="patient_id debe ser un paciente válido.")
    return pat

@router.post(
    "",
    response_model=schemas.ClinicalHistoryOut,
    status_code=201,
    dependencies=[Depends(require_role(models.UserRole.doctor))],
)
def create_ch(payload: schemas.ClinicalHistoryCreate, db: Session = Depends(get_db)):
    _ensure_patient(db, payload.patient_id)
    data = payload.canonical_dict()
    ch = models.ClinicalHistory(
        patient_id=payload.patient_id,
        **data
    )
    db.add(ch)
    db.commit()
    db.refresh(ch)
    return ch

@router.get("", response_model=List[schemas.ClinicalHistoryOut])
def list_ch(
    db: Session = Depends(get_db),
    patient_id: Optional[int] = None,
    skip: int = 0,
    limit: int = Query(100, le=500),
):
    stmt = select(models.ClinicalHistory).order_by(models.ClinicalHistory.id.desc())
    if patient_id:
        stmt = stmt.where(models.ClinicalHistory.patient_id == patient_id)
    stmt = stmt.offset(skip).limit(limit)
    return list(db.scalars(stmt))

@router.get("/{id}", response_model=schemas.ClinicalHistoryOut)
def get_ch(id: int, db: Session = Depends(get_db)):
    ch = db.get(models.ClinicalHistory, id)
    if not ch:
        raise HTTPException(status_code=404, detail="No encontrado")
    return ch

@router.put(
    "/{id}",
    response_model=schemas.ClinicalHistoryOut,
    dependencies=[Depends(require_role(models.UserRole.doctor))],
)
def update_ch(id: int, payload: schemas.ClinicalHistoryUpdate, db: Session = Depends(get_db)):
    ch = db.get(models.ClinicalHistory, id)
    if not ch:
        raise HTTPException(status_code=404, detail="No encontrado")


    canon = payload.canonical_dict()
    updates = {k: v for k, v in canon.items() if v is not None}


    for f, v in updates.items():
        setattr(ch, f, v)

    db.commit()
    db.refresh(ch)
    return ch

@router.delete(
    "/{id}",
    status_code=204,
    dependencies=[Depends(require_role(models.UserRole.doctor))],
)
def delete_ch(id: int, db: Session = Depends(get_db)):
    ch = db.get(models.ClinicalHistory, id)
    if not ch:
        raise HTTPException(status_code=404, detail="No encontrado")
    db.delete(ch)
    db.commit()
    return None
