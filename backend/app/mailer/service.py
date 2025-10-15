# app/mailer/service.py
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig
from fastapi_mail.errors import ConnectionErrors
from typing import List, Dict, Any
from app.email_settings import EmailSettings
import logging

log = logging.getLogger("mailer")

def _build_conf(settings: EmailSettings) -> ConnectionConfig:
    # Soporte por si tu settings viejo aún trae MAIL_USE_CREDENTIALS
    use_creds = settings.USE_CREDENTIALS if settings.MAIL_USE_CREDENTIALS is None else settings.MAIL_USE_CREDENTIALS

    return ConnectionConfig(
        MAIL_USERNAME=settings.MAIL_USERNAME,
        MAIL_PASSWORD=settings.MAIL_PASSWORD,
        MAIL_FROM=settings.MAIL_FROM,
        MAIL_FROM_NAME=settings.MAIL_FROM_NAME,
        MAIL_SERVER=settings.MAIL_SERVER,
        MAIL_PORT=settings.MAIL_PORT,
        MAIL_STARTTLS=settings.MAIL_STARTTLS,
        MAIL_SSL_TLS=settings.MAIL_SSL_TLS,
        USE_CREDENTIALS=use_creds,
        VALIDATE_CERTS=settings.VALIDATE_CERTS,
        TEMPLATE_FOLDER="app/mailer/templates",
    )

async def send_email(
    recipients: List[str],
    subject: str,
    template_name: str,
    context: Dict[str, Any],
    settings: EmailSettings,
):
    conf = _build_conf(settings)
    fm = FastMail(conf)
    msg = MessageSchema(
        subject=subject,
        recipients=recipients,
        subtype="html",
        template_body=context,
    )
    try:
        await fm.send_message(msg, template_name=template_name)
        log.info("Email sent: %s -> %s", subject, recipients)
    except ConnectionErrors as ex:
        log.error("SMTP connection error: %s", ex)
    except Exception as ex:
        log.exception("Email send failed: %s", ex)
