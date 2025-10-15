# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .scheduler import start_scheduler, shutdown_scheduler, rebuild_jobs_on_startup
from .db import SessionLocal
from .config import settings as app_settings  

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
    settings as settings_router, 
    debug_email,
    debug_scheduler,
    jobs,  
)

app = FastAPI(
    title="CitasPsico API",
    version="0.3.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# =========================
# Eventos de ciclo de vida
# =========================
@app.on_event("startup")
async def _startup():
    # Inicia y reconstruye el scheduler con los jobs pendientes
    start_scheduler()
    rebuild_jobs_on_startup()

@app.on_event("shutdown")
async def _shutdown():
    shutdown_scheduler()

# =========================
# CORS
# =========================
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

# =========================
# Routers
# =========================
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(patients.router)
app.include_router(clinical_histories.router)
app.include_router(therapeutic_plans.router)
app.include_router(appointments.router)
app.include_router(payments.router)
app.include_router(availability.router)
app.include_router(zoom_test.router)
app.include_router(settings_router.router)  # ✅ router settings renombrado
app.include_router(debug_email.router)
app.include_router(debug_scheduler.router)
app.include_router(jobs.router)  # ✅ añadido aquí

# =========================
# Healthchecks y debug
# =========================
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
    """
    Verifica configuración base cargada desde .env (Zoom, JWT, TZ).
    """
    return {
        "jwt_alg": getattr(app_settings, "JWT_ALG", None),
        "tz": getattr(app_settings, "TZ", "America/Guayaquil"),
        "zoom_api_base": getattr(app_settings, "ZOOM_API_BASE", None),
    }

@app.get("/debug/dbinfo")
def debug_dbinfo():
    """
    Muestra información de conexión a la base de datos y conteo de usuarios.
    """
    info = {}
    with SessionLocal() as db:
        bind = db.get_bind()
        dialect = bind.dialect.name
        url_str = str(bind.url)

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
            version = db.execute(text("SELECT 1")).scalar()
            try:
                users_count = db.execute(text("SELECT COUNT(*) FROM users")).scalar()
            except Exception:
                users_count = None

        info = {
            "settings.DATABASE_URL": app_settings.DATABASE_URL,
            "engine.url": url_str,
            "dialect": dialect,
            "current_database": current_db,
            "server_host": str(server_host) if server_host else None,
            "server_port": server_port,
            "users_count": users_count,
            "db_version": version,
        }
    return info
