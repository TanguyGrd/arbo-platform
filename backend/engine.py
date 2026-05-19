"""
ARBO Platform - Computation engine.

This module contains the core scientific functions of the platform:

1. Geospatial measurements (area in hectares, line length in meters,
   line orientation relative to North) — all metrically accurate by
   re-projecting WGS84 inputs to a local equal-area CRS.
2. Shade diagnostics based on row orientation and inter-row spacing.
3. PAC compliance check (tree density per hectare).
4. Carbon sequestration estimation using a sigmoid growth curve
   parameterized per species.

These are MVP-grade simplifications. A production deployment for
real LBC certification must replace `estimate_carbon_sequestration`
with the official ministerial calculators (Excel workbooks per method).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Tuple

from pyproj import Geod, Transformer
from shapely.geometry import MultiLineString, Polygon, shape
from shapely.ops import transform as shapely_transform


# ---------------------------------------------------------------------------
# Geodesic primitives
# ---------------------------------------------------------------------------

# WGS84 ellipsoid — used for geodesic measurements
_GEOD = Geod(ellps="WGS84")


def _wgs84_to_local_metric(geom):
    """
    Reproject a shapely WGS84 geometry to an azimuthal equidistant CRS
    centered on its own centroid. Result is in meters and suitable for
    accurate small-scale area and length measurements.

    Why not use ST_Area(geography)?
        We want the engine to be database-independent: tests, batch
        scripts, and CLI utilities can call these helpers without a
        live PostGIS connection.
    """
    centroid = geom.centroid
    proj_str = (
        f"+proj=aeqd +lat_0={centroid.y} +lon_0={centroid.x} "
        f"+x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"
    )
    transformer = Transformer.from_crs("EPSG:4326", proj_str, always_xy=True)
    return shapely_transform(transformer.transform, geom)


def compute_area_hectares(geojson_polygon: dict) -> float:
    """
    Compute the area of a GeoJSON Polygon in hectares.

    Uses an azimuthal equidistant projection centered on the polygon's
    centroid — accurate to ~1% for parcels up to a few square km, which
    covers any realistic agricultural plot.
    """
    polygon: Polygon = shape(geojson_polygon)
    if not polygon.is_valid:
        raise ValueError("Polygon geometry is invalid (self-intersecting or empty).")

    projected = _wgs84_to_local_metric(polygon)
    area_m2 = projected.area
    return area_m2 / 10_000.0  # 1 ha = 10,000 m²


def compute_line_length_m(geojson_multilinestring: dict) -> float:
    """
    Total length of a MultiLineString in meters, summing geodesic
    lengths over each segment.
    """
    mls: MultiLineString = shape(geojson_multilinestring)
    total = 0.0
    for line in mls.geoms:
        coords = list(line.coords)
        for (lon1, lat1), (lon2, lat2) in zip(coords[:-1], coords[1:]):
            _, _, dist_m = _GEOD.inv(lon1, lat1, lon2, lat2)
            total += dist_m
    return total


def compute_line_orientation_deg(geojson_multilinestring: dict) -> float:
    """
    Average compass azimuth of a MultiLineString, in degrees from North
    [0, 180). 0 = perfect N-S, 90 = perfect E-W. Length-weighted so
    long segments dominate short ones.
    """
    mls: MultiLineString = shape(geojson_multilinestring)
    weighted_sum = 0.0
    total_weight = 0.0

    for line in mls.geoms:
        coords = list(line.coords)
        for (lon1, lat1), (lon2, lat2) in zip(coords[:-1], coords[1:]):
            azimuth, _, dist_m = _GEOD.inv(lon1, lat1, lon2, lat2)
            # Normalize to [0, 180): an axis, not a vector
            azimuth = azimuth % 180.0
            weighted_sum += azimuth * dist_m
            total_weight += dist_m

    if total_weight == 0.0:
        raise ValueError("Cannot compute orientation of a zero-length geometry.")

    return weighted_sum / total_weight


# ---------------------------------------------------------------------------
# Shade diagnostic
# ---------------------------------------------------------------------------

# Critical shade thresholds — agronomic rules of thumb for the temperate zone.
# Source: INRAE / Agroof guidelines for intra-plot agroforestry.
_SHADE_SPACING_CRITICAL_M = 6.0   # Below this, severe yield loss in understory.
_SHADE_SPACING_SUBOPTIMAL_M = 12.0  # Below this, noticeable shade competition.


def diagnose_shade(
    orientation_deg: float,
    inter_row_spacing_m: float,
) -> Dict[str, object]:
    """
    Return a structured shade diagnostic for a tree row.

    Logic
    -----
    - N-S oriented rows (orientation_deg close to 0 or 180) shade the
      ground more evenly through the day → optimal.
    - E-W oriented rows (orientation_deg close to 90) cast a long static
      shadow band to the north → suboptimal in the northern hemisphere.
    - Inter-row spacing thresholds drive a critical / suboptimal / good
      grading.
    """
    if inter_row_spacing_m <= 0:
        raise ValueError("inter_row_spacing_m must be strictly positive.")

    # Orientation score: 1 when perfectly N-S, 0 when perfectly E-W.
    # |sin(2θ)| gives the right shape but we want max at 0/180, min at 90.
    # Use 1 - |sin(orientation)|.
    orientation_rad = math.radians(orientation_deg)
    orientation_score = 1.0 - abs(math.sin(orientation_rad))

    # Spacing grading
    if inter_row_spacing_m < _SHADE_SPACING_CRITICAL_M:
        spacing_status = "critical"
    elif inter_row_spacing_m < _SHADE_SPACING_SUBOPTIMAL_M:
        spacing_status = "suboptimal"
    else:
        spacing_status = "good"

    # Combined risk
    if spacing_status == "critical":
        risk_level = "high"
        message = (
            f"Espacement inter-rang critique ({inter_row_spacing_m:.1f} m) : "
            "risque élevé de compétition lumineuse et de chute de rendement. "
            f"Le seuil de blocage est de {_SHADE_SPACING_CRITICAL_M} m."
        )
    elif spacing_status == "suboptimal" or orientation_score < 0.4:
        risk_level = "medium"
        message = (
            "Configuration sous-optimale. "
            f"Orientation à {orientation_deg:.1f}° (score {orientation_score:.2f}, "
            f"1 = axe Nord-Sud idéal), espacement {inter_row_spacing_m:.1f} m. "
            "Envisagez de réorienter ou d'écarter davantage les rangs."
        )
    else:
        risk_level = "low"
        message = (
            f"Diagnostic favorable. Orientation {orientation_deg:.1f}° "
            f"(score {orientation_score:.2f}) et espacement {inter_row_spacing_m:.1f} m "
            "compatibles avec une bonne pénétration solaire."
        )

    return {
        "orientation_deg": orientation_deg,
        "orientation_score": orientation_score,
        "inter_row_spacing_m": inter_row_spacing_m,
        "spacing_status": spacing_status,
        "risk_level": risk_level,
        "message": message,
    }


# ---------------------------------------------------------------------------
# PAC compliance
# ---------------------------------------------------------------------------

PAC_MAX_DENSITY_PER_HA = 200


def compute_tree_count(line_length_m: float, intra_row_spacing_m: float) -> int:
    """
    Estimate tree count for a row of given total length, assuming a
    constant intra-row spacing and one tree at each spacing interval
    plus one at the end (n = floor(L / s) + 1).
    """
    if intra_row_spacing_m <= 0:
        raise ValueError("intra_row_spacing_m must be strictly positive.")
    if line_length_m < 0:
        raise ValueError("line_length_m cannot be negative.")
    return max(0, math.floor(line_length_m / intra_row_spacing_m) + (1 if line_length_m > 0 else 0))


def check_pac_compliance(total_trees: int, area_ha: float) -> Dict[str, object]:
    """
    Verify density-per-hectare against the EU CAP threshold for
    intra-plot agroforestry. Above 200 trees/ha (typical FR rule),
    the parcel may lose its eligibility for direct area-based aids.
    """
    if area_ha <= 0:
        raise ValueError("area_ha must be strictly positive for PAC compliance check.")

    density = total_trees / area_ha
    compliant = density <= PAC_MAX_DENSITY_PER_HA

    if compliant:
        message = (
            f"Conformité PAC : {density:.1f} arbres/ha "
            f"(limite {PAC_MAX_DENSITY_PER_HA}). Les aides surfaciques sont préservées."
        )
    else:
        message = (
            f"Densité excessive : {density:.1f} arbres/ha "
            f"(limite PAC {PAC_MAX_DENSITY_PER_HA}). "
            "Risque de requalification en bois et perte des aides de surface."
        )

    return {
        "total_trees": total_trees,
        "area_ha": area_ha,
        "density_per_ha": density,
        "pac_limit": PAC_MAX_DENSITY_PER_HA,
        "compliant": compliant,
        "message": message,
    }


# ---------------------------------------------------------------------------
# Carbon sequestration model
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class SpeciesGrowthParams:
    """
    Sigmoid growth model parameters for a tree species.

    Attributes
    ----------
    max_tco2_per_tree : float
        Asymptotic CO2 stock per mature tree (tCO2eq), aggregating
        biomass + soil contributions.
    growth_rate : float
        Steepness of the sigmoid; higher = faster growth.
    midpoint_year : float
        Year at which 50% of max stock is reached.

    Reference values are MVP placeholders. The official LBC method
    calculators must be used for actual certification.
    """
    max_tco2_per_tree: float
    growth_rate: float
    midpoint_year: float


# Indicative species parameters — replace with LBC calculator outputs
# before any real-world certification claim.
SPECIES_PARAMS: Dict[str, SpeciesGrowthParams] = {
    "chene":    SpeciesGrowthParams(max_tco2_per_tree=2.8, growth_rate=0.25, midpoint_year=12.0),
    "noyer":    SpeciesGrowthParams(max_tco2_per_tree=2.1, growth_rate=0.30, midpoint_year=10.0),
    "peuplier": SpeciesGrowthParams(max_tco2_per_tree=3.5, growth_rate=0.45, midpoint_year=7.0),
    "alisier":  SpeciesGrowthParams(max_tco2_per_tree=1.6, growth_rate=0.28, midpoint_year=11.0),
}

DEFAULT_SPECIES_KEY = "chene"


def _sigmoid(year: float, params: SpeciesGrowthParams) -> float:
    """Logistic growth: returns cumulative tCO2 per tree at given year."""
    exponent = -params.growth_rate * (year - params.midpoint_year)
    return params.max_tco2_per_tree / (1.0 + math.exp(exponent))


def estimate_carbon_sequestration(
    species: str,
    tree_count: int,
    duration_years: int = 20,
) -> Dict[str, object]:
    """
    Project total CO2 sequestration over `duration_years` for a stand
    of `tree_count` trees of the given species.

    Returns
    -------
    dict with:
      - species : normalized species key
      - tree_count : echo
      - duration_years : echo
      - annual_curve_tco2 : List[float], cumulative tCO2 at end of each year
      - total_tco2 : float, last value of the annual curve
    """
    if tree_count < 0:
        raise ValueError("tree_count cannot be negative.")
    if duration_years <= 0:
        raise ValueError("duration_years must be strictly positive.")

    key = species.lower().strip()
    params = SPECIES_PARAMS.get(key, SPECIES_PARAMS[DEFAULT_SPECIES_KEY])

    annual_curve: List[float] = [
        round(_sigmoid(year, params) * tree_count, 4)
        for year in range(1, duration_years + 1)
    ]
    total = annual_curve[-1] if annual_curve else 0.0

    return {
        "species": key if key in SPECIES_PARAMS else DEFAULT_SPECIES_KEY,
        "tree_count": tree_count,
        "duration_years": duration_years,
        "annual_curve_tco2": annual_curve,
        "total_tco2": float(total),
    }


# ---------------------------------------------------------------------------
# Revenue split (FinTech)
# ---------------------------------------------------------------------------

PLATFORM_COMMISSION_RATE = 0.15  # ARBO retains 15% of every transaction
FARMER_PAYOUT_RATE = 1.0 - PLATFORM_COMMISSION_RATE


def split_revenue(amount_eur: float) -> Tuple[float, float]:
    """
    Split a gross transaction amount into (farmer_payout, platform_fee).

    Uses float here for diagnostic display; the actual database writes
    are performed with Decimal in routes.purchase_credit to preserve
    monetary precision.
    """
    if amount_eur < 0:
        raise ValueError("amount_eur cannot be negative.")
    platform_fee = round(amount_eur * PLATFORM_COMMISSION_RATE, 2)
    farmer_payout = round(amount_eur - platform_fee, 2)
    return farmer_payout, platform_fee
