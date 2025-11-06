# app/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # =====================================================
    # 🔐 JWT (Autenticación)
    # =====================================================
    JWT_SECRET: str
    JWT_ALG: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 días

    # =====================================================
    # 🗄️ Base de datos
    # =====================================================
    DATABASE_URL: str

    # =====================================================
    # 🌐 Zoom (Integración de videollamadas)
    # =====================================================
    ZOOM_ACCOUNT_ID: str
    ZOOM_CLIENT_ID: str
    ZOOM_CLIENT_SECRET: str
    ZOOM_DEFAULT_USER: str
    ZOOM_API_BASE: str = "https://api.zoom.us/v2"

    # =====================================================
    # 💳 PayPhone (Pasarela de pagos)
    # =====================================================
    PAYPHONE_PRIVATE_TOKEN: str | None = None
    PAYPHONE_CONFIRM_URL: str = "https://pay.payphonetodoesposible.com/api/button/V2/Confirm"
    PAYPHONE_STORE_ID: str | None = None

    # =====================================================
    # ⚙️ Configuración de entorno
    # =====================================================
    model_config = SettingsConfigDict(
        env_file=".env",      # lee variables desde .env en el directorio backend
        extra="ignore"        # ignora variables extra no definidas en el modelo
    )


# Instancia global
settings = Settings()


# 👇 Útil para probar el contenido cargado: python -m app.config
if __name__ == "__main__":
    from pprint import pprint
    pprint(settings.model_dump())
