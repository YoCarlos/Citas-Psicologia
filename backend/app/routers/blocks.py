# app/routers/blocks.py
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, or_
from datetime import datetime, timezone
from typing import List, Optional

from ..db import get_db
from .. import models, schemas
from ..security import require_role, get_current_user
from ..utils.tz import to_utc

router = APIRouter(prefix="/blocks", tags=["blocks"])


# Crear un bloqueo (vacaciones, día u horas)
@router.post(
    "",
    response_model=schemas.CalendarBlockOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(models.UserRole.doctor))],
)
def create_block(
    payload: schemas.CalendarBlockCreate,
    current = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # La doctora sólo puede crear para sí misma
    if payload.doctor_id != current.id:
        raise HTTPException(status_code=403, detail="No puedes crear bloqueos para otra doctora.")

    s = to_utc(payload.start_at)
    e = to_utc(payload.end_at)
    if e <= s:
        raise HTTPException(status_code=400, detail="Rango horario inválido")

    # Opcional: no permitir completamente en el pasado
    now = datetime.now(timezone.utc)
    if e <= now:
        raise HTTPException(status_code=400, detail="No puedes bloquear tiempo completamente en el pasado.")

    # 1) Conflictos con citas confirmadas o pendientes (con hold vigente)
    status_processing = getattr(models.AppointmentStatus, "processing", models.AppointmentStatus.pending)

    appt_stmt = (
        select(models.Appointment.id)
        .where(models.Appointment.doctor_id == payload.doctor_id)
        .where(models.Appointment.start_at < e)
        .where(models.Appointment.end_at > s)
        .where(
            or_(
                models.Appointment.status == models.AppointmentStatus.confirmed,
                and_(
                    models.Appointment.status.in_([models.AppointmentStatus.pending, status_processing]),
                    or_(
                        models.Appointment.hold_until == None,  # noqa: E711
                        models.Appointment.hold_until > now,
                    ),
                ),
            )
        )
    )
    appt_conflict_id = db.scalar(appt_stmt)
    if appt_conflict_id:
        raise HTTPException(
            status_code=409,
            detail="Existen citas dentro de ese rango. Reagenda/cancela antes de bloquear."
        )

    # 2) Guardar el bloqueo (guardamos SIEMPRE en UTC)
    b = models.CalendarBlock(
        doctor_id=payload.doctor_id,
        start_at=s,
        end_at=e,
        all_day=payload.all_day,
        reason=payload.reason,
        created_by=current.id,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


# Listar bloqueos por doctor y/o por rango
@router.get("", response_model=List[schemas.CalendarBlockOut])
def list_blocks(
    db: Session = Depends(get_db),
    doctor_id: Optional[int] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    skip: int = 0,
    limit: int = Query(200, le=1000),
):
    stmt = select(models.CalendarBlock).order_by(models.CalendarBlock.start_at.asc())

    if doctor_id:
        stmt = stmt.where(models.CalendarBlock.doctor_id == doctor_id)

    # Filtros de rango (guardados en UTC)
    if date_from and date_to:
        f = to_utc(date_from); t = to_utc(date_to)
        stmt = stmt.where(models.CalendarBlock.start_at < t).where(models.CalendarBlock.end_at > f)
    elif date_from:
        f = to_utc(date_from)
        stmt = stmt.where(models.CalendarBlock.end_at > f)
    elif date_to:
        t = to_utc(date_to)
        stmt = stmt.where(models.CalendarBlock.start_at < t)

    stmt = stmt.offset(skip).limit(limit)
    return list(db.scalars(stmt))


# Eliminar bloqueo
@router.delete(
    "/{block_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(models.UserRole.doctor))],
)
def delete_block(
    block_id: int,
    current = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    b = db.get(models.CalendarBlock, block_id)
    if not b:
        raise HTTPException(status_code=404, detail="No encontrado")

    # La doctora sólo puede eliminar sus propios bloqueos
    if b.doctor_id != current.id:
        raise HTTPException(status_code=403, detail="No puedes eliminar bloqueos de otra doctora.")

    db.delete(b)
    db.commit()
    return None
