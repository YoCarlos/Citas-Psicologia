"""appointments: add hold_until; enums add pending/payphone

Revision ID: 8d8d2fcce963
Revises: a1dd293b1378
Create Date: 2025-09-24 20:31:43.546492+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8d8d2fcce963'
down_revision: Union[str, Sequence[str], None] = 'a1dd293b1378'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
