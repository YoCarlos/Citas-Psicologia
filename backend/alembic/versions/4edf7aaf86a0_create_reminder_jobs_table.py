"""create reminder_jobs table

Revision ID: 4edf7aaf86a0
Revises: 6727f99be051
Create Date: 2025-10-15 15:11:33.800323+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '4edf7aaf86a0'
down_revision: Union[str, Sequence[str], None] = '6727f99be051'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # ---------- A) ENUM reminder_status (idempotente) ----------
    op.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reminder_status') THEN
            CREATE TYPE reminder_status AS ENUM ('scheduled','executed','canceled','missed','error');
        END IF;
    END$$;
    """)

    reminder_status = postgresql.ENUM(
        'scheduled', 'executed', 'canceled', 'missed', 'error',
        name='reminder_status',
        create_type=False  # ← importante: ya lo creamos arriba si no existía
    )

    # ---------- B) Tabla reminder_jobs ----------
    op.create_table(
        'reminder_jobs',
        sa.Column('id', sa.String(length=64), nullable=False),
        sa.Column('appointment_id', sa.Integer(), nullable=False),
        sa.Column('run_at_utc', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', reminder_status, nullable=False, server_default='scheduled'),
        sa.Column('executed_at_utc', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['appointment_id'], ['appointments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_reminder_jobs_appointment_id', 'reminder_jobs', ['appointment_id'], unique=False)

    # ---------- C) Operaciones ya autogeneradas (con defensivos) ----------

    # El índice parcial/único puede existir o no; usamos IF EXISTS
    op.execute('DROP INDEX IF EXISTS "uq_appt_doc_start_end_blocking";')

    op.alter_column('availability', 'start_at',
               existing_type=postgresql.TIMESTAMP(),
               type_=sa.DateTime(timezone=True),
               existing_nullable=False)
    op.alter_column('availability', 'end_at',
               existing_type=postgresql.TIMESTAMP(),
               type_=sa.DateTime(timezone=True),
               existing_nullable=False)
    op.alter_column('availability', 'created_at',
               existing_type=postgresql.TIMESTAMP(),
               server_default=sa.text('now()'),
               type_=sa.DateTime(timezone=True),
               existing_nullable=False)

    op.alter_column('availability_rules', 'created_at',
               existing_type=postgresql.TIMESTAMP(),
               server_default=sa.text('now()'),
               type_=sa.DateTime(timezone=True),
               existing_nullable=False)
    op.alter_column('availability_rules', 'updated_at',
               existing_type=postgresql.TIMESTAMP(),
               server_default=sa.text('now()'),
               type_=sa.DateTime(timezone=True),
               existing_nullable=False)

    op.alter_column('doctor_settings', 'created_at',
               existing_type=postgresql.TIMESTAMP(),
               server_default=sa.text('now()'),
               type_=sa.DateTime(timezone=True),
               existing_nullable=False)
    op.alter_column('doctor_settings', 'updated_at',
               existing_type=postgresql.TIMESTAMP(),
               server_default=sa.text('now()'),
               type_=sa.DateTime(timezone=True),
               existing_nullable=False)

    # La UNIQUE ya existe en tu BD; créala solo si NO existe
    op.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'uq_doctor_settings_doctor'
        ) THEN
            ALTER TABLE doctor_settings
            ADD CONSTRAINT uq_doctor_settings_doctor UNIQUE (doctor_id);
        END IF;
    END$$;
    """)

    op.add_column('payments', sa.Column('payphone_id', sa.String(length=120), nullable=True))
    op.alter_column('payments', 'created_at',
               existing_type=postgresql.TIMESTAMP(),
               server_default=sa.text('now()'),
               type_=sa.DateTime(timezone=True),
               existing_nullable=False)
    op.alter_column('payments', 'confirmed_at',
               existing_type=postgresql.TIMESTAMP(),
               type_=sa.DateTime(timezone=True),
               existing_nullable=True)
    op.drop_column('payments', 'stripe_id')
    op.drop_column('payments', 'transfer_received')

    op.alter_column('therapeutic_plans', 'patient_id',
               existing_type=sa.INTEGER(),
               nullable=False)
    op.alter_column('therapeutic_plans', 'created_at',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               nullable=False,
               existing_server_default=sa.text('now()'))
    op.alter_column('therapeutic_plans', 'updated_at',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               nullable=False,
               existing_server_default=sa.text('now()'))

    op.alter_column('users', 'created_at',
               existing_type=postgresql.TIMESTAMP(),
               server_default=sa.text('now()'),
               type_=sa.DateTime(timezone=True),
               existing_nullable=False)


def downgrade() -> None:
    """Downgrade schema."""

    # Revertir cambios en 'users'
    op.alter_column('users', 'created_at',
               existing_type=sa.DateTime(timezone=True),
               server_default=None,
               type_=postgresql.TIMESTAMP(),
               existing_nullable=False)

    # Revertir 'therapeutic_plans'
    op.alter_column('therapeutic_plans', 'updated_at',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               nullable=True,
               existing_server_default=sa.text('now()'))
    op.alter_column('therapeutic_plans', 'created_at',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               nullable=True,
               existing_server_default=sa.text('now()'))
    op.alter_column('therapeutic_plans', 'patient_id',
               existing_type=sa.INTEGER(),
               nullable=True)

    # Revertir 'payments'
    op.add_column('payments', sa.Column('transfer_received', sa.BOOLEAN(), autoincrement=False, nullable=True))
    op.add_column('payments', sa.Column('stripe_id', sa.VARCHAR(length=120), autoincrement=False, nullable=True))
    op.alter_column('payments', 'confirmed_at',
               existing_type=sa.DateTime(timezone=True),
               type_=postgresql.TIMESTAMP(),
               existing_nullable=True)
    op.alter_column('payments', 'created_at',
               existing_type=sa.DateTime(timezone=True),
               server_default=None,
               type_=postgresql.TIMESTAMP(),
               existing_nullable=False)
    op.drop_column('payments', 'payphone_id')

    # Dropear UNIQUE solo si existe (simetría)
    op.execute("""
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'uq_doctor_settings_doctor'
        ) THEN
            ALTER TABLE doctor_settings
            DROP CONSTRAINT uq_doctor_settings_doctor;
        END IF;
    END$$;
    """)

    # Revertir timestamps en 'doctor_settings' y 'availability_rules'
    op.alter_column('doctor_settings', 'updated_at',
               existing_type=sa.DateTime(timezone=True),
               server_default=None,
               type_=postgresql.TIMESTAMP(),
               existing_nullable=False)
    op.alter_column('doctor_settings', 'created_at',
               existing_type=sa.DateTime(timezone=True),
               server_default=None,
               type_=postgresql.TIMESTAMP(),
               existing_nullable=False)

    op.alter_column('availability_rules', 'updated_at',
               existing_type=sa.DateTime(timezone=True),
               server_default=None,
               type_=postgresql.TIMESTAMP(),
               existing_nullable=False)
    op.alter_column('availability_rules', 'created_at',
               existing_type=sa.DateTime(timezone=True),
               server_default=None,
               type_=postgresql.TIMESTAMP(),
               existing_nullable=False)

    # Revertir 'availability'
    op.alter_column('availability', 'created_at',
               existing_type=sa.DateTime(timezone=True),
               server_default=None,
               type_=postgresql.TIMESTAMP(),
               existing_nullable=False)
    op.alter_column('availability', 'end_at',
               existing_type=sa.DateTime(timezone=True),
               type_=postgresql.TIMESTAMP(),
               existing_nullable=False)
    op.alter_column('availability', 'start_at',
               existing_type=sa.DateTime(timezone=True),
               type_=postgresql.TIMESTAMP(),
               existing_nullable=False)

    # Volver a crear el índice parcial/único si lo necesitas (como estaba en tu autogenerado)
    op.create_index(
        'uq_appt_doc_start_end_blocking',
        'appointments',
        ['doctor_id', 'start_at', 'end_at'],
        unique=True,
        postgresql_where=sa.text("(status = ANY (ARRAY['pending'::appointment_status, 'confirmed'::appointment_status]))")
    )

    # Índice y tabla reminder_jobs
    op.drop_index('ix_reminder_jobs_appointment_id', table_name='reminder_jobs')
    op.drop_table('reminder_jobs')

    # Si quieres limpiar el ENUM (opcional; si nadie más lo usa)
    op.execute("DROP TYPE IF EXISTS reminder_status;")
