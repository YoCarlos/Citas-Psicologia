"""add payphone to enums and hold_until to appointments

Revision ID: 7bb3ed1b1036
Revises: 25c4047210b4
Create Date: 2025-09-24 21:30:24.544314+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7bb3ed1b1036'
down_revision: Union[str, Sequence[str], None] = '25c4047210b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
