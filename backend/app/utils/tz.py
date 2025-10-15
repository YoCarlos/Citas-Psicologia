# app/utils/tz.py
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

TZ_EC = ZoneInfo("America/Guayaquil")

def to_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    # Si llega naive, interpretamos que es hora local de Ecuador
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TZ_EC)
    return dt.astimezone(timezone.utc)

def aware_to_local_naive(dt: datetime) -> datetime:
    # aware → hora de Ecuador (naive) para cálculos locales por día
    return dt.astimezone(TZ_EC).replace(tzinfo=None)

def local_naive_to_aware_utc(dt: datetime) -> datetime:
    # local naive Ecuador → aware UTC (para responder al cliente)
    return dt.replace(tzinfo=TZ_EC).astimezone(timezone.utc)

def iso_utc_z(dt: datetime) -> str:
    d = to_utc(dt).replace(microsecond=0)
    s = d.isoformat()
    return s if s.endswith("Z") or "+" in s else s + "Z"
