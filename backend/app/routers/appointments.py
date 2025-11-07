# app/routers/appointments.py
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import or_, select, and_
from typing import List, Optional
from datetime import datetime, timedelta, timezone

from ..db import get_db
from .. import models, schemas
from ..security import require_role, get_current_user
from ..config import settings
from ..zoom_client import zoom
from ..mailer.notifications import send_confirmed_emails, send_rescheduled_emails
from ..scheduler import schedule_reminder_job, cancel_reminder_job

# 🔹 Utilidades TZ centralizadas
from ..utils.tz import to_utc, iso_utc_z

router = APIRouter(prefix="/appointments", tags=["appointments"])

# --- Constantes ---
# Estados que bloquean horario (además se revalida 'processing' donde aplique)
BLOCKING_STATES = ["pending", "confirmed"]


def delete_stale_holds(db: Session) -> int:
    """
    Elimina appointments en 'pending' o 'processing' cuyo hold_until ya venció.
    """
    now_utc = datetime.now(timezone.utc)
    status_processing = getattr(models.AppointmentStatus, "processing", models.AppointmentStatus.pending)

    ids = list(
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
    if not ids:
        return 0

    for appt_id in ids:
        a = db.get(models.Appointment, appt_id)
        if a:
            try:
                cancel_reminder_job(a.id)
            except Exception:
                pass
            db.delete(a)

    db.commit()
    return len(ids)


# --- Helper: solape en UTC ---
def overlaps_utc(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    a_start = to_utc(a_start); a_end = to_utc(a_end)
    b_start = to_utc(b_start); b_end = to_utc(b_end)
    return (a_start < b_end) and (a_end > b_start)


def has_conflict_or_block(
    db: Session,
    *,
    doctor_id: int,
    start_utc: datetime,
    end_utc: datetime,
    exclude_appt_id: Optional[int] = None,
) -> bool:
    """
    True si [start_utc, end_utc) entra en conflicto con citas/bloqueos.
    """
    now_utc = datetime.now(timezone.utc)

    appt_stmt = (
        select(models.Appointment.id)
        .where(models.Appointment.doctor_id == doctor_id)
        .where(models.Appointment.start_at < end_utc)
        .where(models.Appointment.end_at > start_utc)
        .where(
            or_(
                models.Appointment.status == models.AppointmentStatus.confirmed,
                and_(
                    models.Appointment.status == models.AppointmentStatus.pending,
                    or_(
                        models.Appointment.hold_until == None,  # noqa: E711
                        models.Appointment.hold_until > now_utc,
                    )
                )
            )
        )
    )
    if exclude_appt_id:
        appt_stmt = appt_stmt.where(models.Appointment.id != exclude_appt_id)

    appt_conflict_id = db.scalar(appt_stmt)
    if appt_conflict_id:
        return True

    block_stmt = (
        select(models.CalendarBlock.id)
        .where(models.CalendarBlock.doctor_id == doctor_id)
        .where(models.CalendarBlock.start_at < end_utc)
        .where(models.CalendarBlock.end_at > start_utc)
    )
    block_conflict_id = db.scalar(block_stmt)
    return bool(block_conflict_id)


# --- CRUD básico (doctor) ---
@router.post(
    "",
    response_model=schemas.AppointmentOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(models.UserRole.doctor))],
)
async def create_appt(
    payload: schemas.AppointmentCreate,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current = Depends(get_current_user),
):
    doc = db.get(models.User, payload.doctor_id)
    if not doc or doc.role != models.UserRole.doctor:
        raise HTTPException(status_code=400, detail="doctor_id inválido")

    if current.role == models.UserRole.doctor and current.id != payload.doctor_id:
        raise HTTPException(status_code=403, detail="No puedes crear citas para otra doctora")

    pat = None
    if payload.patient_id:
        pat = db.get(models.User, payload.patient_id)
        if not pat or pat.role != models.UserRole.patient:
            raise HTTPException(status_code=400, detail="patient_id inválido (debe ser paciente)")

    s = to_utc(payload.start_at)
    e = to_utc(payload.end_at)
    if e <= s:
        raise HTTPException(status_code=400, detail="Rango horario inválido")

    now_utc = datetime.now(timezone.utc)
    if s <= now_utc:
        raise HTTPException(status_code=400, detail="No puedes crear una cita en el pasado")

    doctor_crea_para_paciente = (pat is not None)
    if doctor_crea_para_paciente:
        status_in = models.AppointmentStatus.confirmed
        try:
            method_in = models.PaymentMethod(payload.method) if payload.method else models.PaymentMethod.manual
        except Exception:
            raise HTTPException(status_code=400, detail="method inválido")
    else:
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

    if has_conflict_or_block(db, doctor_id=payload.doctor_id, start_utc=s, end_utc=e):
        raise HTTPException(status_code=409, detail="Ese horario ya está ocupado o bloqueado")

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

        bg.add_task(send_confirmed_emails, appt, db)
        schedule_reminder_job(appt)

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
    delete_stale_holds(db)

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
        data["start_at"] = to_utc(data["start_at"])
    if "end_at" in data and data["end_at"]:
        data["end_at"] = to_utc(data["end_at"])
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
    cancel_reminder_job(appt.id)
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
    """
    Crea citas en estado PENDING (method=payphone) con hold_until, pero
    **NO** genera ni guarda client_tx_id. El vínculo para confirmar luego
    se hará por IDs de cita (en optionalParameter3 del pago).
    """
    if current.role != models.UserRole.patient:
        raise HTTPException(403, detail="Solo pacientes pueden bloquear horarios")

    # 🧹 Limpia holds vencidos antes de intentar crear nuevos
    delete_stale_holds(db)

    doc = db.get(models.User, payload.doctor_id)
    if not doc or doc.role != models.UserRole.doctor:
        raise HTTPException(400, detail="doctor_id inválido")

    now = datetime.now(timezone.utc)
    hold_until = now + timedelta(minutes=payload.hold_minutes)

    requested_min = min(to_utc(s.start_at) for s in payload.slots)
    requested_max = max(to_utc(s.end_at) for s in payload.slots)

    # Intersecciones existentes (citas activas)
    existing = list(
        db.scalars(
            select(models.Appointment).where(
                and_(
                    models.Appointment.doctor_id == payload.doctor_id,
                    models.Appointment.status.in_(BLOCKING_STATES),
                    models.Appointment.start_at < requested_max,
                    models.Appointment.end_at > requested_min,
                )
            )
        )
    )
    # Bloqueos existentes
    blocks = list(
        db.scalars(
            select(models.CalendarBlock).where(
                and_(
                    models.CalendarBlock.doctor_id == payload.doctor_id,
                    models.CalendarBlock.start_at < requested_max,
                    models.CalendarBlock.end_at > requested_min,
                )
            )
        )
    )

    to_create: list[models.Appointment] = []
    for s in payload.slots:
        s_start = to_utc(s.start_at)
        s_end = to_utc(s.end_at)
        if s_end <= s_start:
            raise HTTPException(400, detail="Rango horario inválido en slots")
        if s_start <= now:
            raise HTTPException(400, detail="No puedes elegir un horario en el pasado")

        # Conflicto con citas previamente cargadas
        for ea in existing:
            if overlaps_utc(s_start, s_end, ea.start_at, ea.end_at):
                raise HTTPException(409, detail="Uno o más horarios ya no están disponibles")

        # Conflicto con bloqueos
        for bl in blocks:
            if overlaps_utc(s_start, s_end, bl.start_at, bl.end_at):
                raise HTTPException(409, detail="Uno o más horarios están bloqueados por la doctora")

        # Conflicto entre slots seleccionados (duplicados/solapados)
        for tmp in to_create:
            if overlaps_utc(s_start, s_end, tmp.start_at, tmp.end_at):
                raise HTTPException(409, detail="Selección contiene horarios solapados/duplicados")

        appt = models.Appointment(
            doctor_id=payload.doctor_id,
            patient_id=current.id,
            start_at=s_start,
            end_at=s_end,
            status=models.AppointmentStatus.pending,
            method=models.PaymentMethod.payphone,
            hold_until=hold_until,
            # ❌ Sin client_tx_id: el amarre se hará por IDs en optionalParameter3
        )
        to_create.append(appt)

    # Inserta en DB
    for a in to_create:
        db.add(a)

    # Verificación final exacta (carrera)
    for a in to_create:
        # contra citas exactas
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

        # contra bloqueos en el mismo rango
        bl_clash = db.scalar(
            select(models.CalendarBlock.id).where(
                and_(
                    models.CalendarBlock.doctor_id == a.doctor_id,
                    models.CalendarBlock.start_at < a.end_at,
                    models.CalendarBlock.end_at > a.start_at,
                )
            )
        )
        if bl_clash:
            raise HTTPException(409, detail="Uno de los horarios se bloqueó durante el proceso")

    db.commit()
    for a in to_create:
        db.refresh(a)

    # ✅ Devolvemos SOLO las citas (sin client_tx_id)
    # Asegúrate de que schemas.AppointmentHoldOut tenga este shape (o client_tx_id sea Optional)
    return {"appointments": to_create}


# --- Confirmación (post-pago) ---
@router.post(
    "/{id}/confirm",
    response_model=schemas.AppointmentOut,
    status_code=200,
)
async def confirm_appt(
    id: int,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current = Depends(get_current_user),
):
    """
    Permite confirmar:
    - DOCTOR dueña de la cita, o
    - PACIENTE dueño de la cita cuando la cita es pending/payphone.
    """
    # 🧹 Limpia holds vencidos antes de confirmar
    delete_stale_holds(db)

    appt = db.get(models.Appointment, id)
    if not appt:
        raise HTTPException(404, detail="No encontrado")

    # Autorización
    if current.role == models.UserRole.doctor:
        if appt.doctor_id != current.id:
            raise HTTPException(403, detail="No puedes confirmar citas de otra doctora")
    elif current.role == models.UserRole.patient:
        if appt.patient_id != current.id:
            raise HTTPException(403, detail="No puedes confirmar citas de otro paciente")
        if not (
            appt.status == models.AppointmentStatus.pending
            and appt.method == models.PaymentMethod.payphone
        ):
            raise HTTPException(403, detail="Solo puedes confirmar pagos PayPhone pendientes de tu cita")
    else:
        raise HTTPException(403, detail="No autorizado")

    if appt.status not in (models.AppointmentStatus.pending, models.AppointmentStatus.free):
        raise HTTPException(400, detail="Estado inválido para confirmar")

    s = to_utc(appt.start_at)
    e = to_utc(appt.end_at)
    if e <= s:
        raise HTTPException(status_code=400, detail="Rango horario inválido")

    now_utc = datetime.now(timezone.utc)
    # Si el hold expiró, revalida conflictos y limpia hold_until si aún sigue disponible
    if appt.status == models.AppointmentStatus.pending and appt.method == models.PaymentMethod.payphone:
        if appt.hold_until and now_utc > to_utc(appt.hold_until):
            if has_conflict_or_block(db, doctor_id=appt.doctor_id, start_utc=s, end_utc=e, exclude_appt_id=appt.id):
                raise HTTPException(400, detail="El horario fue tomado o bloqueado; el paciente debe elegir otro.")
            appt.hold_until = None

    # Validación final de conflicto/bloqueo
    if has_conflict_or_block(db, doctor_id=appt.doctor_id, start_utc=s, end_utc=e, exclude_appt_id=appt.id):
        raise HTTPException(409, detail="Ese horario ya está ocupado o bloqueado")

    # Crear Zoom si hace falta
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

    # Notificar + recordatorio
    bg.add_task(send_confirmed_emails, appt, db)
    schedule_reminder_job(appt)

    return appt


# --- Reagendar (patient o doctor) ---
@router.post(
    "/{id}/reschedule",
    response_model=schemas.AppointmentOut,
    status_code=200,
)
async def reschedule_appt(
    id: int,
    payload: schemas.AppointmentHoldSlot,  # {start_at, end_at}
    bg: BackgroundTasks,
    current = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 🧹 Limpia holds vencidos antes de reagendar
    delete_stale_holds(db)

    appt = db.get(models.Appointment, id)
    if not appt:
        raise HTTPException(404, "No encontrado")

    # Permisos: paciente dueño o doctor dueño
    if not (
        (current.role == models.UserRole.patient and appt.patient_id == current.id) or
        (current.role == models.UserRole.doctor and appt.doctor_id == current.id)
    ):
        raise HTTPException(403, "No tienes permiso para reagendar esta cita")

    now = datetime.now(timezone.utc)
    cur_start = to_utc(appt.start_at)
    if (cur_start - now).total_seconds() < 4 * 3600:
        raise HTTPException(400, "Solo puedes reagendar hasta 4 horas antes del inicio")

    new_s = to_utc(payload.start_at)
    new_e = to_utc(payload.end_at)
    if new_e <= new_s:
        raise HTTPException(400, "Rango horario inválido")

    # Conflictos con otras citas + BLOQUEOS
    if has_conflict_or_block(db, doctor_id=appt.doctor_id, start_utc=new_s, end_utc=new_e, exclude_appt_id=appt.id):
        raise HTTPException(409, "Ese horario ya está ocupado o bloqueado")

    old_start, old_end = appt.start_at, appt.end_at
    appt.start_at = new_s
    appt.end_at = new_e
    appt.hold_until = None

    # Si estaba confirmada y hay reunión Zoom → actualizarla
    if appt.status == models.AppointmentStatus.confirmed and appt.zoom_meeting_id:
        try:
            # Usamos UTC con 'Z'
            start_iso = iso_utc_z(new_s)
            duration = max(1, int((new_e - new_s).total_seconds() // 60))

            try:
                await zoom.update_meeting(
                    meeting_id=appt.zoom_meeting_id,
                    start_time_iso=start_iso,
                    duration_minutes=duration,
                    topic=f"Cita {appt.id} - Doctor {appt.doctor_id}",
                )
            except RuntimeError as zerr:
                # Si la reunión no existe → recreamos
                msg = str(zerr).lower()
                if "404" in msg or "3001" in msg or "meeting does not exist" in msg:
                    if not settings.ZOOM_DEFAULT_USER:
                        raise HTTPException(500, "ZOOM_DEFAULT_USER no configurado")
                    z = await zoom.create_meeting(
                        user_id=settings.ZOOM_DEFAULT_USER,
                        topic=f"Cita {appt.id} - Doctor {appt.doctor_id}",
                        start_time_iso=start_iso,
                        duration_minutes=duration,
                        timezone=None,  # usamos UTC → no pasamos timezone
                        waiting_room=True,
                        join_before_host=False,
                    )
                    appt.zoom_meeting_id = str(z.get("id"))
                    appt.zoom_join_url = z.get("join_url")
                else:
                    # Otro error: aborta
                    raise

        except Exception as ex:
            db.rollback()
            raise HTTPException(502, f"No se pudo actualizar la reunión en Zoom: {ex}")

    # Persistimos
    db.commit()
    db.refresh(appt)

    # Emails de reagendado
    bg.add_task(send_rescheduled_emails, appt, db, old_start, old_end)

    # Reprogramar recordatorio si estaba confirmada
    if appt.status == models.AppointmentStatus.confirmed:
        cancel_reminder_job(appt.id)
        schedule_reminder_job(appt)

    return appt
