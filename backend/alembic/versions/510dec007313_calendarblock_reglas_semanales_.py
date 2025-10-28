"""CalendarBlock + reglas semanales + validaciones

Revision ID: 510dec007313
Revises: 37f1085e85c8
Create Date: 2025-10-28 02:42:42.620754+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '510dec007313'
down_revision: Union[str, Sequence[str], None] = '37f1085e85c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # === Crear tabla calendar_blocks ===
    op.create_table(
        'calendar_blocks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('doctor_id', sa.Integer(), nullable=False),
        sa.Column('start_at', sa.DateTime(), nullable=False),
        sa.Column('end_at', sa.DateTime(), nullable=False),
        sa.Column('all_day', sa.Boolean(), nullable=False),
        sa.Column('reason', sa.String(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['doctor_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_calendar_blocks_id'), 'calendar_blocks', ['id'], unique=False)
    op.create_index(op.f('ix_calendar_blocks_doctor_id'), 'calendar_blocks', ['doctor_id'], unique=False)

    # ⚠️ Constraint única ya existe → se omite para evitar errores
    # op.create_unique_constraint('uq_doctor_settings_doctor', 'doctor_settings', ['doctor_id'])

    # Ajuste de enum reminder_jobs.status
    op.alter_column(
        'reminder_jobs',
        'status',
        existing_type=postgresql.ENUM(
            'scheduled', 'executed', 'canceled', 'missed', 'error',
            name='reminder_status'
        ),
        server_default=None,
        existing_nullable=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Revertir cambio en reminder_jobs.status
    op.alter_column(
        'reminder_jobs',
        'status',
        existing_type=postgresql.ENUM(
            'scheduled', 'executed', 'canceled', 'missed', 'error',
            name='reminder_status'
        ),
        server_default=sa.text("'scheduled'::reminder_status"),
        existing_nullable=False
    )

    # No hace falta eliminar la constraint (ya existía previamente)
    # op.drop_constraint('uq_doctor_settings_doctor', 'doctor_settings', type_='unique')

    op.drop_index(op.f('ix_calendar_blocks_doctor_id'), table_name='calendar_blocks')
    op.drop_index(op.f('ix_calendar_blocks_id'), table_name='calendar_blocks')
    op.drop_table('calendar_blocks')
