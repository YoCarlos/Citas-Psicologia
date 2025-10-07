# app/routers/zoom_test.py
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..config import settings
from ..zoom_client import zoom

router = APIRouter(prefix="/zoom", tags=["zoom"])

class ZoomTestIn(BaseModel):
    topic: str = Field(default="Reunión de prueba CitasPsico")
    start_in_minutes: int = Field(default=10, ge=1, le=1440)
    duration_minutes: int = Field(default=45, ge=5, le=300)
    passcode: Optional[str] = Field(default=None, max_length=10)

@router.post("/test")
async def zoom_test(payload: ZoomTestIn):
    if not settings.ZOOM_DEFAULT_USER:
        raise HTTPException(status_code=500, detail="ZOOM_DEFAULT_USER no configurado")

    # Hora de inicio en UTC (ISO 8601 con sufijo Z)
    start_utc = datetime.now(timezone.utc) + timedelta(minutes=payload.start_in_minutes)
    start_iso = start_utc.replace(microsecond=0).isoformat().replace("+00:00", "Z")

    try:
        created = await zoom.create_meeting(
            user_id=settings.ZOOM_DEFAULT_USER,
            topic=payload.topic,
            start_time_iso=start_iso,
            duration_minutes=payload.duration_minutes,
            timezone="America/Guayaquil",
            waiting_room=True,
            join_before_host=False,
            passcode=payload.passcode,
        )
        # Devolvemos lo esencial para validar rápidamente
        return {
            "ok": True,
            "meeting_id": created.get("id"),
            "topic": created.get("topic"),
            "start_time": created.get("start_time"),
            "join_url": created.get("join_url"),
            "password": created.get("password"),
            "host_email": created.get("host_email"),
        }
    except Exception as e:
        # Si el token expiró/permiso falta, zoom_client ya reintenta una vez; aquí devolvemos el error
        raise HTTPException(status_code=502, detail=f"Zoom error: {e}")
