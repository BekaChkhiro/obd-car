"""add context_summary to diagnostic_sessions

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-19 00:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("diagnostic_sessions") as batch_op:
        batch_op.add_column(sa.Column("context_summary", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("diagnostic_sessions") as batch_op:
        batch_op.drop_column("context_summary")
