"""replace email/password/Google auth with phone + SMS code auth

The app has not launched — every existing account is a test account, and
there is no migration path from an email/password identity to a phone one
(nothing ties the two together). So this deletes all user rows and
everything that points at them, then reshapes `users` around `phone`.

SQLite does not enforce `ON DELETE CASCADE` unless a connection opts in with
`PRAGMA foreign_keys = ON`, which nothing in this codebase does, so each
child table is deleted explicitly rather than relying on the FK constraint
declared in the schema.

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-25 00:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Deepest children first: nothing here is enforced by the database, so
    # order is what keeps this from leaving orphaned rows behind.
    op.execute("DELETE FROM tool_calls")
    op.execute("DELETE FROM messages")
    op.execute("DELETE FROM diagnostic_sessions")
    op.execute("DELETE FROM vehicles")
    op.execute("DELETE FROM refresh_tokens")
    op.execute("DELETE FROM users")

    op.drop_index("ix_password_reset_codes_code_hash", table_name="password_reset_codes")
    op.drop_index("ix_password_reset_codes_user_id", table_name="password_reset_codes")
    op.drop_table("password_reset_codes")

    # `users` is empty at this point (deleted above), so the new NOT NULL
    # columns need no server default — there is no existing row for SQLite's
    # table-recreate-and-copy to violate the constraint against.
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index("ix_users_email")
        batch_op.drop_index("ix_users_google_sub")
        batch_op.drop_column("email")
        batch_op.drop_column("password_hash")
        batch_op.drop_column("google_sub")
        batch_op.drop_column("display_name")
        batch_op.add_column(sa.Column("phone", sa.String(length=20), nullable=False))
        batch_op.add_column(sa.Column("first_name", sa.String(length=80), nullable=False))
        batch_op.add_column(sa.Column("last_name", sa.String(length=80), nullable=False))
        batch_op.create_index("ix_users_phone", ["phone"], unique=True)

    op.create_table(
        "phone_verification_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("phone", sa.String(length=20), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("first_name", sa.String(length=80), nullable=True),
        sa.Column("last_name", sa.String(length=80), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_phone_verification_codes_phone", "phone_verification_codes", ["phone"])
    op.create_index(
        "ix_phone_verification_codes_code_hash", "phone_verification_codes", ["code_hash"]
    )


def downgrade() -> None:
    op.drop_index("ix_phone_verification_codes_code_hash", table_name="phone_verification_codes")
    op.drop_index("ix_phone_verification_codes_phone", table_name="phone_verification_codes")
    op.drop_table("phone_verification_codes")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index("ix_users_phone")
        batch_op.drop_column("phone")
        batch_op.drop_column("first_name")
        batch_op.drop_column("last_name")
        # server_default="" covers any row created under phone auth — a
        # downgrade has no email to put there, and NOT NULL demands something.
        batch_op.add_column(
            sa.Column("email", sa.String(length=320), nullable=False, server_default="")
        )
        batch_op.add_column(sa.Column("password_hash", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("google_sub", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("display_name", sa.String(length=80), nullable=True))
        batch_op.create_index("ix_users_email", ["email"], unique=True)
        batch_op.create_index("ix_users_google_sub", ["google_sub"], unique=True)

    op.create_table(
        "password_reset_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_password_reset_codes_user_id", "password_reset_codes", ["user_id"])
    op.create_index("ix_password_reset_codes_code_hash", "password_reset_codes", ["code_hash"])
