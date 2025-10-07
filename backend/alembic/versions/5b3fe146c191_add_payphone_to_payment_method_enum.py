"""add payphone to payment_method enum

Revision ID: 5b3fe146c191
Revises: b8ca5809d205
Create Date: 2025-09-24 21:39:26.096029+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5b3fe146c191'
down_revision: Union[str, Sequence[str], None] = 'b8ca5809d205'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
