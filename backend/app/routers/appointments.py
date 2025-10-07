# app/routers/appointments.py
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, select, and_
from typing import List, Optional
from datetime import datetime, timedelta, timezone

from ..db import get_db
from .. import models, schemas
from ..security import require_role, get_current_user
from ..config import settings
from ..zoom_client import zoom

router = APIRouter(prefix="/appointments", tags=["appointments"])

# --- Constantes ---
# Usamos strings para evitar mismatch ocasional con Enum en runtime/DB
BLOCKING_STATES = ["pending", "confirmed"]

# --- Helpers ---
def ensure_tzaware(dt: datetime) -> datetime:
    """Devuelve un datetime tz-aware en UTC (si viene naive, le asigna UTC)."""
    if dt is None:
        return dt
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

def overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    """Compara intervalos asegurando TZ-aware (UTC)."""
    a_start = ensure_tzaware(a_start)
    a_end   = ensure_tzaware(a_end)
    b_start = ensure_tzaware(b_start)
    b_end   = ensure_tzaware(b_end)
    return (a_start < b_end) and (a_end > b_start)

def iso_utc_z(dt: datetime) -> str:
    """Convierte dt a ISO8601 UTC sin microsegundos, con sufijo 'Z'."""
    dt = ensure_tzaware(dt).astimezone(timezone.utc).replace(microsecond=0)
    s = dt.isoformat()
    if not s.endswith("Z") and "+" not in s:
        s += "Z"
    return s


# --- CRUD básico (doctor) ---
@router.post(
    "",
    response_model=schemas.AppointmentOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(models.UserRole.doctor))],
)
async def create_appt(payload: schemas.AppointmentCreate, db: Session = Depends(get_db)):
    doc = db.get(models.User, payload.doctor_id)
    if not doc or doc.role != models.UserRole.doctor:
        raise HTTPException(status_code=400, detail="doctor_id inválido")
    if payload.patient_id:
        pat = db.get(models.User, payload.patient_id)
        if not pat or pat.role != models.UserRole.patient:
            raise HTTPException(status_code=400, detail="patient_id inválido (debe ser paciente)")

    s = ensure_tzaware(payload.start_at)
    e = ensure_tzaware(payload.end_at)
    if e <= s:
        raise HTTPException(status_code=400, detail="Rango horario inválido")

    # Normalizar status y método
    try:
        status_in = models.AppointmentStatus(payload.status or "free")
    except Exception:
        raise HTTPException(status_code=400, detail="status inválido (free|pending|confirmed)")

    method_in = None
    if payload.method:
        try:
            method_in = models.PaymentMethod(payload.method)
        except Exception:
            raise HTTPException(status_code=400, detail="method inválido")

    appt = models.Appointment(
        doctor_id=payload.doctor_id,
        patient_id=payload.patient_id,
        start_at=s,
        end_at=e,
        status=status_in,
        method=method_in,
    )
    db.add(appt)
    db.commit()
    db.refresh(appt)

    # Si ya viene confirmada, crear la reunión de Zoom de una vez
    if appt.status == models.AppointmentStatus.confirmed:
        if not settings.ZOOM_DEFAULT_USER:
            raise HTTPException(500, detail="ZOOM_DEFAULT_USER no configurado")

        start_iso = iso_utc_z(s)
        duration = int((e - s).total_seconds() // 60) or 45

        try:
            z = await zoom.create_meeting(
                user_id=settings.ZOOM_DEFAULT_USER,
                topic=f"Cita {appt.id} - Doctor {appt.doctor_id}",
                start_time_iso=start_iso,
                duration_minutes=duration,
                timezone="America/Guayaquil",
                waiting_room=True,
                join_before_host=False,
            )
            appt.zoom_meeting_id = str(z.get("id"))
            appt.zoom_join_url = z.get("join_url")
            db.commit()
            db.refresh(appt)
        except Exception as ex:
            raise HTTPException(status_code=502, detail=f"No se pudo crear reunión Zoom: {ex}")

    return appt


@router.get("", response_model=List[schemas.AppointmentOut])
def list_appts(
    db: Session = Depends(get_db),
    doctor_id: Optional[int] = None,
    patient_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    skip: int = 0,
    limit: int = Query(200, le=500),
):
    """
    Lista citas. Filtros: doctor_id, patient_id, status_filter in {"free","pending","confirmed"}.
    """
    stmt = select(models.Appointment).order_by(models.Appointment.start_at.asc())
    if doctor_id:
        stmt = stmt.where(models.Appointment.doctor_id == doctor_id)
    if patient_id:
        stmt = stmt.where(models.Appointment.patient_id == patient_id)
    if status_filter:
        try:
            st = models.AppointmentStatus(status_filter)
        except Exception:
            raise HTTPException(400, detail="status_filter inválido")
        stmt = stmt.where(models.Appointment.status == st)
    stmt = stmt.offset(skip).limit(limit)
    return list(db.scalars(stmt))


@router.get("/{id}", response_model=schemas.AppointmentOut)
def get_appt(id: int, db: Session = Depends(get_db)):
    appt = db.get(models.Appointment, id)
    if not appt:
        raise HTTPException(status_code=404, detail="No encontrado")
    return appt


@router.put(
    "/{id}",
    response_model=schemas.AppointmentOut,
    dependencies=[Depends(require_role(models.UserRole.doctor))],
)
def update_appt(id: int, payload: schemas.AppointmentUpdate, db: Session = Depends(get_db)):
    appt = db.get(models.Appointment, id)
    if not appt:
        raise HTTPException(status_code=404, detail="No encontrado")

    data = payload.model_dump(exclude_unset=True)
    if "start_at" in data and data["start_at"]:
        data["start_at"] = ensure_tzaware(data["start_at"])
    if "end_at" in data and data["end_at"]:
        data["end_at"] = ensure_tzaware(data["end_at"])
    if data.get("start_at") and data.get("end_at") and data["end_at"] <= data["start_at"]:
        raise HTTPException(status_code=400, detail="Rango inválido")

    for f, v in data.items():
        setattr(appt, f, v)

    db.commit()
    db.refresh(appt)
    return appt


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(models.UserRole.doctor))],
)
def delete_appt(id: int, db: Session = Depends(get_db)):
    appt = db.get(models.Appointment, id)
    if not appt:
        raise HTTPException(status_code=404, detail="No encontrado")
    db.delete(appt)
    db.commit()
    return None


# --- HOLD: Bloquear temporalmente slots mientras el paciente paga (PayPhone) ---
@router.post("/hold", response_model=schemas.AppointmentHoldOut, status_code=201)
def hold_appointments(
    payload: schemas.AppointmentHoldIn,
    current=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current.role != models.UserRole.patient:
        raise HTTPException(403, detail="Solo pacientes pueden bloquear horarios")

    # validar doctor
    doc = db.get(models.User, payload.doctor_id)
    if not doc or doc.role != models.UserRole.doctor:
        raise HTTPException(400, detail="doctor_id inválido")

    now = datetime.now(timezone.utc)
    hold_until = now + timedelta(minutes=payload.hold_minutes)

    # normalizar para ventana de búsqueda
    requested_min = min(ensure_tzaware(s.start_at) for s in payload.slots)
    requested_max = max(ensure_tzaware(s.end_at) for s in payload.slots)

    # Traer existentes del doctor que puedan solaparse y que bloqueen (pending/confirmed)
    existing = list(
        db.scalars(
            select(models.Appointment).where(
                and_(
                    models.Appointment.doctor_id == payload.doctor_id,
                    models.Appointment.status.in_(BLOCKING_STATES),  # usando strings
                    models.Appointment.start_at < requested_max,
                    models.Appointment.end_at > requested_min,
                )
            )
        )
    )

    # Preparar creación
    to_create: list[models.Appointment] = []
    for s in payload.slots:
        s_start = ensure_tzaware(s.start_at)
        s_end = ensure_tzaware(s.end_at)
        if s_end <= s_start:
            raise HTTPException(400, detail="Rango horario inválido en slots")
        if s_start <= now:
            raise HTTPException(400, detail="No puedes elegir un horario en el pasado")

        # contra existentes de DB
        for ea in existing:
            if overlaps(s_start, s_end, ea.start_at, ea.end_at):
                raise HTTPException(409, detail="Uno o más horarios ya no están disponibles")

        # contra la propia selección (evitar duplicados/solapes en el mismo payload)
        for tmp in to_create:
            if overlaps(s_start, s_end, tmp.start_at, tmp.end_at):
                raise HTTPException(409, detail="Selección contiene horarios solapados/duplicados")

        appt = models.Appointment(
            doctor_id=payload.doctor_id,
            patient_id=current.id,
            start_at=s_start,
            end_at=s_end,
            status=models.AppointmentStatus.pending,   # bloqueado mientras paga
            method=models.PaymentMethod.payphone,      # PayPhone
            hold_until=hold_until,
        )
        to_create.append(appt)

    # Insertar
    for a in to_create:
        db.add(a)

    # Revalidación rápida contra duplicados exactos (posibles carreras)
    for a in to_create:
        clash = db.scalar(
            select(models.Appointment.id).where(
                and_(
                    models.Appointment.doctor_id == a.doctor_id,
                    models.Appointment.status.in_(BLOCKING_STATES),
                    models.Appointment.start_at == a.start_at,
                    models.Appointment.end_at == a.end_at,
                )
            )
        )
        if clash:
            raise HTTPException(409, detail="Otro usuario tomó uno de los horarios durante el proceso")

    db.commit()
    for a in to_create:
        db.refresh(a)

    return schemas.AppointmentHoldOut(appointments=to_create)


# --- Confirmación (post-pago) ---
@router.post(
    "/{id}/confirm",
    response_model=schemas.AppointmentOut,
    status_code=200,
    dependencies=[Depends(require_role(models.UserRole.doctor))],  # por ahora manual desde la doctora
)
async def confirm_appt(id: int, db: Session = Depends(get_db)):
    appt = db.get(models.Appointment, id)
    if not appt:
        raise HTTPException(404, detail="No encontrado")

    # Debe estar en pending (pago aprobado) o incluso free (edge)
    if appt.status not in (models.AppointmentStatus.pending, models.AppointmentStatus.free):
        raise HTTPException(400, detail="Estado inválido para confirmar")

    s = ensure_tzaware(appt.start_at)
    e = ensure_tzaware(appt.end_at)
    if e <= s:
        raise HTTPException(status_code=400, detail="Rango horario inválido")

    # Si expiró el hold, impedir confirmar
    if appt.status == models.AppointmentStatus.pending and appt.hold_until:
        if datetime.now(timezone.utc) > ensure_tzaware(appt.hold_until):
            raise HTTPException(400, detail="El bloqueo expiró; el paciente debe elegir otro horario")

    # Crear reunión Zoom si no existe
    if not appt.zoom_meeting_id or not appt.zoom_join_url:
        if not settings.ZOOM_DEFAULT_USER:
            raise HTTPException(500, detail="ZOOM_DEFAULT_USER no configurado")

        start_iso = iso_utc_z(s)
        duration = int((e - s).total_seconds() // 60) or 45

        z = await zoom.create_meeting(
            user_id=settings.ZOOM_DEFAULT_USER,
            topic=f"Cita {appt.id} - Doctor {appt.doctor_id}",
            start_time_iso=start_iso,
            duration_minutes=duration,
            timezone="America/Guayaquil",
            waiting_room=True,
            join_before_host=False,
        )
        appt.zoom_meeting_id = str(z.get("id"))
        appt.zoom_join_url = z.get("join_url")

    appt.status = models.AppointmentStatus.confirmed
    db.commit()
    db.refresh(appt)
    return appt


# --- Reagendar (patient o doctor) ---
@router.post(
    "/{id}/reschedule",
    response_model=schemas.AppointmentOut,
    status_code=200,
)
async def reschedule_appt(  # <- async para poder llamar a Zoom update
    id: int,
    payload: schemas.AppointmentHoldSlot,  # {start_at, end_at}
    current = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Reagenda una cita a un nuevo slot libre.
    Reglas:
      - Solo el paciente dueño o la doctora pueden reagendar.
      - Deben faltar >= 4 horas para el inicio actual.
      - El nuevo rango no debe solaparse con citas ocupadas del doctor:
          * confirmed
          * pending con hold_until futuro (o NULL)
      - Si la cita está confirmada y tiene reunión Zoom, se actualiza la reunión.
    """
    appt = db.get(models.Appointment, id)
    if not appt:
        raise HTTPException(404, "No encontrado")

    # permisos: paciente dueño o doctor de la cita
    if not (
        (current.role == models.UserRole.patient and appt.patient_id == current.id) or
        (current.role == models.UserRole.doctor and appt.doctor_id == current.id)
    ):
        raise HTTPException(403, "No tienes permiso para reagendar esta cita")

    # ventana de 4 horas
    now = datetime.now(timezone.utc)
    cur_start = appt.start_at if appt.start_at.tzinfo else appt.start_at.replace(tzinfo=timezone.utc)
    if (cur_start - now).total_seconds() < 4 * 3600:
        raise HTTPException(400, "Solo puedes reagendar hasta 4 horas antes del inicio")

    # validar nuevo rango
    new_s = ensure_tzaware(payload.start_at)
    new_e = ensure_tzaware(payload.end_at)
    if new_e <= new_s:
        raise HTTPException(400, "Rango horario inválido")

    # chequear conflictos con otras citas ocupadas del doctor
    busy_stmt = (
        select(models.Appointment)
        .where(models.Appointment.doctor_id == appt.doctor_id)
        .where(models.Appointment.id != appt.id)
        .where(
            or_(
                models.Appointment.status == models.AppointmentStatus.confirmed,
                (models.Appointment.status == models.AppointmentStatus.pending) &
                ((models.Appointment.hold_until == None) | (models.Appointment.hold_until > now))  # noqa: E711
            )
        )
        .where(models.Appointment.start_at < new_e)
        .where(models.Appointment.end_at > new_s)
    )
    conflicts = list(db.scalars(busy_stmt))
    if conflicts:
        raise HTTPException(409, "Ese horario ya está ocupado")

    # actualizar cita: movemos horario; limpiamos hold
    appt.start_at = new_s
    appt.end_at = new_e
    appt.hold_until = None

    # Si está confirmada y tiene reunión, actualiza la reunión en Zoom
    if appt.status == models.AppointmentStatus.confirmed and appt.zoom_meeting_id:
        try:
            start_iso = iso_utc_z(new_s)
            duration = max(1, int((new_e - new_s).total_seconds() // 60))
            await zoom.update_meeting(
                meeting_id=appt.zoom_meeting_id,
                start_time_iso=start_iso,
                duration_minutes=duration,
                timezone="America/Guayaquil",
                topic=f"Cita {appt.id} - Doctor {appt.doctor_id}",
            )
            # Normalmente el join_url no cambia; si quisieras refrescarlo,
            # podrías hacer GET /meetings/{id} y re-guardar.
        except Exception as ex:
            db.rollback()
            raise HTTPException(502, f"No se pudo actualizar la reunión en Zoom: {ex}")

    db.commit()
    db.refresh(appt)
    return appt
