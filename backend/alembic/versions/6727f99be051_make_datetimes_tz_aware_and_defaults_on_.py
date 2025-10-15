"""make datetimes tz-aware and defaults on server

Revision ID: 6727f99be051
Revises: 39297191cbc5
Create Date: 2025-10-14 17:01:52.349025+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6727f99be051'
down_revision: Union[str, Sequence[str], None] = '39297191cbc5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
