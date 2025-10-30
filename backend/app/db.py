# app/db.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import settings

# 💡 Asegúrate que en Render tu DATABASE_URL ya venga con sslmode=require
# si no, puedes forzarlo aquí:
DATABASE_URL = settings.DATABASE_URL
if "sslmode=" not in DATABASE_URL:
    # ojo: si ya trae parámetros, usa '&'
    sep = "&" if "?" in DATABASE_URL else "?"
    DATABASE_URL = f"{DATABASE_URL}{sep}sslmode=require"

# 👇 aquí está el truco importante
engine = create_engine(
    DATABASE_URL,
    future=True,
    echo=False,
    pool_pre_ping=True,   # 👈 verifica la conexión antes de usarla
    pool_recycle=280,     # 👈 recicla conexiones viejas (4-5 minutos)
    pool_size=5,          # opcional
    max_overflow=10,      # opcional
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    future=True,
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
