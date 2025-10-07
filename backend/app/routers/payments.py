# app/routers/payments.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select
from datetime import datetime
from ..db import get_db
from .. import models, schemas
from ..security import require_role

router = APIRouter(prefix="/payments", tags=["payments"])

@router.post("", response_model=schemas.PaymentOut, status_code=201)
def create_payment(payload: schemas.PaymentCreate, db: Session = Depends(get_db)):
    appt = db.get(models.Appointment, payload.appointment_id)
    if not appt: raise HTTPException(404, "Cita no encontrada")
    if appt.status not in (models.AppointmentStatus.pending, models.AppointmentStatus.confirmed):
        raise HTTPException(400, "La cita no está en estado válido para registrar pago")
    pay = models.Payment(**payload.model_dump())
    db.add(pay); db.commit(); db.refresh(pay); return pay

@router.put("/{appointment_id}/confirm", response_model=schemas.PaymentOut, dependencies=[Depends(require_role(models.UserRole.doctor))])
def confirm_payment(appointment_id: int, db: Session = Depends(get_db)):
    pay = db.get(models.Payment, appointment_id)
    if not pay: raise HTTPException(404, "Pago no encontrado")
    pay.confirmed_by_doctor = True
    pay.confirmed_at = datetime.utcnow()
    # Al confirmar pago -> confirmar cita
    appt = db.get(models.Appointment, appointment_id)
    if appt:
        appt.status = models.AppointmentStatus.confirmed
    db.commit(); db.refresh(pay); return pay

@router.get("/{appointment_id}", response_model=schemas.PaymentOut)
def get_payment(appointment_id: int, db: Session = Depends(get_db)):
    pay = db.get(models.Payment, appointment_id)
    if not pay: raise HTTPException(404, "No encontrado")
    return pay

@router.delete("/{appointment_id}", status_code=204, dependencies=[Depends(require_role(models.UserRole.doctor))])
def delete_payment(appointment_id: int, db: Session = Depends(get_db)):
    pay = db.get(models.Payment, appointment_id)
    if not pay: raise HTTPException(404, "No encontrado")
    db.delete(pay); db.commit(); return None
