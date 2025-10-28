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

def overlaps_utc(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    # Asegurar UTC
    a_start = to_utc(a_start); a_end = to_utc(a_end)
    b_start = to_utc(b_start); b_end = to_utc(b_end)
    return (a_start < b_end) and (a_end > b_start)

# Crear un bloqueo (vacaciones, día u horas)
@router.post(
    "",
    response_model=schemas.CalendarBlockOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(models.UserRole.doctor))],
)
def create_block(payload: schemas.CalendarBlockCreate, current=Depends(get_current_user), db: Session = Depends(get_db)):
    # La doctora sólo puede crear para sí misma (o deja una puerta para admin)
    if current.role != models.UserRole.doctor and payload.doctor_id != current.id:
        raise HTTPException(403, "No puedes crear bloqueos para otro doctor.")

    s = to_utc(payload.start_at)
    e = to_utc(payload.end_at)
    if e <= s:
        raise HTTPException(400, "Rango horario inválido")

    # Opcional: no permitir pasado
    now = datetime.now(timezone.utc)
    if e <= now:
        raise HTTPException(400, "No puedes bloquear tiempo completamente en el pasado.")

    # 1) Conflictos con citas confirmadas o pendientes (vigentes)
    #    Si hay, rechazamos (v1). Podrías agregar un flag 'force' para reagendar/cancelar en masa en otra iteración.
    appt_stmt = (
        select(models.Appointment)
        .where(models.Appointment.doctor_id == payload.doctor_id)
        .where(
            or_(
                models.Appointment.status == models.AppointmentStatus.confirmed,
                models.Appointment.status == models.AppointmentStatus.pending,
            )
        )
        .where(models.Appointment.start_at < e)
        .where(models.Appointment.end_at > s)
    )
    conflicts = list(db.scalars(appt_stmt))
    if conflicts:
        raise HTTPException(
            409,
            f"Existen {len(conflicts)} cita(s) dentro de ese rango. Reagenda/cancela antes de bloquear."
        )

    # 2) Guardar el bloqueo
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

    if date_from and date_to:
        f = to_utc(date_from); t = to_utc(date_to)
        stmt = stmt.where(models.CalendarBlock.start_at < t).where(models.CalendarBlock.end_at > f)

    stmt = stmt.offset(skip).limit(limit)
    return list(db.scalars(stmt))

# Eliminar bloqueo
@router.delete(
    "/{block_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(models.UserRole.doctor))],
)
def delete_block(block_id: int, current=Depends(get_current_user), db: Session = Depends(get_db)):
    b = db.get(models.CalendarBlock, block_id)
    if not b:
        raise HTTPException(404, "No encontrado")

    if current.role != models.UserRole.doctor and b.doctor_id != current.id:
        raise HTTPException(403, "No puedes eliminar bloqueos de otro doctor.")

    db.delete(b)
    db.commit()
    return None
