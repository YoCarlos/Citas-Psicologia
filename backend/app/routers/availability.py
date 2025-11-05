# app/routers/availability.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, delete, and_
from typing import List
from datetime import datetime, timedelta, time as dtime, timezone

from ..db import get_db
from .. import models, schemas
from ..security import require_role
from ..utils.tz import (
    TZ_EC,                       # zona base América/Guayaquil
    to_utc,                      # datetime -> aware UTC
    aware_to_local_naive,        # aware UTC -> naive local (Ecuador)
    local_naive_to_aware_utc,    # naive local (Ecuador) -> aware UTC
)

router = APIRouter(prefix="/availability", tags=["availability"])


def delete_stale_holds(db: Session) -> int:
    """
    Elimina appointments en 'pending'/'processing' cuyo hold_until ya venció.
    Devuelve la cantidad de filas borradas.
    """
    now_utc = datetime.now(timezone.utc)
    status_processing = getattr(models.AppointmentStatus, "processing", models.AppointmentStatus.pending)

    # Tomamos los IDs primero para poder cancelar recordatorios si usas scheduler
    stale_ids = list(
        db.scalars(
            select(models.Appointment.id).where(
                and_(
                    models.Appointment.status.in_([models.AppointmentStatus.pending, status_processing]),
                    models.Appointment.hold_until.is_not(None),
                    models.Appointment.hold_until < now_utc,
                )
            )
        )
    )
    if not stale_ids:
        return 0

    # Si tienes scheduler/cancel_reminder_job aquí podrías importarlo y cancelarlo.
    # from ..scheduler import cancel_reminder_job
    # for appt_id in stale_ids:
    #     try: cancel_reminder_job(appt_id)
    #     except Exception: pass

    # Borrado real
    for appt_id in stale_ids:
        a = db.get(models.Appointment, appt_id)
        if a:
            db.delete(a)
    db.commit()
    return len(stale_ids)


# ==========================
# 1) ENDPOINTS: SLOTS CONCRETOS
# ==========================

@router.post(
    "",
    response_model=schemas.AvailabilityOut,
    status_code=201,
    dependencies=[Depends(require_role(models.UserRole.doctor))]
)
def create_slot(payload: schemas.AvailabilityCreate, db: Session = Depends(get_db)):
    """
    Crea un slot puntual. Se espera que el payload traiga datetimes razonables.
    Normaliza a UTC (tz-aware) antes de guardar.
    """
    doc = db.get(models.User, payload.doctor_id)
    if not doc or doc.role != models.UserRole.doctor:
        raise HTTPException(400, "doctor_id debe ser un doctor")

    start_utc = to_utc(payload.start_at)
    end_utc   = to_utc(payload.end_at)
    if not start_utc or not end_utc or end_utc <= start_utc:
        raise HTTPException(400, "Rango de tiempo inválido")

    slot = models.AvailabilitySlot(
        doctor_id=payload.doctor_id,
        start_at=start_utc,
        end_at=end_utc,
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return slot


@router.get("", response_model=List[schemas.AvailabilityOut])
def list_slots(
    db: Session = Depends(get_db),
    doctor_id: int | None = None,
    skip: int = 0,
    limit: int = Query(200, le=500)
):
    # 🧹 Opcional: limpia holds vencidos (por coherencia con paneles que inspeccionan slots)
    delete_stale_holds(db)

    stmt = select(models.AvailabilitySlot).order_by(models.AvailabilitySlot.start_at.asc())
    if doctor_id:
        stmt = stmt.where(models.AvailabilitySlot.doctor_id == doctor_id)
    stmt = stmt.offset(skip).limit(limit)
    return list(db.scalars(stmt))


@router.put(
    "/{id}",
    response_model=schemas.AvailabilityOut,
    dependencies=[Depends(require_role(models.UserRole.doctor))]
)
def update_slot(id: int, payload: schemas.AvailabilityUpdate, db: Session = Depends(get_db)):
    slot = db.get(models.AvailabilitySlot, id)
    if not slot:
        raise HTTPException(404, "No encontrado")

    data = payload.model_dump(exclude_unset=True)

    if "start_at" in data and data["start_at"]:
        data["start_at"] = to_utc(data["start_at"])
    if "end_at" in data and data["end_at"]:
        data["end_at"] = to_utc(data["end_at"])

    if data.get("start_at") and data.get("end_at") and data["end_at"] <= data["start_at"]:
        raise HTTPException(400, "Rango de tiempo inválido")

    for f, v in data.items():
        setattr(slot, f, v)

    db.commit()
    db.refresh(slot)
    return slot


@router.delete(
    "/{id}",
    status_code=204,
    dependencies=[Depends(require_role(models.UserRole.doctor))]
)
def delete_slot(id: int, db: Session = Depends(get_db)):
    slot = db.get(models.AvailabilitySlot, id)
    if not slot:
        raise HTTPException(404, "No encontrado")
    db.delete(slot)
    db.commit()
    return None


# ==========================
# 2) ENDPOINTS: PLANTILLA SEMANAL POR DÍA (AvailabilityRule)
# ==========================

@router.get("/weekly", response_model=List[schemas.AvailabilityRuleOut])
def get_weekly_rules(
    doctor_id: int = Query(..., description="ID de la psicóloga"),
    db: Session = Depends(get_db),
):
    """
    Devuelve la lista de reglas 0..6 para el doctor.
    Si un día no existe aún, simplemente no aparece en el listado.
    """
    stmt = (
        select(models.AvailabilityRule)
        .where(models.AvailabilityRule.doctor_id == doctor_id)
        .order_by(models.AvailabilityRule.weekday.asc())
    )
    return list(db.scalars(stmt))


@router.put(
    "/weekly/bulk",
    response_model=List[schemas.AvailabilityRuleOut],
    dependencies=[Depends(require_role(models.UserRole.doctor))]
)
def upsert_weekly_rules(
    payload: schemas.AvailabilityWeeklyUpsertIn,
    db: Session = Depends(get_db),
):
    """
    Guarda en bloque (upsert) las reglas por weekday para un doctor.
    - Si ya existe (doctor_id, weekday) => actualiza enabled/ranges.
    - Si no existe => crea.
    - No borra días que no vengan en payload (idempotente por weekday incluido).
      Si quieres ‘reset total’, llama primero a /weekly/reset.
    """
    doc = db.get(models.User, payload.doctor_id)
    if not doc or doc.role != models.UserRole.doctor:
        raise HTTPException(400, "doctor_id debe ser un doctor")

    existing = {
        r.weekday: r
        for r in db.scalars(
            select(models.AvailabilityRule).where(
                models.AvailabilityRule.doctor_id == payload.doctor_id
            )
        )
    }

    for r in payload.rules:
        current = existing.get(r.weekday)
        if current:
            current.enabled = r.enabled
            current.ranges = [tr.model_dump() for tr in r.ranges]
        else:
            newr = models.AvailabilityRule(
                doctor_id=r.doctor_id,
                weekday=r.weekday,
                enabled=r.enabled,
                ranges=[tr.model_dump() for tr in r.ranges],
            )
            db.add(newr)

    db.commit()

    updated = db.scalars(
        select(models.AvailabilityRule).where(
            (models.AvailabilityRule.doctor_id == payload.doctor_id) &
            (models.AvailabilityRule.weekday.in_([r.weekday for r in payload.rules]))
        ).order_by(models.AvailabilityRule.weekday.asc())
    )
    return list(updated)


@router.post(
    "/weekly/reset",
    status_code=204,
    dependencies=[Depends(require_role(models.UserRole.doctor))]
)
def reset_weekly_rules(
    doctor_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """
    Elimina todas las reglas semanales del doctor (deja todo vacío/bloqueado).
    Útil si quieres reescribir desde cero luego con /weekly/bulk.
    """
    stmt = delete(models.AvailabilityRule).where(models.AvailabilityRule.doctor_id == doctor_id)
    db.execute(stmt)
    db.commit()
    return None


# ==========================
# 3) ENDPOINT: CÁLCULO DE SLOTS DISPONIBLES (reglas + citas ocupadas + BLOQUEOS)
# ==========================

def _overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    """Comparación entre intervalos en el MISMO tipo (aquí: todos LOCAL naive)."""
    return (a_start < b_end) and (a_end > b_start)

def _hhmm_to_time(hhmm: str) -> dtime:
    h, m = hhmm.split(":")
    return dtime(hour=int(h), minute=int(m))

@router.get("/slots", response_model=List[schemas.AvailableSlotOut])
def get_available_slots(
    doctor_id: int = Query(...),
    date_from: datetime = Query(..., description="ISO8601 (puede traer Z)"),
    date_to: datetime = Query(..., description="ISO8601 (exclusivo)"),
    duration_min: int | None = Query(None, ge=10, le=240),
    db: Session = Depends(get_db),
):
    # 🧹 Limpia holds vencidos para que no “bloqueen” falsamente la agenda
    delete_stale_holds(db)

    # 1) Normalizar rango solicitado a UTC aware
    #    - naive => se asume Ecuador y se convierte a UTC
    df_aware = to_utc(date_from)
    dt_aware = to_utc(date_to)
    if dt_aware <= df_aware:
        raise HTTPException(400, "date_to debe ser mayor que date_from")
    if (dt_aware - df_aware).days > 31:
        raise HTTPException(400, "Rango máximo permitido: 31 días")

    # Para generar y comparar contra reglas por día, trabajamos en LOCAL (Ecuador) naive
    df_local = aware_to_local_naive(df_aware)
    dt_local = aware_to_local_naive(dt_aware)

    # 2) Duración (min)
    if duration_min is None:
        cfg = db.get(models.DoctorSettings, doctor_id) if hasattr(models, "DoctorSettings") else None
        duration_min = int(cfg.duration_min) if cfg and cfg.duration_min else 50
    step = timedelta(minutes=duration_min)

    # 3) Reglas (local)
    rules = list(db.scalars(
        select(models.AvailabilityRule).where(models.AvailabilityRule.doctor_id == doctor_id)
    ))
    rule_by_weekday = {r.weekday: r for r in rules if r.enabled and r.ranges}
    if not rule_by_weekday:
        return []

    # 4) Traer citas ocupadas (UTC aware) y convertir a LOCAL naive
    now_utc = datetime.now(timezone.utc)

    busy_stmt = (
        select(models.Appointment)
        .where(models.Appointment.doctor_id == doctor_id)
        .where(
            (
                models.Appointment.status == models.AppointmentStatus.confirmed
            ) | (
                (models.Appointment.status == models.AppointmentStatus.pending) &
                (
                    (models.Appointment.hold_until == None) |  # noqa: E711
                    (models.Appointment.hold_until > now_utc)
                )
            )
        )
        .where(models.Appointment.start_at < dt_aware)
        .where(models.Appointment.end_at > df_aware)
    )
    busy_appts = list(db.scalars(busy_stmt))
    busy_intervals_local = [
        (
            aware_to_local_naive(to_utc(a.start_at)),
            aware_to_local_naive(to_utc(a.end_at)),
        )
        for a in busy_appts
    ]

    # 5) Traer BLOQUEOS (CalendarBlock) que cruzan el rango y convertir a LOCAL naive
    blocks_stmt = (
        select(models.CalendarBlock)
        .where(models.CalendarBlock.doctor_id == doctor_id)
        .where(models.CalendarBlock.start_at < dt_aware)
        .where(models.CalendarBlock.end_at > df_aware)
    )
    blocks = list(db.scalars(blocks_stmt))
    block_intervals_local = [
        (
            aware_to_local_naive(to_utc(b.start_at)),
            aware_to_local_naive(to_utc(b.end_at)),
        )
        for b in blocks
    ]

    # 6) “Ahora” local para descartar slots en el pasado
    now_local = aware_to_local_naive(now_utc)

    # 7) Construir slots desde reglas (todo en LOCAL naive) y filtrar contra citas y bloqueos
    results: list[schemas.AvailableSlotOut] = []

    day = df_local.replace(hour=0, minute=0, second=0, microsecond=0)
    while day < dt_local:
        # python Mon=0..Sun=6  => modelo Sun=0..Sat=6
        rule_weekday = (day.weekday() + 1) % 7
        rule = rule_by_weekday.get(rule_weekday)
        if rule:
            for r in rule.ranges:
                start_t = _hhmm_to_time(r.get("start"))
                end_t   = _hhmm_to_time(r.get("end"))

                window_start = datetime.combine(day.date(), start_t)  # LOCAL naive
                window_end   = datetime.combine(day.date(), end_t)    # LOCAL naive

                slot_win_start = max(window_start, df_local)
                slot_win_end   = min(window_end, dt_local)
                if slot_win_end <= slot_win_start:
                    continue

                cur = slot_win_start
                while cur + step <= slot_win_end:
                    s_local = cur
                    e_local = cur + step

                    # 7.1 Saltar slots en el pasado
                    if e_local <= now_local:
                        cur = e_local
                        continue

                    # 7.2 Conflicto contra appointments
                    conflict = False
                    for b_s, b_e in busy_intervals_local:
                        if _overlaps(s_local, e_local, b_s, b_e):
                            conflict = True
                            break

                    # 7.3 Conflicto contra BLOQUEOS
                    if not conflict:
                        for bl_s, bl_e in block_intervals_local:
                            if _overlaps(s_local, e_local, bl_s, bl_e):
                                conflict = True
                                break

                    if not conflict:
                        # Responder como UTC aware (el front ya renderiza en GYE)
                        results.append(
                            schemas.AvailableSlotOut(
                                doctor_id=doctor_id,
                                start_at=local_naive_to_aware_utc(s_local),
                                end_at=local_naive_to_aware_utc(e_local),
                            )
                        )
                    cur = e_local
        day += timedelta(days=1)

    results.sort(key=lambda x: (x.start_at, x.end_at))
    return results
