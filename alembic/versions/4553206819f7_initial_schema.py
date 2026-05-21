"""initial_schema

Revision ID: 4553206819f7
Revises:
Create Date: 2026-05-19 15:01:12.139582

"""
from typing import Sequence, Union

from alembic import op
import geoalchemy2
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "4553206819f7"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


user_role = sa.Enum("farmer", "buyer", "admin", name="user_role", create_type=False)
kyc_status = sa.Enum("pending", "verified", "rejected", name="kyc_status", create_type=False)
project_status = sa.Enum(
    "draft",
    "validated",
    "listed_on_marketplace",
    "partially_sold",
    "sold_out",
    name="project_status",
    create_type=False,
)
credit_status = sa.Enum("available", "reserved", "sold", "retired", name="credit_status", create_type=False)
transaction_status = sa.Enum("pending", "completed", "refunded", name="transaction_status", create_type=False)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("role", user_role, nullable=False),
        sa.Column("kyc_status", kyc_status, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "farms",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("country_code", sa.String(length=2), nullable=True),
        sa.Column("region", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_farms_owner_id"), "farms", ["owner_id"], unique=False)

    op.create_table(
        "plots",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("farm_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column(
            "geometry",
            geoalchemy2.types.Geometry(
                geometry_type="POLYGON",
                srid=4326,
                spatial_index=True,
                from_text="ST_GeomFromEWKT",
                name="geometry",
            ),
            nullable=False,
        ),
        sa.Column("area_ha", sa.Numeric(precision=12, scale=4), nullable=True),
        sa.Column("soil_type", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["farm_id"], ["farms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_plots_farm_id"), "plots", ["farm_id"], unique=False)

    op.create_table(
        "tree_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("plot_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("species", sa.String(length=100), nullable=False),
        sa.Column(
            "geometry",
            geoalchemy2.types.Geometry(
                geometry_type="MULTILINESTRING",
                srid=4326,
                spatial_index=True,
                from_text="ST_GeomFromEWKT",
                name="geometry",
            ),
            nullable=False,
        ),
        sa.Column("inter_row_spacing_m", sa.Float(), nullable=False),
        sa.Column("intra_row_spacing_m", sa.Float(), nullable=False),
        sa.Column("orientation_deg", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["plot_id"], ["plots.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_tree_lines_plot_id"), "tree_lines", ["plot_id"], unique=False)

    op.create_table(
        "carbon_projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("farm_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("plot_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("methodology", sa.String(length=100), nullable=False),
        sa.Column("status", project_status, nullable=False),
        sa.Column("vintage_year", sa.Integer(), nullable=False),
        sa.Column("project_duration_years", sa.Integer(), nullable=False),
        sa.Column("estimated_tco2", sa.Numeric(precision=12, scale=4), nullable=False),
        sa.Column("price_per_credit_eur", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["farm_id"], ["farms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["plot_id"], ["plots.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_carbon_projects_farm_id"), "carbon_projects", ["farm_id"], unique=False)
    op.create_index(op.f("ix_carbon_projects_plot_id"), "carbon_projects", ["plot_id"], unique=False)

    op.create_table(
        "carbon_credits",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("serial_number", sa.String(length=64), nullable=False),
        sa.Column("vintage_year", sa.Integer(), nullable=False),
        sa.Column("status", credit_status, nullable=False),
        sa.Column("price_eur", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["project_id"], ["carbon_projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_carbon_credits_project_id"), "carbon_credits", ["project_id"], unique=False)
    op.create_index(op.f("ix_carbon_credits_serial_number"), "carbon_credits", ["serial_number"], unique=True)

    op.create_table(
        "transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("credit_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("seller_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("buyer_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("amount_eur", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("farmer_payout_eur", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("platform_fee_eur", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("status", transaction_status, nullable=False),
        sa.Column("payment_reference", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["buyer_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["credit_id"], ["carbon_credits.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["seller_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_transactions_credit_id"), "transactions", ["credit_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_transactions_credit_id"), table_name="transactions")
    op.drop_table("transactions")
    op.drop_index(op.f("ix_carbon_credits_serial_number"), table_name="carbon_credits")
    op.drop_index(op.f("ix_carbon_credits_project_id"), table_name="carbon_credits")
    op.drop_table("carbon_credits")
    op.drop_index(op.f("ix_carbon_projects_plot_id"), table_name="carbon_projects")
    op.drop_index(op.f("ix_carbon_projects_farm_id"), table_name="carbon_projects")
    op.drop_table("carbon_projects")
    op.drop_index(op.f("ix_tree_lines_plot_id"), table_name="tree_lines")
    op.drop_table("tree_lines")
    op.drop_index(op.f("ix_plots_farm_id"), table_name="plots")
    op.drop_table("plots")
    op.drop_index(op.f("ix_farms_owner_id"), table_name="farms")
    op.drop_table("farms")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")

    transaction_status.drop(op.get_bind(), checkfirst=True)
    credit_status.drop(op.get_bind(), checkfirst=True)
    project_status.drop(op.get_bind(), checkfirst=True)
    kyc_status.drop(op.get_bind(), checkfirst=True)
    user_role.drop(op.get_bind(), checkfirst=True)
