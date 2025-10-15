from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel, EmailStr
from app.mailer.service import send_email
from app.email_settings import EmailSettings


router = APIRouter(prefix="/debug", tags=["debug-email"])

class TestEmailPayload(BaseModel):
    to: EmailStr
    name: str | None = None
    action_url: str | None = "https://example.com"

@router.post("/email-test")
async def debug_email_test(payload: TestEmailPayload, bg: BackgroundTasks):
    settings = EmailSettings()  # lee backend/.env
    subject = "Prueba de envío (local)"
    template_name = "hello_test.html"
    context = {
        "title": "¡Hola!",
        "name": payload.name or "Amiga/o",
        "action_url": payload.action_url,
        "env": "local"
    }
    bg.add_task(
        send_email,
        [payload.to],
        subject,
        template_name,
        context,
        settings
    )
    return {"ok": True, "detail": "Email encolado (revisa MailHog en http://localhost:8025)"}
