# app/email_settings.py
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class EmailSettings(BaseSettings):
    MAIL_FROM_NAME: str = "CitasPsico"
    MAIL_FROM: str = "no-reply@psicologacherrez.com"

    MAIL_SERVER: str = "localhost"
    MAIL_PORT: int = 1025
    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_STARTTLS: bool = False
    MAIL_SSL_TLS: bool = False

    # ambos, para compatibilidad
    USE_CREDENTIALS: bool = False
    MAIL_USE_CREDENTIALS: Optional[bool] = None

    VALIDATE_CERTS: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

