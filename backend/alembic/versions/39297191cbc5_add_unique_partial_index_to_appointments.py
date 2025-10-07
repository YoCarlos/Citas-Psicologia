"""add unique partial index to appointments

Revision ID: 39297191cbc5
Revises: 5b3fe146c191
Create Date: 2025-09-24 22:30:52.117845+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '39297191cbc5'
down_revision: Union[str, Sequence[str], None] = '5b3fe146c191'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
