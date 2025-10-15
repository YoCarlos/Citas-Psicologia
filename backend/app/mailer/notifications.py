from __future__ import annotations
from datetime import timezone
from typing import Optional, Dict, Any
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session


from app.mailer.service import send_email
from app import models
from app.email_settings import EmailSettings

TZ_LOCAL = ZoneInfo("America/Guayaquil")

def _fmt_local(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(TZ_LOCAL).strftime("%A %d %b %Y, %H:%M")

def _appt_context(appt: models.Appointment, db: Session) -> Dict[str, Any]:
    doc: Optional[models.User] = db.get(models.User, appt.doctor_id) if appt.doctor_id else None
    pat: Optional[models.User] = db.get(models.User, appt.patient_id) if appt.patient_id else None

    return {
        "appointment_id": appt.id,
        "doctor_name": getattr(doc, "full_name", None) or f"Doctor #{appt.doctor_id}",
        "doctor_email": getattr(doc, "email", None),
        "patient_name": getattr(pat, "full_name", None) or (getattr(pat, "email", None) or f"Paciente #{appt.patient_id}"),
        "patient_email": getattr(pat, "email", None),
        "start_local": _fmt_local(appt.start_at),
        "end_local": _fmt_local(appt.end_at),
        "join_url": appt.zoom_join_url,
        "env": "local",  # puedes sobreescribir si quieres pasar otro valor en prod
    }

async def send_confirmed_emails(appt: models.Appointment, db: Session):
    """
    Enviar emails cuando una cita queda CONFIRMADA (creación confirmada o confirmación posterior).
    Se notifica a doctora y paciente (si existen sus emails).
    """
    settings = EmailSettings()
    ctx = _appt_context(appt, db)

    # Paciente
    if ctx["patient_email"]:
        await send_email(
            recipients=[ctx["patient_email"]],
            subject=f"Tu cita #{appt.id} ha sido confirmada",
            template_name="confirmed_patient.html",
            context=ctx,
            settings=settings,
        )

    # Doctora
    if ctx["doctor_email"]:
        await send_email(
            recipients=[ctx["doctor_email"]],
            subject=f"Cita #{appt.id} confirmada con {ctx['patient_name']}",
            template_name="confirmed_doctor.html",
            context=ctx,
            settings=settings,
        )

async def send_rescheduled_emails(appt: models.Appointment, db: Session, old_start, old_end):
    """
    Enviar emails cuando una cita confirmada o pendiente se REAGENDA.
    Notifica a doctora y paciente.
    """
    settings = EmailSettings()
    ctx = _appt_context(appt, db)
    ctx.update({
        "old_start_local": _fmt_local(old_start),
        "old_end_local": _fmt_local(old_end),
    })

    # Paciente
    if ctx["patient_email"]:
        await send_email(
            recipients=[ctx["patient_email"]],
            subject=f"Tu cita #{appt.id} fue reagendada",
            template_name="rescheduled_patient.html",
            context=ctx,
            settings=settings,
        )

    # Doctora
    if ctx["doctor_email"]:
        await send_email(
            recipients=[ctx["doctor_email"]],
            subject=f"Cita #{appt.id} reagendada con {ctx['patient_name']}",
            template_name="rescheduled_doctor.html",
            context=ctx,
            settings=settings,
        )

# app/mailer/notifications.py  (añadir al final)
async def send_reminder_emails(appt: models.Appointment, db: Session):
    """
    Recordatorio ~1 hora antes. Solo para citas confirmed.
    Notifica a doctora y paciente si tienen email.
    """
    if appt.status != models.AppointmentStatus.confirmed:
        return

    settings = EmailSettings()
    ctx = _appt_context(appt, db)

    # Paciente
    if ctx["patient_email"]:
        await send_email(
            recipients=[ctx["patient_email"]],
            subject=f"Recordatorio: tu cita #{appt.id} es en 1 hora",
            template_name="reminder_patient.html",
            context=ctx,
            settings=settings,
        )

    # Doctora
    if ctx["doctor_email"]:
        await send_email(
            recipients=[ctx["doctor_email"]],
            subject=f"Recordatorio: cita #{appt.id} con {ctx['patient_name']} en 1 hora",
            template_name="reminder_doctor.html",
            context=ctx,
            settings=settings,
        )