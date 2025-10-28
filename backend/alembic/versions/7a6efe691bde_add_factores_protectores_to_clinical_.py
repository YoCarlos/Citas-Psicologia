"""add factores_protectores to clinical_histories

Revision ID: 7a6efe691bde
Revises: 4edf7aaf86a0
Create Date: 2025-10-26 23:16:01.721936+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a6efe691bde'
down_revision: Union[str, Sequence[str], None] = '4edf7aaf86a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
