# app/schemas.py
from datetime import date, datetime
import re
from typing import Optional, Literal, List
from pydantic import BaseModel, EmailStr, Field, field_validator

UserRoleLiteral = Literal["doctor", "patient"]
ApptStatusLiteral = Literal["free", "pending", "confirmed"]
PayMethodLiteral = Literal["payphone"]

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8)
    role: str  
    doctor_id: Optional[int] = None
 
    region: Optional[str] = Field(default=None, pattern="^(south_america|north_america|central_america|europe|asia|africa|oceania|other)$")

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(default=None, min_length=8)
    role: Optional[str] = None
    doctor_id: Optional[int] = None
  
    region: Optional[str] = Field(default=None, pattern="^(south_america|north_america|central_america|europe|asia|africa|oceania|other)$")

class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: str
    doctor_id: Optional[int] = None
  
    region: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# Auth
class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

class LoginIn(BaseModel):
    email: EmailStr
    password: str

# Patient profile
class PatientProfileBase(BaseModel):
    residence: Optional[str] = None
    emergency_contact: Optional[str] = None
    whatsapp: Optional[str] = None
    reason: Optional[str] = None

class PatientProfileCreate(PatientProfileBase):
    user_id: int

class PatientProfileUpdate(PatientProfileBase):
    pass

class PatientProfileOut(PatientProfileBase):
    user_id: int
    class Config: from_attributes = True

# Clinical History
class ClinicalHistoryBase(BaseModel):
    antecedentes_personales: Optional[str] = None
    antecedentes_familiares: Optional[str] = None
    medicacion_actual: Optional[str] = None
    alergias: Optional[str] = None
    diagnosticos_previos: Optional[str] = None
    consumo: Optional[str] = None
    antecedentes_psico: Optional[str] = None
    notas: Optional[str] = None

    background: Optional[str] = Field(default=None, alias="background")
    family_background: Optional[str] = Field(default=None, alias="family_background")
    medication: Optional[str] = Field(default=None, alias="medication")
    diagnosis: Optional[str] = Field(default=None, alias="diagnosis")
    psych_history: Optional[str] = Field(default=None, alias="psych_history")

    def canonical_dict(self) -> dict:
        """
        Devuelve un dict SOLO con las claves canónicas, combinando alias si llegaron.
        """
        return {
            "antecedentes_personales": self.antecedentes_personales or self.background,
            "antecedentes_familiares": self.antecedentes_familiares or self.family_background,
            "medicacion_actual": self.medicacion_actual or self.medication,
            "alergias": self.alergias,
            "diagnosticos_previos": self.diagnosticos_previos or self.diagnosis,
            "consumo": self.consumo,
            "antecedentes_psico": self.antecedentes_psico or self.psych_history,
            "notas": self.notas,
        }

class ClinicalHistoryCreate(ClinicalHistoryBase):
    patient_id: int

class ClinicalHistoryUpdate(ClinicalHistoryBase):
    # todo opcional (usamos exclude_unset en el router)
    pass

class ClinicalHistoryOut(BaseModel):
    id: int
    patient_id: int
    antecedentes_personales: Optional[str] = None
    antecedentes_familiares: Optional[str] = None
    medicacion_actual: Optional[str] = None
    alergias: Optional[str] = None
    diagnosticos_previos: Optional[str] = None
    consumo: Optional[str] = None
    antecedentes_psico: Optional[str] = None
    notas: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Therapeutic Plan
class TherapeuticPlanBase(BaseModel):
    objetivos: Optional[str] = None
    frecuencia: Optional[str] = None
    intervenciones: Optional[str] = None  # 👈 el front manda 'tecnicas' pero aquí guardamos como 'intervenciones'
    tareas: Optional[str] = None
    metricas: Optional[str] = None
    proxima_revision: Optional[date] = None
    notas: Optional[str] = None

class TherapeuticPlanCreate(TherapeuticPlanBase):
    patient_id: int

class TherapeuticPlanUpdate(TherapeuticPlanBase):
    pass

class TherapeuticPlanOut(BaseModel):
    id: int
    patient_id: int
    objetivos: Optional[str] = None
    frecuencia: Optional[str] = None
    intervenciones: Optional[str] = None
    tareas: Optional[str] = None
    metricas: Optional[str] = None
    proxima_revision: Optional[date] = None
    notas: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Literales


# Appointments
class AppointmentBase(BaseModel):
    doctor_id: int
    patient_id: Optional[int] = None
    start_at: datetime
    end_at: datetime
    status: Optional[ApptStatusLiteral] = "free"
    method: Optional[PayMethodLiteral] = None

class AppointmentCreate(AppointmentBase):
    pass

class AppointmentUpdate(BaseModel):
    patient_id: Optional[int] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    status: Optional[ApptStatusLiteral] = None
    method: Optional[PayMethodLiteral] = None
    hold_until: Optional[datetime] = None

class AppointmentOut(AppointmentBase):
    id: int
    hold_until: Optional[datetime] = None
    zoom_meeting_id: Optional[str] = None
    zoom_join_url: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True

# --- HOLD (bloqueo temporal mientras paga) ---
class AppointmentHoldSlot(BaseModel):
    start_at: datetime
    end_at: datetime

class AppointmentHoldIn(BaseModel):
    doctor_id: int
    method: PayMethodLiteral = "payphone"
    hold_minutes: int = Field(default=60, ge=5, le=180)
    slots: List[AppointmentHoldSlot]

class AppointmentHoldOut(BaseModel):
    appointments: List[AppointmentOut]

# Payments (renombramos stripe -> payphone)
class PaymentBase(BaseModel):
    appointment_id: int
    method: PayMethodLiteral
    payphone_id: Optional[str] = None
    confirmed_by_doctor: Optional[bool] = None

class PaymentCreate(PaymentBase): pass

class PaymentUpdate(BaseModel):
    method: Optional[PayMethodLiteral] = None
    payphone_id: Optional[str] = None
    confirmed_by_doctor: Optional[bool] = None

class PaymentOut(PaymentBase):
    confirmed_at: Optional[datetime] = None
    created_at: datetime
    class Config:
        from_attributes = True


# Availability
class AvailabilityCreate(BaseModel):
    doctor_id: int
    start_at: datetime
    end_at: datetime

class AvailabilityUpdate(BaseModel):
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None

class AvailabilityOut(BaseModel):
    id: int
    doctor_id: int
    start_at: datetime
    end_at: datetime
    created_at: datetime
    class Config: from_attributes = True

# === NUEVO: Schemas para reglas semanales de disponibilidad ===

_HHMM = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")

class TimeRange(BaseModel):
    start: str = Field(..., description="HH:MM (24h)")
    end: str   = Field(..., description="HH:MM (24h)")

    @field_validator("start", "end")
    @classmethod
    def _valid_hhmm(cls, v: str):
        if not _HHMM.match(v):
            raise ValueError("Formato debe ser HH:MM (24h)")
        return v

class AvailabilityRuleCreate(BaseModel):
    doctor_id: int
    weekday: int = Field(..., ge=0, le=6, description="0=Dom, 1=Lun, ..., 6=Sáb")
    enabled: bool = False
    ranges: List[TimeRange] = Field(default_factory=list)

class AvailabilityRuleOut(BaseModel):
    id: int
    doctor_id: int
    weekday: int
    enabled: bool
    ranges: List[TimeRange]
    created_at: datetime
    updated_at: datetime
    class Config: from_attributes = True

class AvailabilityWeeklyUpsertIn(BaseModel):
    """
    Upsert en bloque de reglas semanales (por weekday) para un doctor.
    """
    doctor_id: int
    rules: List[AvailabilityRuleCreate]

    @field_validator("rules")
    @classmethod
    def _validate_rules(cls, rules: List[AvailabilityRuleCreate]):
        # evitar weekdays duplicados en payload y validar solapes por día
        seen = set()

        def to_min(s: str) -> int:
            h, m = s.split(":")
            return int(h) * 60 + int(m)

        for r in rules:
            if r.weekday in seen:
                raise ValueError(f"weekday {r.weekday} repetido en rules")
            seen.add(r.weekday)

            mins = []
            for t in r.ranges:
                if t.end <= t.start:
                    raise ValueError(f"weekday {r.weekday}: end debe ser mayor que start")
                mins.append((to_min(t.start), to_min(t.end)))
            mins.sort()
            for i in range(1, len(mins)):
                if mins[i][0] < mins[i-1][1]:
                    raise ValueError(f"weekday {r.weekday}: rangos solapados")
        return rules
    
class AvailableSlotOut(BaseModel):
    doctor_id: int
    start_at: datetime
    end_at: datetime
    class Config: from_attributes = True


class DoctorSettingsIn(BaseModel):
    doctor_id: int
    duration_min: int = Field(..., ge=10, le=240)
    price_usd: float = Field(..., ge=0)

class DoctorSettingsOut(BaseModel):
    doctor_id: int
    duration_min: int
    price_usd: float
    created_at: datetime
    updated_at: datetime
    class Config: from_attributes = True