from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # 🔐 JWT
    JWT_SECRET: str
    JWT_ALG: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # 🗄️ Base de datos
    DATABASE_URL: str

    # 🌐 Zoom
    ZOOM_ACCOUNT_ID: str
    ZOOM_CLIENT_ID: str
    ZOOM_CLIENT_SECRET: str
    ZOOM_DEFAULT_USER: str
    ZOOM_API_BASE: str = "https://api.zoom.us/v2"

    # ⚙️ Configuración de carga .env
    model_config = SettingsConfigDict(
        env_file=".env",      # lee variables desde .env en el directorio backend
        extra="ignore"        # ignora variables extra no definidas en el modelo
    )


settings = Settings()

# 👇 Útil para probar: python -m app.config
if __name__ == "__main__":
    from pprint import pprint
    pprint(settings.model_dump())
