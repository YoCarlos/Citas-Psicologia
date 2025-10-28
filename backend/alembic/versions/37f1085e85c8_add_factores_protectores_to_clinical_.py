"""add factores_protectores to clinical_histories2

Revision ID: 37f1085e85c8
Revises: 7a6efe691bde
Create Date: 2025-10-26 23:21:59.370419+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '37f1085e85c8'
down_revision: Union[str, Sequence[str], None] = '7a6efe691bde'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.add_column(
        "clinical_histories",
        sa.Column("factores_protectores", sa.Text(), nullable=True)
    )

def downgrade():
    op.drop_column("clinical_histories", "factores_protectores")

