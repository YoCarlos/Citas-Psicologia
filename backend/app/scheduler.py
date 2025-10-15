# app/scheduler.py
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.memory import MemoryJobStore
# Si prefieres persistencia completa del scheduler:
# from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore

from sqlalchemy.orm import Session

from .db import SessionLocal  # sessionmaker
from . import models
from .mailer.notifications import send_reminder_emails

# =========================
# Config
# =========================

# Minutos antes del inicio para enviar recordatorio
REMINDER_LEAD_MINUTES = 10

# Prefijo del ID del job en APScheduler y en la tabla reminder_jobs
JOB_PREFIX = "appt_reminder:"

# Scheduler global
scheduler: Optional[AsyncIOScheduler] = None


# =========================
# Helpers
# =========================

def get_job_id(appt_id: int) -> str:
    return f"{JOB_PREFIX}{appt_id}"


def _load_appt(db: Session, appt_id: int) -> Optional[models.Appointment]:
    return db.get(models.Appointment, appt_id)


# =========================
# Lifecycle
# =========================

def start_scheduler():
    """
    Inicia un AsyncIOScheduler y lo deja listo.
    Usa MemoryJobStore (desaparece al reiniciar) pero registramos TODO en BD,
    y reconstruimos en on_startup con rebuild_jobs_on_startup().
    """
    global scheduler
    if scheduler and scheduler.running:
        return scheduler

    # Persistente opcional (comenta MemoryJobStore y descomenta SQLAlchemyJobStore):
    # jobstores = {"default": SQLAlchemyJobStore(url=settings.DATABASE_URL)}
    jobstores = {"default": MemoryJobStore()}

    scheduler = AsyncIOScheduler(
        jobstores=jobstores,
        timezone=timezone.utc,
    )
    scheduler.start()
    return scheduler


def shutdown_scheduler():
    global scheduler
    if scheduler and scheduler.running:
        scheduler.shutdown(wait=False)
        scheduler = None


def rebuild_jobs_on_startup():
    """
    Reconstruye en APScheduler todos los jobs que estén 'scheduled' en BD y futuros.
    Debe llamarse en el evento on_startup de FastAPI.
    """
    start_scheduler()
    db: Session = SessionLocal()
    try:
        now_utc = datetime.now(timezone.utc)
        jobs = (
            db.query(models.ReminderJob)
            .filter(models.ReminderJob.status == models.ReminderStatus.scheduled)
            .filter(models.ReminderJob.run_at_utc > now_utc)
            .order_by(models.ReminderJob.run_at_utc.asc())
            .all()
        )
        for rj in jobs:
            # Si por alguna razón la cita ya no es válida/confirmada, no reprogramar
            appt = _load_appt(db, rj.appointment_id)
            if not appt or appt.status != models.AppointmentStatus.confirmed:
                # opcional: marcar cancelado
                rj.status = models.ReminderStatus.canceled
                db.commit()
                continue

            # Reprogramar
            if scheduler:
                scheduler.add_job(
                    func=_reminder_job,
                    trigger="date",
                    run_date=rj.run_at_utc,
                    id=rj.id,
                    replace_existing=True,
                    kwargs={"appt_id": rj.appointment_id},
                    misfire_grace_time=300,
                    coalesce=True,
                )
    finally:
        db.close()


# =========================
# Core job
# =========================

async def _reminder_job(appt_id: int):
    """
    Job ejecutado por APScheduler. Crea su propia sesión, valida la cita
    y envía correos. Actualiza el estado del ReminderJob en BD.
    """
    db: Session = SessionLocal()
    job_id = get_job_id(appt_id)
    try:
        rj = db.get(models.ReminderJob, job_id)
        appt = _load_appt(db, appt_id)

        # Si no hay cita o no está confirmada, marca como cancelado (o ignorar)
        if not appt or appt.status != models.AppointmentStatus.confirmed:
            if rj and rj.status == models.ReminderStatus.scheduled:
                rj.status = models.ReminderStatus.canceled
                db.commit()
            return

        now_utc = datetime.now(timezone.utc)
        start_at = appt.start_at if appt.start_at.tzinfo else appt.start_at.replace(tzinfo=timezone.utc)

        # Si ya es tarde, marcar como missed
        if start_at <= now_utc:
            if rj:
                rj.status = models.ReminderStatus.missed
                db.commit()
            return

        try:
            # Enviar emails (doctora + paciente)
            await send_reminder_emails(appt, db)

            # Marcar ejecutado
            if rj:
                rj.status = models.ReminderStatus.executed
                rj.executed_at_utc = now_utc
                rj.last_error = None
                db.commit()
        except Exception as ex:
            if rj:
                rj.status = models.ReminderStatus.error
                rj.last_error = str(ex)
                db.commit()
            # Aquí podrías loggear ex
    finally:
        db.close()


# =========================
# API desde código (programar/cancelar)
# =========================

def schedule_reminder_job(appt: models.Appointment):
    """
    Registra/actualiza el job en BD y lo programa en APScheduler para
    enviar recordatorio REMINDER_LEAD_MINUTES antes del inicio.
    Si falta menos de 2 minutos, no programa.
    """
    global scheduler
    if scheduler is None:
        start_scheduler()

    if appt.status != models.AppointmentStatus.confirmed:
        return

    # Normalizar a UTC
    start_utc = (appt.start_at if appt.start_at.tzinfo else appt.start_at.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)
    run_at = start_utc - timedelta(minutes=REMINDER_LEAD_MINUTES)
    now_utc = datetime.now(timezone.utc)

    # Si ya pasó el run_at, pero aún faltan >=2 min para el inicio, envía en 1 min (para pruebas)
    if run_at <= now_utc:
        if start_utc - now_utc >= timedelta(minutes=2):
            run_at = now_utc + timedelta(minutes=1)
        else:
            # Demasiado tarde
            return

    job_id = get_job_id(appt.id)

    # Upsert en BD
    db: Session = SessionLocal()
    try:
        rj = db.get(models.ReminderJob, job_id)
        if not rj:
            rj = models.ReminderJob(
                id=job_id,
                appointment_id=appt.id,
                run_at_utc=run_at,
                status=models.ReminderStatus.scheduled,
            )
            db.add(rj)
        else:
            rj.run_at_utc = run_at
            rj.status = models.ReminderStatus.scheduled
            rj.executed_at_utc = None
            rj.last_error = None
        db.commit()
    finally:
        db.close()

    # Programar en APS
    if scheduler:
        scheduler.add_job(
            func=_reminder_job,
            trigger="date",
            run_date=run_at,
            id=job_id,
            replace_existing=True,
            kwargs={"appt_id": appt.id},
            misfire_grace_time=300,
            coalesce=True,
        )


def cancel_reminder_job(appt_id: int):
    """
    Elimina el job del scheduler y marca en BD como 'canceled' si estaba 'scheduled'.
    """
    global scheduler
    job_id = get_job_id(appt_id)

    if scheduler:
        try:
            scheduler.remove_job(job_id)
        except Exception:
            pass

    db: Session = SessionLocal()
    try:
        rj = db.get(models.ReminderJob, job_id)
        if rj and rj.status == models.ReminderStatus.scheduled:
            rj.status = models.ReminderStatus.canceled
            db.commit()
    finally:
        db.close()
