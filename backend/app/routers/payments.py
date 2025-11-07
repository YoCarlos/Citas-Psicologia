# app/routers/payments.py
from __future__ import annotations
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, or_
from datetime import datetime, timezone

from ..db import get_db
from .. import models, schemas
from ..security import get_current_user, require_role
from ..config import settings
from ..utils.tz import to_utc, iso_utc_z
from ..mailer.notifications import send_confirmed_emails
from ..scheduler import schedule_reminder_job
from ..zoom_client import zoom
from ..payphone_client import confirm_button, PayphoneError

router = APIRouter(prefix="/payments", tags=["payments"])

# ---- helpers de conflictos (copiado del router de citas para evitar circular imports)
def _has_conflict_or_block(
    db: Session,
    *,
    doctor_id: int,
    start_utc: datetime,
    end_utc: datetime,
    exclude_appt_id: Optional[int] = None,
) -> bool:
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
                        models.Appointment.hold_until == None,  # noqa
                        models.Appointment.hold_until > now_utc,
                    ),
                ),
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


async def _confirm_single_appointment(
    db: Session,
    bg: BackgroundTasks,
    appt: models.Appointment
) -> models.Appointment:
    """
    Confirma una cita: crea Zoom si falta (no aborta si falla), limpia hold_until,
    cambia estado y agenda recordatorio si hay link de Zoom.
    No hace commit; el commit lo hace el llamador (batch).
    """
    s = to_utc(appt.start_at)
    e = to_utc(appt.end_at)
    if e <= s:
        raise HTTPException(status_code=400, detail="Rango horario inválido")

    # Validar conflictos a última hora
    if _has_conflict_or_block(
        db,
        doctor_id=appt.doctor_id,
        start_utc=s,
        end_utc=e,
        exclude_appt_id=appt.id,
    ):
        raise HTTPException(409, detail="Ese horario ya está ocupado o bloqueado")

    zoom_created = False

    # Crear Zoom solo si falta
    if not appt.zoom_meeting_id or not appt.zoom_join_url:
        try:
            if not settings.ZOOM_DEFAULT_USER:
                raise RuntimeError("ZOOM_DEFAULT_USER no configurado")

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
            zoom_created = True
        except Exception:
            # No abortamos: confirmamos igual y se puede reintentar Zoom luego
            appt.zoom_meeting_id = None
            appt.zoom_join_url = None

    # Confirmar
    appt.status = models.AppointmentStatus.confirmed
    appt.hold_until = None

    # Programar recordatorio y correos solo si hay link
    if (zoom_created or appt.zoom_join_url) and appt.zoom_join_url:
        bg.add_task(send_confirmed_emails, appt, db)
        schedule_reminder_job(appt)

    return appt


def _parse_optional_appt_ids(opt3: Optional[str]) -> List[int]:
    """
    Espera formato 'appts=12,34,56'. Devuelve [12,34,56].
    """
    if not opt3:
        return []
    opt3 = str(opt3).strip()
    if not opt3.startswith("appts="):
        return []
    payload = opt3[6:].strip()
    if not payload:
        return []
    ids: List[int] = []
    for tok in payload.split(","):
        tok = tok.strip()
        if tok.isdigit():
            ids.append(int(tok))
    return ids


@router.post(
    "/payphone/confirm",
    response_model=schemas.PayphoneConfirmOut,
    status_code=200,
    dependencies=[Depends(require_role(models.UserRole.patient))],  # lo usa el paciente al volver del ReturnURL
)
async def payphone_confirm(
    payload: schemas.PayphoneConfirmIn,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current = Depends(get_current_user),
):
    """
    Verifica con PayPhone (Confirm) el estado de la transacción y, si está Approved:
    - Lee optionalParameter3 = 'appts=ID1,ID2,...' y confirma SOLO esas citas (nuevo flujo)
    - Si no llega optionalParameter3, cae al flujo anterior por clientTxId (legado)
    - Registra Payment idempotente por payphone_tx_id (transactionId)
    """
    # 1) Consultar PayPhone
    try:
        resp = confirm_button(transaction_id=payload.id, client_tx_id=payload.clientTxId)
    except PayphoneError as ex:
        raise HTTPException(status_code=502, detail=str(ex))

    # Campos típicos
    transaction_status = (resp.get("transactionStatus") or "").strip()
    status_code = int(resp.get("statusCode") or 0)
    transaction_id = int(resp.get("transactionId") or payload.id)
    client_tx_id = resp.get("clientTransactionId") or payload.clientTxId or ""
    amount = int(resp.get("amount") or 0)  # centavos

    # NUEVO: ids desde optionalParameter3
    opt3 = resp.get("optionalParameter3")  # p.ej. "appts=12,34,56"
    appt_ids_from_opt3 = _parse_optional_appt_ids(opt3)

    approved = (transaction_status.lower() == "approved") and (status_code == 3)

    # 2) Idempotencia por pago
    existing_payment = db.scalar(
        select(models.Payment).where(models.Payment.payphone_tx_id == str(transaction_id))
    )
    if existing_payment:
        # Ya registrado antes: devolvemos éxito con info
        confirmed_ids: List[int] = []
        if appt_ids_from_opt3:
            appts = list(db.scalars(
                select(models.Appointment).where(models.Appointment.id.in_(appt_ids_from_opt3))
            ))
            confirmed_ids = [a.id for a in appts if a.status == models.AppointmentStatus.confirmed]
        else:
            appts = list(db.scalars(
                select(models.Appointment)
                .where(models.Appointment.client_tx_id == client_tx_id)
                .where(models.Appointment.patient_id == current.id)
            ))
            confirmed_ids = [a.id for a in appts if a.status == models.AppointmentStatus.confirmed]

        return schemas.PayphoneConfirmOut(
            transaction_status=transaction_status,
            status_code=status_code,
            transaction_id=transaction_id,
            client_tx_id=client_tx_id,
            amount_cents=amount,
            approved=approved,
            confirmed_appointment_ids=confirmed_ids,
            payment_id=existing_payment.id,
            message="Pago ya había sido registrado (idempotente).",
        )

    # 3) Si NO está aprobado, respondemos sin confirmar nada
    if not approved:
        return schemas.PayphoneConfirmOut(
            transaction_status=transaction_status,
            status_code=status_code,
            transaction_id=transaction_id,
            client_tx_id=client_tx_id,
            amount_cents=amount,
            approved=False,
            confirmed_appointment_ids=[],
            payment_id=None,
            message=resp.get("message") or "Transacción no aprobada.",
        )

    # 4) Obtener citas a confirmar
    confirmed_ids: List[int] = []
    target_appts: List[models.Appointment] = []

    if appt_ids_from_opt3:
        # NUEVO: confirmar SOLO las recibidas en optionalParameter3
        target_appts = list(db.scalars(
            select(models.Appointment)
            .where(models.Appointment.id.in_(appt_ids_from_opt3))
            .where(models.Appointment.patient_id == current.id)
            .where(models.Appointment.status.in_([
                models.AppointmentStatus.pending,
                getattr(models.AppointmentStatus, "processing", models.AppointmentStatus.pending),
                models.AppointmentStatus.free,
            ]))
        ))
    else:
        # LEGADO: por client_tx_id (si aún hay citas con ese vínculo)
        target_appts = list(db.scalars(
            select(models.Appointment)
            .where(models.Appointment.client_tx_id == client_tx_id)
            .where(models.Appointment.patient_id == current.id)
            .where(models.Appointment.status.in_([
                models.AppointmentStatus.pending,
                getattr(models.AppointmentStatus, "processing", models.AppointmentStatus.pending),
                models.AppointmentStatus.free,
            ]))
        ))

    # 5) Confirmar cada cita (saltando conflictos/errores individualmente)
    for appt in target_appts:
        try:
            await _confirm_single_appointment(db, bg, appt)
            confirmed_ids.append(appt.id)
        except HTTPException:
            # si hay conflicto/expiración con alguna, la saltamos
            continue

    # 6) Registrar Payment si al menos una cita fue confirmada
    payment_row: Optional[models.Payment] = None
    if confirmed_ids:
        ref_id = confirmed_ids[0]
        payment_row = models.Payment(
            appointment_id=ref_id,
            method="payphone",
            amount_cents=amount,
            payphone_tx_id=str(transaction_id),
            client_tx_id=client_tx_id,
            raw_payload=resp,  # auditoría completa
        )
        db.add(payment_row)

    db.commit()

    payment_id: Optional[int] = None
    if payment_row:
        db.refresh(payment_row)
        payment_id = payment_row.id

    return schemas.PayphoneConfirmOut(
        transaction_status=transaction_status,
        status_code=status_code,
        transaction_id=transaction_id,
        client_tx_id=client_tx_id,
        amount_cents=amount,
        approved=True,
        confirmed_appointment_ids=confirmed_ids,
        payment_id=payment_id,
        message="Pago aprobado. Citas confirmadas." if confirmed_ids else "Pago aprobado, pero no se confirmó ninguna cita (posible conflicto/expiración).",
    )
