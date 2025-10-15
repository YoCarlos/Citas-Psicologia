# app/routers/debug_scheduler.py
from __future__ import annotations
from fastapi import APIRouter, HTTPException
from datetime import timezone
from typing import List, Dict, Any, Optional

from ..scheduler import scheduler, get_job_id, cancel_reminder_job, schedule_reminder_job
from ..db import SessionLocal
from .. import models

router = APIRouter(prefix="/debug/scheduler", tags=["debug-scheduler"])

def _job2dict(job) -> Dict[str, Any]:
    next_run = job.next_run_time
    if next_run and next_run.tzinfo is None:
        next_run = next_run.replace(tzinfo=timezone.utc)
    return {
        "id": job.id,
        "name": job.name,
        "next_run_time_utc": next_run.isoformat() if next_run else None,
        "kwargs": job.kwargs or {},
        "trigger": str(job.trigger),
        "misfire_grace_time": job.misfire_grace_time,
        "coalesce": job.coalesce,
    }

@router.get("/jobs", response_model=List[Dict[str, Any]])
def list_jobs():
    if not scheduler:
        return []
    return [_job2dict(j) for j in scheduler.get_jobs()]

@router.get("/jobs/{appt_id}")
def get_job_for_appt(appt_id: int):
    if not scheduler:
        raise HTTPException(404, "Scheduler no iniciado")
    job_id = get_job_id(appt_id)
    job = scheduler.get_job(job_id)
    if not job:
        raise HTTPException(404, f"No existe job para cita #{appt_id}")
    return _job2dict(job)

@router.post("/jobs/{appt_id}/cancel")
def cancel_job(appt_id: int):
    cancel_reminder_job(appt_id)
    return {"ok": True, "cancelled": appt_id}

@router.post("/jobs/{appt_id}/reschedule")
def reschedule_job(appt_id: int):
    """
    Relee la cita desde DB y reprograma su job 1h antes (o en 1 min si falta <1h).
    Útil tras cambiar start_at o si el job no existía.
    """
    with SessionLocal() as db:
        appt: Optional[models.Appointment] = db.get(models.Appointment, appt_id)
        if not appt:
            raise HTTPException(404, "Cita no encontrada")
        schedule_reminder_job(appt)
        job_id = get_job_id(appt_id)
        job = scheduler.get_job(job_id) if scheduler else None
        return {"ok": True, "job": _job2dict(job) if job else None}

@router.post("/jobs/{appt_id}/run-now")
def run_job_now(appt_id: int):
    """
    Fuerza ejecutar el job (si existe) lo antes posible.
    Útil para pruebas sin esperar el tiempo real.
    """
    if not scheduler:
        raise HTTPException(404, "Scheduler no iniciado")
    job_id = get_job_id(appt_id)
    job = scheduler.get_job(job_id)
    if not job:
        raise HTTPException(404, f"No existe job para cita #{appt_id}")
    # Reprograma el job para que corra en ~3 segundos
    from datetime import datetime, timedelta, timezone
    run_at = datetime.now(timezone.utc) + timedelta(seconds=3)
    scheduler.modify_job(job_id, next_run_time=run_at)
    return {"ok": True, "new_next_run_time_utc": run_at.isoformat()}
