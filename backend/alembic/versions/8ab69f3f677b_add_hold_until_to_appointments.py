"""add hold_until to appointments

Revision ID: 8ab69f3f677b
Revises: 8d8d2fcce963
Create Date: 2025-09-24 20:38:10.821372+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8ab69f3f677b'
down_revision: Union[str, Sequence[str], None] = '8d8d2fcce963'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
