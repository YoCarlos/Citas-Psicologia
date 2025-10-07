from __future__ import annotations
import sys, os
from logging.config import fileConfig

from sqlalchemy import create_engine, pool
from alembic import context

# --------------------------------------------------------
# Configuración de logging (usa alembic.ini)
# --------------------------------------------------------
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# --------------------------------------------------------
# Asegurar que backend esté en sys.path
# --------------------------------------------------------
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.append(BASE_DIR)

# --------------------------------------------------------
# Importar metadata desde app.models
# --------------------------------------------------------
from app.config import settings
from app import models

target_metadata = models.Base.metadata

# --------------------------------------------------------
# URL de la base (desde config.py / .env)
# --------------------------------------------------------
def get_url() -> str:
    return settings.DATABASE_URL

# --------------------------------------------------------
# Migraciones OFFLINE (genera solo SQL)
# --------------------------------------------------------
def run_migrations_offline() -> None:
    context.configure(
        url=get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,           # detecta cambios en tipos
        compare_server_default=True, # detecta cambios en defaults
    )
    with context.begin_transaction():
        context.run_migrations()

# --------------------------------------------------------
# Migraciones ONLINE (conexión activa a la DB)
# --------------------------------------------------------
def run_migrations_online() -> None:
    connectable = create_engine(
        get_url(),
        poolclass=pool.NullPool,
        future=True,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()

# --------------------------------------------------------
# Punto de entrada
# --------------------------------------------------------
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

