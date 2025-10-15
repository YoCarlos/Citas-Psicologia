
from app.email_settings import EmailSettings
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from jinja2 import Environment, FileSystemLoader, select_autoescape
from typing import Dict, Any, Sequence
from pathlib import Path


TEMPLATES_DIR = Path(__file__).parent / "templates"

jinja_env = Environment(
    loader=FileSystemLoader(TEMPLATES_DIR),
    autoescape=select_autoescape(["html", "xml"])
)

def render_template(template_name: str, context: Dict[str, Any]) -> str:
    return jinja_env.get_template(template_name).render(**context)

def get_connection_config(settings: EmailSettings) -> ConnectionConfig:
    return ConnectionConfig(
        MAIL_USERNAME=settings.MAIL_USERNAME or None,
        MAIL_PASSWORD=settings.MAIL_PASSWORD or None,
        MAIL_FROM=settings.MAIL_FROM,             # 👈 debe ser solo el email
        MAIL_FROM_NAME=settings.MAIL_FROM_NAME,   # 👈 el nombre va aquí
        MAIL_SERVER=settings.MAIL_SERVER,
        MAIL_PORT=settings.MAIL_PORT,
        MAIL_STARTTLS=settings.MAIL_STARTTLS,
        MAIL_SSL_TLS=settings.MAIL_SSL_TLS,
        USE_CREDENTIALS=settings.MAIL_USE_CREDENTIALS,
        TEMPLATE_FOLDER=TEMPLATES_DIR,
    )

async def send_email(
    recipients: Sequence[str],
    subject: str,
    template_name: str,
    context: Dict[str, Any],
    settings: EmailSettings
) -> None:
    conf = get_connection_config(settings)
    fm = FastMail(conf)
    html_body = render_template(template_name, context)
    message = MessageSchema(
        subject=subject,
        recipients=list(recipients),
        body=html_body,
        subtype=MessageType.html
    )
    await fm.send_message(message)
