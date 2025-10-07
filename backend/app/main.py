# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .db import SessionLocal  # engine/Base no se usan aquí (migramos con Alembic)
from .config import settings

# Routers
from .routers import (
    auth,
    users,
    patients,
    clinical_histories,
    therapeutic_plans,
    appointments,
    payments,
    availability,
    zoom_test,
    settings,
)

app = FastAPI(
    title="CitasPsico API",
    version="0.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Routers ---
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(patients.router)
app.include_router(clinical_histories.router)
app.include_router(therapeutic_plans.router)
app.include_router(appointments.router)
app.include_router(payments.router)
app.include_router(availability.router)
app.include_router(zoom_test.router)
app.include_router(settings.router)

# --- Healthchecks ---
@app.get("/")
def root():
    return {"ok": True, "service": "CitasPsico API"}

@app.get("/health/db")
def health_db():
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
    return {"db": "ok"}

@app.get("/health/config")
def health_config():
    return {
        "jwt_alg": settings.JWT_ALG,
        "tz": getattr(settings, "TZ", "America/Guayaquil"),
        "zoom_api_base": settings.ZOOM_API_BASE,
    }

# --- Debug DB info ---
@app.get("/debug/dbinfo")
def debug_dbinfo():
    """
    Muestra a qué DB se conecta la API y cuenta usuarios.
    Funciona con Postgres/SQLite (sin funciones específicas).
    """
    info = {}
    with SessionLocal() as db:
        bind = db.get_bind()
        dialect = bind.dialect.name  # 'postgresql' o 'sqlite'
        url_str = str(bind.url)

        # valores por defecto
        current_db = None
        server_host = None
        server_port = None
        users_count = None
        version = None

        if dialect == "postgresql":
            current_db = db.execute(text("SELECT current_database()")).scalar()
            server_host = db.execute(text("SELECT inet_server_addr()")).scalar()
            server_port = db.execute(text("SELECT inet_server_port()")).scalar()
            version = db.execute(text("SHOW server_version")).scalar()
            try:
                users_count = db.execute(text("SELECT COUNT(*) FROM public.users")).scalar()
            except Exception:
                users_count = None

        else:
            # SQLite u otros
            version = db.execute(text("SELECT 1")).scalar()  # sanity check
            # Para SQLite, intenta contar si existe la tabla
            try:
                users_count = db.execute(text("SELECT COUNT(*) FROM users")).scalar()
            except Exception:
                users_count = None

        info = {
            "settings.DATABASE_URL": settings.DATABASE_URL,
            "engine.url": url_str,
            "dialect": dialect,
            "current_database": current_db,
            "server_host": str(server_host) if server_host else None,
            "server_port": server_port,
            "users_count": users_count,
            "db_version": version,
        }
    return info



