# app/models.py
import enum
from datetime import datetime, date, timezone
from typing import List, Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


# =========================
# Enums
# =========================

class UserRole(str, enum.Enum):
    doctor = "doctor"
    patient = "patient"


class AppointmentStatus(str, enum.Enum):
    free = "free"
    pending = "pending"
    confirmed = "confirmed"
    cancelled = "cancelled"  # opcional


class PaymentMethod(str, enum.Enum):
    payphone = "payphone"


# =========================
# Users
# =========================

class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("email", name="uq_users_email"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"), nullable=False)

    # paciente asignado a una doctora (opcional)
    doctor_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    region: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)

    # relaciones
    doctor: Mapped["User"] = relationship(
        "User",
        remote_side="User.id",
        back_populates="patients",
        foreign_keys=[doctor_id],
    )
    patients: Mapped[List["User"]] = relationship(
        "User",
        back_populates="doctor",
        cascade="all, delete-orphan",
        passive_deletes=True,
        foreign_keys="[User.doctor_id]",
    )

    profile: Mapped[Optional["PatientProfile"]] = relationship(
        "PatientProfile",
        uselist=False,
        back_populates="user",
        cascade="all, delete-orphan",
    )

    # tz-aware y que la ponga la BD
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )


class PatientProfile(Base):
    __tablename__ = "patient_profiles"

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    residence: Mapped[Optional[str]] = mapped_column(String(120))
    emergency_contact: Mapped[Optional[str]] = mapped_column(String(120))
    whatsapp: Mapped[Optional[str]] = mapped_column(String(50))
    reason: Mapped[Optional[str]] = mapped_column(String(255))

    user: Mapped["User"] = relationship("User", back_populates="profile")


# =========================
# Clinical History
# =========================

class ClinicalHistory(Base):
    __tablename__ = "clinical_histories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )

    antecedentes_personales: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    antecedentes_familiares: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    medicacion_actual: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    alergias: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    diagnosticos_previos: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    consumo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    antecedentes_psico: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    factores_protectores: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    patient = relationship("User", backref="clinical_histories")


# =========================
# Therapeutic Plan
# =========================

class TherapeuticPlan(Base):
    __tablename__ = "therapeutic_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    objetivos: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    frecuencia: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    intervenciones: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # front "tecnicas"
    tareas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metricas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    proxima_revision: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# =========================
# Appointments / Payments
# =========================

class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    doctor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    patient_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )

    # guardar siempre en UTC (tz-aware)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    status: Mapped[AppointmentStatus] = mapped_column(
        Enum(AppointmentStatus, name="appointment_status"),
        default=AppointmentStatus.free,
        nullable=False,
    )

    method: Mapped[Optional[PaymentMethod]] = mapped_column(
        Enum(PaymentMethod, name="payment_method"),
        nullable=True,
    )

    hold_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    zoom_meeting_id: Mapped[Optional[str]] = mapped_column(String(120))
    zoom_join_url: Mapped[Optional[str]] = mapped_column(String(500))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )

    client_tx_id: Mapped[Optional[str]] = mapped_column(String(120), index=True)


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    appointment_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("appointments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    method: Mapped[str] = mapped_column(String(30), nullable=False)  # "payphone"
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    payphone_tx_id: Mapped[str] = mapped_column(String(60), nullable=False, index=True)  # transactionId como string
    client_tx_id: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    raw_payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    appointment: Mapped[Optional["Appointment"]] = relationship("Appointment", backref="payments")

    __table_args__ = (
        UniqueConstraint("payphone_tx_id", name="uq_payment_payphone_tx_id"),  # <-- idempotencia  # TODO: alembic
    )


# =========================
# Availability (slots puntuales)
# =========================

class AvailabilitySlot(Base):
    __tablename__ = "availability"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    doctor_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)

    # UTC tz-aware (el router se encarga de convertir entradas/salidas)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )


# =========================
# Availability rules (plantilla semanal)
# =========================

class AvailabilityRule(Base):
    __tablename__ = "availability_rules"
    __table_args__ = (
        UniqueConstraint("doctor_id", "weekday", name="uq_availability_rules_doc_weekday"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    doctor_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # 0=Dom, 1=Lun, ..., 6=Sáb
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)

    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ranges: Mapped[List[dict]] = mapped_column(JSON, default=list, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# =========================
# Doctor settings
# =========================

class DoctorSettings(Base):
    __tablename__ = "doctor_settings"
    __table_args__ = (UniqueConstraint("doctor_id", name="uq_doctor_settings_doctor"),)

    doctor_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )

    duration_min: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    price_usd: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=35.00)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ReminderStatus(enum.Enum):
    scheduled = "scheduled"
    executed = "executed"
    canceled = "canceled"
    missed   = "missed"
    error    = "error"


class ReminderJob(Base):
    __tablename__ = "reminder_jobs"

    # id = "appt_reminder:{appointment_id}"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)

    appointment_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("appointments.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    run_at_utc: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    status: Mapped[ReminderStatus] = mapped_column(
        Enum(ReminderStatus, name="reminder_status"),
        nullable=False,
        default=ReminderStatus.scheduled,
    )

    executed_at_utc: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    last_error: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relación opcional (si tienes Appointment en models)
    appointment: Mapped["Appointment"] = relationship("Appointment", backref="reminder_jobs")

    def __repr__(self) -> str:
        return f"<ReminderJob id={self.id} appt={self.appointment_id} status={self.status.value}>"
    
    # --- Bloqueos de agenda (unavailability) ---
class CalendarBlock(Base):
    __tablename__ = "calendar_blocks"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)

    # Guardamos SIEMPRE en UTC
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Opcional: marcar si es "todo el día" (conveniente para UI)
    all_day:  Mapped[bool] = mapped_column(default=False)

    # Opcional: motivo/nota
    reason:   Mapped[Optional[str]] = mapped_column(default=None)

    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    doctor: Mapped["User"] = relationship(foreign_keys=[doctor_id])
    creator: Mapped["User"] = relationship(foreign_keys=[created_by])