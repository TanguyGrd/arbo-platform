"""add_withdrawn_marketplace_status

Revision ID: 8c3d2b5f7a91
Revises: 152c2219e0b0
Create Date: 2026-05-21 20:30:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "8c3d2b5f7a91"
down_revision: Union[str, None] = "152c2219e0b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'withdrawn'")
    op.execute("ALTER TYPE credit_status ADD VALUE IF NOT EXISTS 'withdrawn'")


def downgrade() -> None:
    # PostgreSQL enum values cannot be removed safely without rebuilding columns.
    pass
