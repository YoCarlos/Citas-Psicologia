# app/routers/jobs.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, timezone

from ..db import get_db
from .. import models, schemas
from ..security import get_current_user
from ..scheduler import (
    _reminder_job, cancel_reminder_job, schedule_reminder_job,
    rebuild_jobs_on_startup, get_job_id
)

router = APIRouter(prefix="/jobs", tags=["jobs"])

# Solo doctor y paciente (no hay admin)
ALLOWED_ROLES = [models.UserRole.doctor, models.UserRole.patient]

# =========================
# LISTAR JOBS
# =========================
@router.get("", response_model=List[schemas.ReminderJobOut])
def list_jobs(
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current = Depends(get_current_user),
):
    if current.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=403, detail="Sin permisos")

    q = db.query(models.ReminderJob)

    # Filtro por rol: doctor ve todo; paciente solo los suyos
    if current.role == models.UserRole.patient:
        q = q.join(models.Appointment, models.Appointment.id == models.ReminderJob.appointment_id)\
             .filter(models.Appointment.patient_id == current.id)

    if status_filter:
        try:
            status_enum = models.ReminderStatus(status_filter)
        except Exception:
            raise HTTPException(status_code=400, detail="status_filter inválido")
        q = q.filter(models.ReminderJob.status == status_enum)

    q = q.order_by(models.ReminderJob.run_at_utc.asc())
    return q.all()

# =========================
# OBTENER UN JOB
# =========================
@router.get("/{job_id}", response_model=schemas.ReminderJobOut)
def get_job(
    job_id: str,
    db: Session = Depends(get_db),
    current = Depends(get_current_user),
):
    if current.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=403, detail="Sin permisos")

    job = db.get(models.ReminderJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    # Paciente solo puede ver si la cita es suya
    if current.role == models.UserRole.patient:
        appt = db.get(models.Appointment, job.appointment_id)
        if not appt or appt.patient_id != current.id:
            raise HTTPException(status_code=403, detail="No puedes ver este job")

    return job

# =========================
# EJECUTAR AHORA (sin BackgroundTasks)
# =========================
@router.post("/{job_id}/run-now")
async def run_now(
    job_id: str,
    db: Session = Depends(get_db),
    current = Depends(get_current_user),
):
    if current.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=403, detail="Sin permisos")

    job = db.get(models.ReminderJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    appt = db.get(models.Appointment, job.appointment_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Cita asociada no encontrada")

    # Paciente solo si es su cita
    if current.role == models.UserRole.patient and appt.patient_id != current.id:
        raise HTTPException(status_code=403, detail="No puedes ejecutar este job")

    # Ejecuta inmediatamente (await al job async)
    await _reminder_job(appt.id)
    return {"ok": True, "msg": f"Job {job_id} ejecutado ahora"}

# =========================
# CANCELAR
# =========================
@router.delete("/{job_id}")
def cancel_job(
    job_id: str,
    db: Session = Depends(get_db),
    current = Depends(get_current_user),
):
    if current.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=403, detail="Sin permisos")

    job = db.get(models.ReminderJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    appt = db.get(models.Appointment, job.appointment_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Cita asociada no encontrada")

    # Paciente solo si es su cita
    if current.role == models.UserRole.patient and appt.patient_id != current.id:
        raise HTTPException(status_code=403, detail="No puedes cancelar este job")

    cancel_reminder_job(job.appointment_id)
    return {"ok": True, "msg": f"Job {job_id} cancelado"}

# =========================
# REPROGRAMAR PARA UNA CITA
# =========================
@router.post("/rebuild/{appointment_id}")
def rebuild_job_for_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    current = Depends(get_current_user),
):
    if current.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=403, detail="Sin permisos")

    appt = db.get(models.Appointment, appointment_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    # Paciente solo si es su cita
    if current.role == models.UserRole.patient and appt.patient_id != current.id:
        raise HTTPException(status_code=403, detail="No puedes reprogramar este job")

    schedule_reminder_job(appt)
    return {"ok": True, "msg": f"Job reprogramado para cita {appointment_id}"}

# =========================
# REBUILD GLOBAL (doctor puede; paciente NO)
# =========================
@router.post("/rebuild-all")
def rebuild_all_jobs(
    db: Session = Depends(get_db),
    current = Depends(get_current_user),
):
    if current.role != models.UserRole.doctor:
        raise HTTPException(status_code=403, detail="Solo el doctor puede reprogramar todos los jobs")

    rebuild_jobs_on_startup()
    return {"ok": True, "msg": "Se reprogramaron todos los jobs activos"}
