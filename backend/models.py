"""
ARBO Platform - ORM models.

All geometries use SRID 4326 (WGS84) — the standard for GPS/web mapping.
Surface and density computations may project to a metric CRS at query
time when accuracy matters (handled in engine.py).

Schema overview
---------------
- User             : agriculteur, acheteur RSE, admin
- Farm             : entité légale, contient des parcelles
- Plot             : polygone géoréférencé (limites d'une parcelle)
- TreeLine         : rang d'arbres (MultiLineString) avec essence
- CarbonProject    : projet de séquestration LBC associé à une ferme
- CarbonCredit     : crédit unitaire (1 tCO2eq) issu d'un projet
- Transaction      : achat d'un crédit par un tiers RSE
"""

from __future__ import annotations

import uuid
from datetime import datetime
from geoalchemy2 import Geometry
from sqlalchemy import (
    Column,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from .database import Base


# ---------------------------------------------------------------------------
# Reusable column factory
# ---------------------------------------------------------------------------

def _uuid_pk() -> Column:
    """Standard UUID primary key column."""
    return Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id = _uuid_pk()
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    role = Column(
        SAEnum("farmer", "buyer", "admin", name="user_role"),
        nullable=False,
        default="farmer",
    )
    kyc_status = Column(
        SAEnum("pending", "verified", "rejected", name="kyc_status"),
        nullable=False,
        default="pending",
    )
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Relationships
    farms = relationship("Farm", back_populates="owner", cascade="all, delete-orphan")
    purchases = relationship(
        "Transaction",
        back_populates="buyer",
        foreign_keys="Transaction.buyer_id",
    )


# ---------------------------------------------------------------------------
# Farms & plots
# ---------------------------------------------------------------------------

class Farm(Base):
    __tablename__ = "farms"

    id = _uuid_pk()
    owner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    country_code = Column(String(2), nullable=True, default="FR")
    region = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    owner = relationship("User", back_populates="farms")
    plots = relationship("Plot", back_populates="farm", cascade="all, delete-orphan")
    carbon_projects = relationship(
        "CarbonProject", back_populates="farm", cascade="all, delete-orphan"
    )


class Plot(Base):
    """
    A geographic plot drawn on the map.

    The `geometry` column stores a Polygon in WGS84. Computed surface
    (in hectares) is cached on write — see engine.compute_area_hectares.
    """

    __tablename__ = "plots"

    id = _uuid_pk()
    farm_id = Column(
        UUID(as_uuid=True),
        ForeignKey("farms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=True)
    geometry = Column(
        Geometry(geometry_type="POLYGON", srid=4326, spatial_index=True),
        nullable=False,
    )
    area_ha = Column(Numeric(12, 4), nullable=True)
    soil_type = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    farm = relationship("Farm", back_populates="plots")
    tree_lines = relationship(
        "TreeLine", back_populates="plot", cascade="all, delete-orphan"
    )
    carbon_projects = relationship("CarbonProject", back_populates="plot")


class TreeLine(Base):
    """
    A row (or group of rows) of trees within a plot.

    Stored as MultiLineString so several parallel rows can be grouped
    under a single design entity sharing the same species and spacing.

    Attributes
    ----------
    species : str
        Common name (e.g. "chene", "noyer", "peuplier", "alisier").
        Used by engine.estimate_carbon_sequestration to pick growth params.
    inter_row_spacing_m : float
        Distance in meters between two adjacent rows of trees.
        Drives the shade diagnostic in engine.diagnose_shade.
    intra_row_spacing_m : float
        Distance in meters between two trees within the same row.
        Drives the density-per-hectare computation (PAC compliance).
    """

    __tablename__ = "tree_lines"

    id = _uuid_pk()
    plot_id = Column(
        UUID(as_uuid=True),
        ForeignKey("plots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    species = Column(String(100), nullable=False, default="chene")
    geometry = Column(
        Geometry(geometry_type="MULTILINESTRING", srid=4326, spatial_index=True),
        nullable=False,
    )
    inter_row_spacing_m = Column(Float, nullable=False, default=10.0)
    intra_row_spacing_m = Column(Float, nullable=False, default=8.0)
    orientation_deg = Column(
        Float, nullable=True,
        doc="Azimuth in degrees from North (0=N, 90=E). Computed from geometry.",
    )
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    plot = relationship("Plot", back_populates="tree_lines")


# ---------------------------------------------------------------------------
# Carbon projects, credits, transactions
# ---------------------------------------------------------------------------

class CarbonProject(Base):
    """
    A carbon sequestration project tied to a farm, following the
    Label Bas-Carbone (LBC) framework.

    Lifecycle
    ---------
    draft -> validated -> listed_on_marketplace -> partially_sold -> sold_out -> withdrawn

    The estimated tCO2 is calculated from the plot's tree lines via
    engine.estimate_carbon_sequestration. Each unit becomes a
    CarbonCredit row once the project is listed.
    """

    __tablename__ = "carbon_projects"

    id = _uuid_pk()
    farm_id = Column(
        UUID(as_uuid=True),
        ForeignKey("farms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plot_id = Column(
        UUID(as_uuid=True),
        ForeignKey("plots.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name = Column(String(255), nullable=False)
    methodology = Column(
        String(100), nullable=False, default="LBC_HAIES_V2",
        doc="Reference to the LBC method applied (haies, boisement, etc.).",
    )
    status = Column(
        SAEnum(
            "draft",
            "validated",
            "listed_on_marketplace",
            "partially_sold",
            "sold_out",
            "withdrawn",
            name="project_status",
        ),
        nullable=False,
        default="draft",
    )
    vintage_year = Column(Integer, nullable=False, default=lambda: datetime.utcnow().year)
    project_duration_years = Column(Integer, nullable=False, default=20)
    estimated_tco2 = Column(Numeric(12, 4), nullable=False, default=0)
    price_per_credit_eur = Column(Numeric(10, 2), nullable=False, default=35.0)
    metadata_json = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    farm = relationship("Farm", back_populates="carbon_projects")
    plot = relationship("Plot", back_populates="carbon_projects")
    credits = relationship(
        "CarbonCredit", back_populates="project", cascade="all, delete-orphan"
    )


class CarbonCredit(Base):
    """
    A single carbon credit unit (1 tCO2eq).

    Each credit carries a unique serial_number for traceability — a hard
    LBC requirement. Status transitions:
        available -> reserved -> sold -> retired
    Once `retired`, the credit cannot be transacted again (anti
    double-counting safeguard).
    """

    __tablename__ = "carbon_credits"

    id = _uuid_pk()
    project_id = Column(
        UUID(as_uuid=True),
        ForeignKey("carbon_projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    serial_number = Column(String(64), unique=True, nullable=False, index=True)
    vintage_year = Column(Integer, nullable=False)
    status = Column(
        SAEnum("available", "reserved", "sold", "retired", "withdrawn", name="credit_status"),
        nullable=False,
        default="available",
    )
    price_eur = Column(Numeric(10, 2), nullable=False)
    owner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    project = relationship("CarbonProject", back_populates="credits")
    transaction = relationship(
        "Transaction", back_populates="credit", uselist=False
    )


class Transaction(Base):
    """
    A financial transaction recording the purchase of one carbon credit.

    Splits the gross amount into:
      - farmer_payout_eur (85%)
      - platform_fee_eur  (15%)
    Computed server-side in routes.purchase_credit.
    """

    __tablename__ = "transactions"

    id = _uuid_pk()
    credit_id = Column(
        UUID(as_uuid=True),
        ForeignKey("carbon_credits.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
        index=True,
    )
    seller_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    buyer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    amount_eur = Column(Numeric(12, 2), nullable=False)
    farmer_payout_eur = Column(Numeric(12, 2), nullable=False)
    platform_fee_eur = Column(Numeric(12, 2), nullable=False)
    status = Column(
        SAEnum("pending", "completed", "refunded", name="transaction_status"),
        nullable=False,
        default="completed",
    )
    payment_reference = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    credit = relationship("CarbonCredit", back_populates="transaction")
    buyer = relationship(
        "User", back_populates="purchases", foreign_keys=[buyer_id]
    )


class SolarSimulation(Base):
    """
    Cached result of a solar shade simulation for a plot.
    Recomputed only when tree lines change or params differ.
    """
    __tablename__ = "solar_simulations"

    id = _uuid_pk()
    plot_id = Column(
        UUID(as_uuid=True),
        ForeignKey("plots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    params_hash = Column(String(64), nullable=False, index=True,
        doc="SHA-256 of (plot_id + tree_positions + sample_days). Cache key.")
    shade_ratio_annual = Column(Float, nullable=False)
    shade_ratio_by_month = Column(JSONB, nullable=False)
    peak_shade_hour_utc = Column(String(5), nullable=True)
    total_shadow_area_m2 = Column(Float, nullable=True)
    plot_area_m2 = Column(Float, nullable=True)
    heatmap_geojson = Column(JSONB, nullable=True)
    sample_days = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
