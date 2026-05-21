"""
ARBO Platform - Pydantic schemas.

Validation layer between HTTP I/O and the ORM. Geometries are exchanged
in GeoJSON form (industry standard, directly consumable by Leaflet and
Mapbox).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ---------------------------------------------------------------------------
# Shared base config
# ---------------------------------------------------------------------------

class ORMBase(BaseModel):
    """Pydantic v2 base: allows construction directly from ORM objects."""
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# GeoJSON helpers
# ---------------------------------------------------------------------------

class GeoJSONPolygon(BaseModel):
    """
    Minimal GeoJSON Polygon validator.

    Coordinates must follow GeoJSON convention: array of linear rings,
    each ring being an array of [lng, lat] pairs, first ring is the
    outer boundary, and the first/last point of each ring must match.
    """
    type: Literal["Polygon"]
    coordinates: List[List[List[float]]]

    @field_validator("coordinates")
    @classmethod
    def _validate_ring_closure(cls, v: List[List[List[float]]]) -> List[List[List[float]]]:
        if not v or not v[0]:
            raise ValueError("Polygon must have at least one ring with points.")
        for ring in v:
            if len(ring) < 4:
                raise ValueError("A linear ring must contain at least 4 positions.")
            if ring[0] != ring[-1]:
                raise ValueError("Linear ring must be closed (first == last point).")
        return v


class GeoJSONMultiLineString(BaseModel):
    type: Literal["MultiLineString"]
    coordinates: List[List[List[float]]]

    @field_validator("coordinates")
    @classmethod
    def _validate_lines(cls, v: List[List[List[float]]]) -> List[List[List[float]]]:
        if not v:
            raise ValueError("MultiLineString must contain at least one line.")
        for line in v:
            if len(line) < 2:
                raise ValueError("Each line must have at least 2 positions.")
        return v


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None
    role: Literal["farmer", "buyer", "admin"] = "farmer"


class UserOut(ORMBase):
    id: UUID
    email: str
    full_name: Optional[str]
    role: str
    kyc_status: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Farms
# ---------------------------------------------------------------------------

class FarmCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    country_code: str = "FR"
    region: Optional[str] = None


class FarmOut(ORMBase):
    id: UUID
    owner_id: UUID
    name: str
    country_code: Optional[str]
    region: Optional[str]
    created_at: datetime


# ---------------------------------------------------------------------------
# Plots
# ---------------------------------------------------------------------------

class PlotCreate(BaseModel):
    farm_id: UUID
    name: Optional[str] = None
    geometry: GeoJSONPolygon
    soil_type: Optional[str] = None


class PlotOut(ORMBase):
    id: UUID
    farm_id: UUID
    name: Optional[str]
    geometry: Dict[str, Any]
    area_ha: Optional[Decimal]
    soil_type: Optional[str]
    created_at: datetime


# ---------------------------------------------------------------------------
# Tree lines
# ---------------------------------------------------------------------------

class TreeLineCreate(BaseModel):
    plot_id: UUID
    species: str = Field(default="chene", max_length=100)
    geometry: GeoJSONMultiLineString
    inter_row_spacing_m: float = Field(default=10.0, gt=0)
    intra_row_spacing_m: float = Field(default=8.0, gt=0)


class TreeLineOut(ORMBase):
    id: UUID
    plot_id: UUID
    species: str
    geometry: Dict[str, Any]
    inter_row_spacing_m: float
    intra_row_spacing_m: float
    orientation_deg: Optional[float]
    created_at: datetime


# ---------------------------------------------------------------------------
# Diagnostics (computed, never persisted directly)
# ---------------------------------------------------------------------------

class ShadeDiagnostic(BaseModel):
    """Result of the theoretical shade analysis for a tree line."""
    orientation_deg: float
    orientation_score: float = Field(..., description="0..1, 1 = perfect N-S alignment.")
    inter_row_spacing_m: float
    spacing_status: Literal["critical", "suboptimal", "good"]
    risk_level: Literal["low", "medium", "high"]
    message: str


class PACComplianceDiagnostic(BaseModel):
    """Result of the PAC density check on a plot."""
    total_trees: int
    area_ha: float
    density_per_ha: float
    pac_limit: int = 200
    compliant: bool
    message: str


class CarbonEstimate(BaseModel):
    """Projected total tCO2 sequestered over the project duration."""
    species: str
    tree_count: int
    duration_years: int
    annual_curve_tco2: List[float] = Field(
        ..., description="Cumulative tCO2 sequestered at end of each year."
    )
    total_tco2: float


class PlotDiagnostic(BaseModel):
    """Full diagnostic bundle for a plot — feeds the frontend dashboard."""
    plot_id: UUID
    area_ha: float
    pac: PACComplianceDiagnostic
    shade: List[ShadeDiagnostic]
    carbon: CarbonEstimate
    estimated_revenue_eur: float
    platform_fee_eur: float
    farmer_payout_eur: float


# ---------------------------------------------------------------------------
# Carbon projects, credits, transactions
# ---------------------------------------------------------------------------

class CarbonProjectCreate(BaseModel):
    farm_id: UUID
    plot_id: UUID
    name: str
    price_per_credit_eur: float = Field(default=35.0, gt=0)
    project_duration_years: int = Field(default=20, ge=5, le=100)


class CarbonProjectOut(ORMBase):
    id: UUID
    farm_id: UUID
    plot_id: Optional[UUID]
    name: str
    methodology: str
    status: str
    vintage_year: int
    project_duration_years: int
    estimated_tco2: Decimal
    price_per_credit_eur: Decimal
    created_at: datetime


class ProjectPriceUpdate(BaseModel):
    price_per_credit_eur: float = Field(..., gt=0)


class CarbonCreditOut(ORMBase):
    id: UUID
    project_id: UUID
    serial_number: str
    vintage_year: int
    status: str
    price_eur: Decimal
    owner_id: Optional[UUID]
    created_at: datetime


class MarketplaceCreditOut(CarbonCreditOut):
    project_name: str
    farm_name: str
    farm_region: Optional[str]
    plot_name: Optional[str]
    plot_geometry: Optional[Dict[str, Any]]
    centroid_lat: Optional[float]
    centroid_lng: Optional[float]
    species: Optional[str]
    project_duration_years: int


class FarmerProjectOut(BaseModel):
    id: UUID
    name: str
    farm_name: str
    farm_region: Optional[str]
    plot_id: Optional[UUID]
    plot_name: Optional[str]
    plot_geometry: Optional[Dict[str, Any]]
    status: str
    total_credits: int
    sold_credits: int
    available_credits: int
    withdrawn_credits: int
    price_per_credit_eur: Decimal
    revenue_generated_eur: Decimal
    certified_at: datetime
    species: Optional[str]
    project_duration_years: int
    estimated_tco2: Decimal


class FarmerTransactionOut(BaseModel):
    date: datetime
    credit_serial: str
    buyer_email: Optional[str]
    amount_eur: Decimal
    farmer_payout_eur: Decimal


class MonthlySalesOut(BaseModel):
    month: str
    sales: int
    gross_eur: Decimal
    payout_eur: Decimal


class FarmerDashboardOut(BaseModel):
    total_revenue_eur: Decimal
    credits_sold: int
    credits_available: int
    total_tco2: Decimal
    recent_transactions: List[FarmerTransactionOut]
    monthly_sales: List[MonthlySalesOut]


class BuyerOwnedCreditOut(BaseModel):
    credit_id: UUID
    serial_number: str
    farm_name: str
    species: Optional[str]
    project_duration_years: int
    purchased_at: datetime
    price_paid_eur: Decimal


class BuyerDashboardOut(BaseModel):
    total_tco2_compensated: Decimal
    credits_owned: int
    total_spent_eur: Decimal
    credits: List[BuyerOwnedCreditOut]


class CreditPurchaseRequest(BaseModel):
    buyer_id: UUID
    credit_id: UUID


class TransactionOut(ORMBase):
    id: UUID
    credit_id: UUID
    seller_id: Optional[UUID]
    buyer_id: Optional[UUID]
    amount_eur: Decimal
    farmer_payout_eur: Decimal
    platform_fee_eur: Decimal
    status: str
    payment_reference: Optional[str]
    created_at: datetime


class SolarSimulationRequest(BaseModel):
    sample_days: list[str] = ["2024-03-21", "2024-06-21", "2024-09-21", "2024-12-21"]
    tree_height_m: float = Field(default=8.0, gt=0, le=50)
    canopy_radius_m: float = Field(default=3.0, gt=0, le=20)
    resolution_m: float = Field(default=5.0, gt=1, le=50)


class SolarSimulationOut(ORMBase):
    id: UUID
    plot_id: UUID
    params_hash: str
    shade_ratio_annual: float
    shade_ratio_by_month: list[float]
    peak_shade_hour_utc: Optional[str]
    total_shadow_area_m2: Optional[float]
    plot_area_m2: Optional[float]
    heatmap_geojson: Optional[dict]
    sample_days: Optional[list[str]]
    created_at: datetime


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: "UserOut"


TokenResponse.model_rebuild()
