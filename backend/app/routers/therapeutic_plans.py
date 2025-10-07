# app/routers/therapeutic_plans.py
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List
from ..db import get_db
from .. import models, schemas
from ..security import require_role

router = APIRouter(prefix="/therapeutic_plans", tags=["therapeutic_plans"])

@router.post("", response_model=schemas.TherapeuticPlanOut, status_code=201, dependencies=[Depends(require_role(models.UserRole.doctor))])
def create_tp(payload: schemas.TherapeuticPlanCreate, db: Session = Depends(get_db)):
    pat = db.get(models.User, payload.patient_id)
    if not pat or pat.role != models.UserRole.patient:
        raise HTTPException(400, "patient_id debe ser un paciente")
    tp = models.TherapeuticPlan(**payload.model_dump())
    db.add(tp); db.commit(); db.refresh(tp); return tp

@router.get("", response_model=List[schemas.TherapeuticPlanOut])
def list_tp(db: Session = Depends(get_db), patient_id: int | None = None, skip: int = 0, limit: int = Query(100, le=500)):
    stmt = select(models.TherapeuticPlan).order_by(models.TherapeuticPlan.id.desc())
    if patient_id:
        stmt = stmt.where(models.TherapeuticPlan.patient_id == patient_id)
    stmt = stmt.offset(skip).limit(limit)
    return list(db.scalars(stmt))

@router.get("/{id}", response_model=schemas.TherapeuticPlanOut)
def get_tp(id: int, db: Session = Depends(get_db)):
    tp = db.get(models.TherapeuticPlan, id)
    if not tp: raise HTTPException(404, "No encontrado")
    return tp

@router.put("/{id}", response_model=schemas.TherapeuticPlanOut, dependencies=[Depends(require_role(models.UserRole.doctor))])
def update_tp(id: int, payload: schemas.TherapeuticPlanUpdate, db: Session = Depends(get_db)):
    tp = db.get(models.TherapeuticPlan, id)
    if not tp: raise HTTPException(404, "No encontrado")
    for f, v in payload.model_dump(exclude_unset=True).items(): setattr(tp, f, v)
    db.commit(); db.refresh(tp); return tp

@router.delete("/{id}", status_code=204, dependencies=[Depends(require_role(models.UserRole.doctor))])
def delete_tp(id: int, db: Session = Depends(get_db)):
    tp = db.get(models.TherapeuticPlan, id)
    if not tp: raise HTTPException(404, "No encontrado")
    db.delete(tp); db.commit(); return None
