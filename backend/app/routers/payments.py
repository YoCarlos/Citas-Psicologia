# app/routers/payments.py
from __future__ import annotations
from typing import List, Optional, Tuple, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, or_
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import logging

from ..db import get_db
from .. import models, schemas
from ..security import get_current_user, require_role
from ..config import settings
from ..utils.tz import (
    to_utc,          # para entradas externas (si viniera naive => Ecuador)
    db_aware_utc,    # para valores leídos de BD (si viniera naive => UTC)
)
from ..mailer.notifications import send_confirmed_emails_by_id  # seguro por ID
from ..scheduler import schedule_reminder_job_by_id              # agenda por ID
from ..zoom_client import zoom
from ..payphone_client import confirm_button, PayphoneError

router = APIRouter(prefix="/payments", tags=["payments"])
logger = logging.getLogger(__name__)

GYE = ZoneInfo("America/Guayaquil")


# ---- helpers de conflictos (copiado/ajustado para evitar circular imports)
def _has_conflict_or_block(
    db: Session,
    *,
    doctor_id: int,
    start_utc: datetime,
    end_utc: datetime,
    exclude_appt_id: Optional[int] = None,
) -> bool:
    """
    Evalúa conflictos en SQL: citas confirmadas o pendientes (hold vigente)
    y bloques de calendario que crucen [start_utc, end_utc).
    Se espera start_utc/end_utc AWARE UTC.
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


def _zoom_start_iso_local_gye(start_utc: datetime) -> str:
    """
    Zoom: si envías timezone="America/Guayaquil", NO debes enviar 'Z'.
    Debes pasar el start_time en hora local (sin sufijo Z).
    """
    local_dt = start_utc.astimezone(GYE).replace(microsecond=0)
    # isoformat sin Z: p.ej. "2025-11-13T14:00:00"
    return local_dt.isoformat(timespec="seconds")


def _fmt_diag_times(s_utc: datetime, e_utc: datetime) -> Dict[str, str]:
    """Pequeño helper para adjuntar horarios en UTC y en GYE (texto)."""
    s_gye = s_utc.astimezone(GYE)
    e_gye = e_utc.astimezone(GYE)
    return {
        "start_utc": s_utc.replace(microsecond=0).isoformat(),
        "end_utc": e_utc.replace(microsecond=0).isoformat(),
        "start_gye": s_gye.replace(microsecond=0).isoformat(),
        "end_gye": e_gye.replace(microsecond=0).isoformat(),
    }


async def _confirm_single_appointment(
    db: Session,
    appt: models.Appointment
) -> Tuple[Optional[int], Optional[str], Dict[str, str]]:
    """
    Confirma una cita:
    - Revalida conflictos (teniendo en cuenta holds de terceros).
    - Crea Zoom si falta (si falla, no aborta la confirmación).
    - Cambia estado a confirmed y limpia hold_until.
    - NO hace commit; el llamador hace commit/flush.
    Retorna (confirmed_id, error_msg, diag_times).
      - confirmed_id: int si OK; None si falla
      - error_msg: razón si falla
      - diag_times: dict con start/end en UTC y GYE para logs/depuración
    """
    try:
        # Usar db_aware_utc por seguridad al leer desde BD
        s_utc = db_aware_utc(appt.start_at)
        e_utc = db_aware_utc(appt.end_at)
        diag = _fmt_diag_times(s_utc, e_utc)

        logger.info(
            "[payments] Intentando confirmar cita %s (doctor=%s, patient=%s) "
            "s_utc=%s e_utc=%s s_gye=%s e_gye=%s",
            appt.id, appt.doctor_id, appt.patient_id,
            diag["start_utc"], diag["end_utc"], diag["start_gye"], diag["end_gye"]
        )

        if e_utc <= s_utc:
            return (None, "Rango horario inválido", diag)

        # Validar conflictos a última hora
        if _has_conflict_or_block(
            db,
            doctor_id=appt.doctor_id,
            start_utc=s_utc,
            end_utc=e_utc,
            exclude_appt_id=appt.id
        ):
            return (None, "Conflicto con otro evento/hold", diag)

        # Crear Zoom si falta (sin abortar si falla)
        if not appt.zoom_meeting_id or not appt.zoom_join_url:
            try:
                if not settings.ZOOM_DEFAULT_USER:
                    raise RuntimeError("ZOOM_DEFAULT_USER no configurado")

                start_local_iso = _zoom_start_iso_local_gye(s_utc)
                duration = int((e_utc - s_utc).total_seconds() // 60) or 45

                z = await zoom.create_meeting(
                    user_id=settings.ZOOM_DEFAULT_USER,
                    topic=f"Cita {appt.id} - Doctor {appt.doctor_id}",
                    start_time_iso=start_local_iso,     # HORA LOCAL GYE (sin 'Z')
                    duration_minutes=duration,
                    timezone="America/Guayaquil",       # timezone declarado
                    waiting_room=True,
                    join_before_host=False,
                )
                appt.zoom_meeting_id = str(z.get("id"))
                appt.zoom_join_url = z.get("join_url")
            except Exception as ex:
                logger.warning(
                    "[payments] No se pudo crear Zoom para cita %s: %s",
                    appt.id, ex
                )
                # No abortar: seguimos sin link (podrás reintentar luego)
                appt.zoom_meeting_id = None
                appt.zoom_join_url = None

        # Confirmar
        appt.status = models.AppointmentStatus.confirmed
        appt.hold_until = None

        logger.info("[payments] Cita %s confirmada OK", appt.id)
        return (appt.id, None, diag)

    except HTTPException as hex:
        return (None, hex.detail or "HTTPException", _fmt_diag_times(db_aware_utc(appt.start_at), db_aware_utc(appt.end_at)))
    except Exception as ex:
        return (None, str(ex), _fmt_diag_times(db_aware_utc(appt.start_at), db_aware_utc(appt.end_at)))


@router.post(
    "/payphone/confirm",
    response_model=schemas.PayphoneConfirmOut,
    status_code=200,
    dependencies=[Depends(require_role(models.UserRole.patient))],
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
    - Devuelve también failed_appointments con motivo y horarios (UTC/GYE) para depurar
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
    opt3 = resp.get("optionalParameter3")  # p.ej. "appts=12,34,56"
    appt_ids_from_opt3 = _parse_optional_appt_ids(opt3)

    approved = (transaction_status.lower() == "approved") and (status_code == 3)

    logger.info(
        "[payments] Payphone confirm tx_id=%s approved=%s client_tx_id=%s opt3=%s",
        transaction_id, approved, client_tx_id, opt3
    )

    # 2) Idempotencia por pago
    existing_payment = db.scalar(
        select(models.Payment).where(models.Payment.payphone_tx_id == str(transaction_id))
    )
    if existing_payment:
        if appt_ids_from_opt3:
            appts = list(db.scalars(
                select(models.Appointment).where(models.Appointment.id.in_(appt_ids_from_opt3))
            ))
        else:
            appts = list(db.scalars(
                select(models.Appointment)
                .where(models.Appointment.client_tx_id == client_tx_id)
                .where(models.Appointment.patient_id == current.id)
            ))
        confirmed_ids = [a.id for a in appts if a.status == models.AppointmentStatus.confirmed]

        logger.info(
            "[payments] Pago idempotente tx_id=%s -> confirmed=%s",
            transaction_id, confirmed_ids
        )

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
            failed_appointments=[]
        )

    # 3) Si NO está aprobado, respondemos sin confirmar nada
    if not approved:
        logger.info(
            "[payments] Transacción NO aprobada (tx_id=%s): status=%s code=%s msg=%s",
            transaction_id, transaction_status, status_code, resp.get("message")
        )
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
            failed_appointments=[]
        )

    # 4) Obtener citas a confirmar
    if appt_ids_from_opt3:
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
        # LEGADO: por client_tx_id
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

    logger.info(
        "[payments] Citas objetivo para confirmar (tx=%s): %s",
        transaction_id, [a.id for a in target_appts]
    )

    confirmed_ids: List[int] = []
    failed: List[Dict[str, Any]] = []

    # 5) Confirmar cada cita (saltando conflictos/errores individualmente)
    for appt in target_appts:
        ok_id, err, diag = await _confirm_single_appointment(db, appt)
        if ok_id:
            confirmed_ids.append(ok_id)
        else:
            logger.info(
                "[payments] Cita %s NO confirmada: %s | diag=%s",
                appt.id, err, diag
            )
            # enriquecer con horarios para depurar TZ
            failed.append({
                "appointment_id": appt.id,
                "reason": err or "unknown",
                **diag
            })

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

    # 7) Tareas en background por ID (evita DetachedInstanceError)
    for appt_id in confirmed_ids:
        bg.add_task(send_confirmed_emails_by_id, appt_id)
        bg.add_task(schedule_reminder_job_by_id, appt_id)

    logger.info(
        "[payments] Resultado confirmación tx=%s -> confirmed=%s failed=%s",
        transaction_id, confirmed_ids, [f.get("appointment_id") for f in failed]
    )

    return schemas.PayphoneConfirmOut(
        transaction_status=transaction_status,
        status_code=status_code,
        transaction_id=transaction_id,
        client_tx_id=client_tx_id,
        amount_cents=amount,
        approved=True,
        confirmed_appointment_ids=confirmed_ids,
        payment_id=payment_id,
        message=(
            "Pago aprobado. Citas confirmadas."
            if confirmed_ids else
            "Pago aprobado, pero no se confirmó ninguna cita (posible conflicto/expiración)."
        ),
        failed_appointments=failed
    )
