# app/routers/settings.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select
from ..db import get_db
from .. import models, schemas
from ..security import require_role

router = APIRouter(prefix="/settings", tags=["settings"])

@router.get("/consultation", response_model=schemas.DoctorSettingsOut)
def get_consultation_settings(
    doctor_id: int = Query(...),
    db: Session = Depends(get_db),
):
    cfg = db.get(models.DoctorSettings, doctor_id)
    if not cfg:
        # fallback razonable si no existe registro aún
        raise HTTPException(status_code=404, detail="Aún no hay configuración para esta doctora.")
    return cfg

@router.put(
    "/consultation",
    response_model=schemas.DoctorSettingsOut,
    dependencies=[Depends(require_role(models.UserRole.doctor))]
)
def upsert_consultation_settings(
    payload: schemas.DoctorSettingsIn,
    db: Session = Depends(get_db),
):
    # verificar que el doctor exista
    doc = db.get(models.User, payload.doctor_id)
    if not doc or doc.role != models.UserRole.doctor:
        raise HTTPException(status_code=400, detail="doctor_id debe pertenecer a un usuario con rol doctor")

    cfg = db.get(models.DoctorSettings, payload.doctor_id)
    if not cfg:
        cfg = models.DoctorSettings(
            doctor_id=payload.doctor_id,
            duration_min=payload.duration_min,
            price_usd=payload.price_usd,
        )
        db.add(cfg)
    else:
        cfg.duration_min = payload.duration_min
        cfg.price_usd = payload.price_usd

    db.commit()
    db.refresh(cfg)
    return cfg
