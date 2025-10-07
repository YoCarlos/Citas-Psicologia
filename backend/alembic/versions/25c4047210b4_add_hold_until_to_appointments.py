"""add hold_until to appointments

Revision ID: 25c4047210b4
Revises: 8ab69f3f677b
Create Date: 2025-09-24 20:38:15.832307+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '25c4047210b4'
down_revision: Union[str, Sequence[str], None] = '8ab69f3f677b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
