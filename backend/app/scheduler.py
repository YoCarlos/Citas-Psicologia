# app/scheduler.py
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.memory import MemoryJobStore
from sqlalchemy.orm import Session

from .db import SessionLocal  # tu sessionmaker
from . import models
from .mailer.notifications import send_reminder_emails

# Scheduler global en proceso (AsyncIO, compatible con FastAPI/Uvicorn)
scheduler: Optional[AsyncIOScheduler] = None

JOB_PREFIX = "appt_reminder:"  # id único por cita


def get_job_id(appt_id: int) -> str:
    return f"{JOB_PREFIX}{appt_id}"


def start_scheduler():
    """
    Inicia un AsyncIOScheduler (usa el event loop de uvicorn/asyncio).
    """
    global scheduler
    if scheduler and scheduler.running:
        return scheduler

    scheduler = AsyncIOScheduler(
        jobstores={"default": MemoryJobStore()},
        timezone=timezone.utc,
    )
    scheduler.start()
    return scheduler


def shutdown_scheduler():
    global scheduler
    if scheduler and scheduler.running:
        scheduler.shutdown(wait=False)
        scheduler = None


def _load_appt(db: Session, appt_id: int) -> Optional[models.Appointment]:
    return db.get(models.Appointment, appt_id)


async def _reminder_job(appt_id: int):
    """
    Job ejecutado por APScheduler en AsyncIO. Crea su propia sesión,
    carga la cita y envía emails si sigue confirmed.
    """
    db: Session = SessionLocal()
    try:
        appt = _load_appt(db, appt_id)
        if not appt:
            return
        now_utc = datetime.now(timezone.utc)

        # Evitar recordar citas ya no confirmadas o pasadas
        if appt.status != models.AppointmentStatus.confirmed:
            return
        start_at = appt.start_at if appt.start_at.tzinfo else appt.start_at.replace(tzinfo=timezone.utc)
        if start_at <= now_utc:
            return

        # Enviar emails
        await send_reminder_emails(appt, db)
    finally:
        db.close()


def schedule_reminder_job(appt: models.Appointment):
    """
    Programa el recordatorio 1 hora antes. Si falta menos de 1 hora:
    - Si aún falta >= 2 minutos para el inicio, programa en now + 1 minuto (para poder probar).
    - Si está muy cerca (< 2 min) o ya pasó, no programa.
    """
    if not scheduler:
        return
    if appt.status != models.AppointmentStatus.confirmed:
        return

    start_utc = (appt.start_at if appt.start_at.tzinfo else appt.start_at.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)
    run_at = start_utc - timedelta(hours=1)
    now_utc = datetime.now(timezone.utc)

    if run_at <= now_utc:
        if start_utc - now_utc >= timedelta(minutes=2):
            run_at = now_utc + timedelta(minutes=1)
        else:
            return

    job_id = get_job_id(appt.id)

    scheduler.add_job(
        func=_reminder_job,          # coroutine OK con AsyncIOScheduler
        trigger="date",
        run_date=run_at,
        id=job_id,
        replace_existing=True,
        kwargs={"appt_id": appt.id},
        misfire_grace_time=60,       # tolera 60s si hubo pausa
        coalesce=True,
    )


def cancel_reminder_job(appt_id: int):
    if not scheduler:
        return
    job_id = get_job_id(appt_id)
    try:
        scheduler.remove_job(job_id)
    except Exception:
        pass
