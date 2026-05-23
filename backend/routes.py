"""
ARBO Platform - REST API endpoints.

Routes are grouped into thematic routers and protected by JWT auth where
business data belongs to an authenticated account.
"""

from __future__ import annotations

import hashlib
import json
import secrets
import uuid
from collections import defaultdict
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import shape as shapely_shape
from shapely.ops import transform as shapely_transform
from sqlalchemy.orm import Session, joinedload
from pyproj import Transformer

from . import engine, models, schemas, solar
from .auth import auth_router, get_current_user, require_role
from .database import get_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _geometry_to_geojson(geom_column) -> dict:
    """Convert a PostGIS geometry column value to a GeoJSON dict."""
    shapely_geom = to_shape(geom_column)
    return json.loads(json.dumps(shapely_geom.__geo_interface__))


def _to_decimal(value: float) -> Decimal:
    """Money rounding: always 2 decimals, half-up."""
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _to_decimal4(value: float) -> Decimal:
    """Area / tCO2 rounding: 4 decimals, half-up."""
    return Decimal(str(value)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def _plot_to_out(plot: models.Plot) -> schemas.PlotOut:
    return schemas.PlotOut(
        id=plot.id,
        farm_id=plot.farm_id,
        name=plot.name,
        geometry=_geometry_to_geojson(plot.geometry),
        area_ha=plot.area_ha,
        soil_type=plot.soil_type,
        created_at=plot.created_at,
    )


def _line_to_out(line: models.TreeLine) -> schemas.TreeLineOut:
    return schemas.TreeLineOut(
        id=line.id,
        plot_id=line.plot_id,
        species=line.species,
        geometry=_geometry_to_geojson(line.geometry),
        inter_row_spacing_m=line.inter_row_spacing_m,
        intra_row_spacing_m=line.intra_row_spacing_m,
        orientation_deg=line.orientation_deg,
        created_at=line.created_at,
    )


def _require(obj, name: str):
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{name} not found.",
        )


def _require_owned_farm(
    farm_id: uuid.UUID,
    current_user: models.User,
    db: Session,
) -> models.Farm:
    farm = db.get(models.Farm, farm_id)
    _require(farm, "Farm")
    if current_user.role != "admin" and farm.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden.")
    return farm


def _require_owned_plot(
    plot_id: uuid.UUID,
    current_user: models.User,
    db: Session,
) -> models.Plot:
    plot = db.get(models.Plot, plot_id)
    _require(plot, "Plot")
    _require_owned_farm(plot.farm_id, current_user, db)
    return plot


def _project_species(project: models.CarbonProject) -> str | None:
    metadata = project.metadata_json or {}
    return metadata.get("dominant_species")


def _plot_geojson_and_centroid(plot: models.Plot | None) -> tuple[dict | None, float | None, float | None]:
    if plot is None:
        return None, None, None
    geojson = _geometry_to_geojson(plot.geometry)
    centroid = shapely_shape(geojson).centroid
    return geojson, float(centroid.y), float(centroid.x)


def _project_credit_counts(project: models.CarbonProject) -> dict[str, int]:
    counts = {"total": 0, "sold": 0, "available": 0, "withdrawn": 0}
    for credit in project.credits:
        counts["total"] += 1
        if credit.status in ("sold", "retired"):
            counts["sold"] += 1
        elif credit.status == "available":
            counts["available"] += 1
        elif credit.status == "withdrawn":
            counts["withdrawn"] += 1
    return counts


def _display_project_status(project: models.CarbonProject, counts: dict[str, int]) -> str:
    if project.status == "draft":
        return "Brouillon"
    if counts["total"] > 0 and counts["sold"] == counts["total"]:
        return "Tout vendu"
    if project.status == "withdrawn" or counts["withdrawn"] > 0 and counts["available"] == 0:
        return "Retiré"
    if counts["sold"] > 0:
        return "Partiellement vendu"
    if counts["available"] > 0:
        return "Listé"
    return "Brouillon"


def _project_to_farmer_out(project: models.CarbonProject) -> schemas.FarmerProjectOut:
    counts = _project_credit_counts(project)
    plot_geojson, _lat, _lng = _plot_geojson_and_centroid(project.plot)
    revenue = sum(
        (tx.farmer_payout_eur or Decimal("0.00"))
        for credit in project.credits
        for tx in ([credit.transaction] if credit.transaction else [])
    )
    return schemas.FarmerProjectOut(
        id=project.id,
        name=project.name,
        farm_name=project.farm.name,
        farm_region=project.farm.region,
        plot_id=project.plot_id,
        plot_name=project.plot.name if project.plot else None,
        plot_geometry=plot_geojson,
        status=_display_project_status(project, counts),
        total_credits=counts["total"],
        sold_credits=counts["sold"],
        available_credits=counts["available"],
        withdrawn_credits=counts["withdrawn"],
        price_per_credit_eur=project.price_per_credit_eur,
        revenue_generated_eur=revenue,
        certified_at=project.created_at,
        species=_project_species(project),
        project_duration_years=project.project_duration_years,
        estimated_tco2=project.estimated_tco2,
    )


def _marketplace_credit_to_out(credit: models.CarbonCredit) -> schemas.MarketplaceCreditOut:
    project = credit.project
    plot_geojson, lat, lng = _plot_geojson_and_centroid(project.plot)
    return schemas.MarketplaceCreditOut(
        id=credit.id,
        project_id=credit.project_id,
        serial_number=credit.serial_number,
        vintage_year=credit.vintage_year,
        status=credit.status,
        price_eur=credit.price_eur,
        owner_id=credit.owner_id,
        created_at=credit.created_at,
        project_name=project.name,
        farm_name=project.farm.name,
        farm_region=project.farm.region,
        plot_name=project.plot.name if project.plot else None,
        plot_geometry=plot_geojson,
        centroid_lat=lat,
        centroid_lng=lng,
        species=_project_species(project),
        project_duration_years=project.project_duration_years,
    )


def _tree_positions_from_lines(
    plot_geojson: dict,
    lines: List[models.TreeLine],
    tree_height_m: float,
) -> list[dict]:
    plot_shape = shapely_shape(plot_geojson)
    centroid = plot_shape.centroid
    proj_str = (
        f"+proj=aeqd +lat_0={centroid.y} +lon_0={centroid.x} "
        f"+x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"
    )
    to_local = Transformer.from_crs("EPSG:4326", proj_str, always_xy=True)
    to_wgs84 = Transformer.from_crs(proj_str, "EPSG:4326", always_xy=True)

    tree_positions: list[dict] = []
    for line in lines:
        line_geojson = _geometry_to_geojson(line.geometry)
        line_shape = shapely_shape(line_geojson)
        projected_line = shapely_transform(to_local.transform, line_shape)
        spacing_m = max(float(line.intra_row_spacing_m), 0.1)

        for geom in getattr(projected_line, "geoms", [projected_line]):
            distance_m = 0.0
            while distance_m <= geom.length:
                point = geom.interpolate(distance_m)
                lng, lat = to_wgs84.transform(point.x, point.y)
                tree_positions.append(
                    {
                        "lng": round(float(lng), 8),
                        "lat": round(float(lat), 8),
                        "height_m": float(tree_height_m),
                    }
                )
                distance_m += spacing_m

            if geom.length > 0 and (not tree_positions or distance_m - spacing_m < geom.length):
                point = geom.interpolate(geom.length)
                lng, lat = to_wgs84.transform(point.x, point.y)
                tree_positions.append(
                    {
                        "lng": round(float(lng), 8),
                        "lat": round(float(lat), 8),
                        "height_m": float(tree_height_m),
                    }
                )

    return tree_positions


def _solar_params_hash(
    plot_id: uuid.UUID,
    tree_positions: list[dict],
    payload: schemas.SolarSimulationRequest,
) -> str:
    cache_payload = {
        "plot_id": str(plot_id),
        "tree_positions": sorted(
            tree_positions,
            key=lambda tree: (tree["lng"], tree["lat"], tree["height_m"]),
        ),
        "sample_days": sorted(payload.sample_days),
        "canopy_radius_m": payload.canopy_radius_m,
        "resolution_m": payload.resolution_m,
    }
    serialized = json.dumps(cache_payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _solar_simulation_to_out(
    simulation: models.SolarSimulation,
) -> schemas.SolarSimulationOut:
    return schemas.SolarSimulationOut.model_validate(simulation)


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

users_router = APIRouter(prefix="/users", tags=["users"])


@users_router.get("/{user_id}", response_model=schemas.UserOut)
def get_user(
    user_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> schemas.UserOut:
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden.")
    user = db.get(models.User, user_id)
    _require(user, "User")
    return schemas.UserOut.model_validate(user)


# ---------------------------------------------------------------------------
# Farms
# ---------------------------------------------------------------------------

farms_router = APIRouter(prefix="/farms", tags=["farms"])


@farms_router.post("", response_model=schemas.FarmOut, status_code=201)
def create_farm(
    payload: schemas.FarmCreate,
    current_user: models.User = Depends(require_role("farmer", "admin")),
    db: Session = Depends(get_db),
) -> schemas.FarmOut:
    farm = models.Farm(
        owner_id=current_user.id,
        name=payload.name,
        country_code=payload.country_code,
        region=payload.region,
    )
    db.add(farm)
    db.commit()
    db.refresh(farm)
    return schemas.FarmOut.model_validate(farm)


@farms_router.get("", response_model=List[schemas.FarmOut])
def list_farms(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[schemas.FarmOut]:
    query = db.query(models.Farm)
    if current_user.role != "admin":
        query = query.filter(models.Farm.owner_id == current_user.id)
    farms = query.order_by(models.Farm.created_at.desc()).all()
    return [schemas.FarmOut.model_validate(f) for f in farms]


@farms_router.get("/{farm_id}", response_model=schemas.FarmOut)
def get_farm(
    farm_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> schemas.FarmOut:
    farm = _require_owned_farm(farm_id, current_user, db)
    return schemas.FarmOut.model_validate(farm)


# ---------------------------------------------------------------------------
# Plots
# ---------------------------------------------------------------------------

plots_router = APIRouter(prefix="/plots", tags=["plots"])


@plots_router.post("", response_model=schemas.PlotOut, status_code=201)
def create_plot(
    payload: schemas.PlotCreate,
    current_user: models.User = Depends(require_role("farmer", "admin")),
    db: Session = Depends(get_db),
) -> schemas.PlotOut:
    _require_owned_farm(payload.farm_id, current_user, db)

    geojson = payload.geometry.model_dump()
    try:
        area_ha = engine.compute_area_hectares(geojson)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if area_ha <= 0:
        raise HTTPException(status_code=422, detail="Computed area must be positive.")

    plot = models.Plot(
        farm_id=payload.farm_id,
        name=payload.name,
        geometry=from_shape(shapely_shape(geojson), srid=4326),
        area_ha=_to_decimal4(area_ha),
        soil_type=payload.soil_type,
    )
    db.add(plot)
    db.commit()
    db.refresh(plot)
    return _plot_to_out(plot)


@plots_router.get("/by-farm/{farm_id}", response_model=List[schemas.PlotOut])
def list_plots_for_farm(
    farm_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[schemas.PlotOut]:
    _require_owned_farm(farm_id, current_user, db)
    plots = db.query(models.Plot).filter(models.Plot.farm_id == farm_id).all()
    return [_plot_to_out(p) for p in plots]


@plots_router.get("/{plot_id}", response_model=schemas.PlotOut)
def get_plot(
    plot_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> schemas.PlotOut:
    plot = _require_owned_plot(plot_id, current_user, db)
    return _plot_to_out(plot)


# ---------------------------------------------------------------------------
# Tree lines
# ---------------------------------------------------------------------------

lines_router = APIRouter(prefix="/tree-lines", tags=["tree-lines"])


@lines_router.post("", response_model=schemas.TreeLineOut, status_code=201)
def create_tree_line(
    payload: schemas.TreeLineCreate,
    current_user: models.User = Depends(require_role("farmer", "admin")),
    db: Session = Depends(get_db),
) -> schemas.TreeLineOut:
    _require_owned_plot(payload.plot_id, current_user, db)

    geojson = payload.geometry.model_dump()
    try:
        orientation = engine.compute_line_orientation_deg(geojson)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    line = models.TreeLine(
        plot_id=payload.plot_id,
        species=payload.species,
        geometry=from_shape(shapely_shape(geojson), srid=4326),
        inter_row_spacing_m=payload.inter_row_spacing_m,
        intra_row_spacing_m=payload.intra_row_spacing_m,
        orientation_deg=orientation,
    )
    db.add(line)
    db.commit()
    db.refresh(line)
    return _line_to_out(line)


@lines_router.get("/by-plot/{plot_id}", response_model=List[schemas.TreeLineOut])
def list_lines_for_plot(
    plot_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[schemas.TreeLineOut]:
    _require_owned_plot(plot_id, current_user, db)
    lines = db.query(models.TreeLine).filter(models.TreeLine.plot_id == plot_id).all()
    return [_line_to_out(l) for l in lines]


# ---------------------------------------------------------------------------
# Diagnostics (read-only, computed live)
# ---------------------------------------------------------------------------

diagnostics_router = APIRouter(prefix="/diagnostics", tags=["diagnostics"])


@diagnostics_router.get("/plot/{plot_id}", response_model=schemas.PlotDiagnostic)
def diagnose_plot(
    plot_id: uuid.UUID,
    duration_years: int = 20,
    price_per_credit_eur: float = 35.0,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> schemas.PlotDiagnostic:
    plot = _require_owned_plot(plot_id, current_user, db)
    if plot.area_ha is None or float(plot.area_ha) <= 0:
        raise HTTPException(status_code=422, detail="Plot area is not set or invalid.")

    lines = db.query(models.TreeLine).filter(models.TreeLine.plot_id == plot_id).all()
    shade_results: List[schemas.ShadeDiagnostic] = []
    total_trees = 0
    species_tree_counts: dict[str, int] = {}

    for line in lines:
        geojson = _geometry_to_geojson(line.geometry)
        line_length = engine.compute_line_length_m(geojson)
        tree_count_on_line = engine.compute_tree_count(
            line_length, line.intra_row_spacing_m
        )
        total_trees += tree_count_on_line
        species_tree_counts[line.species] = (
            species_tree_counts.get(line.species, 0) + tree_count_on_line
        )

        shade = engine.diagnose_shade(
            orientation_deg=line.orientation_deg or 0.0,
            inter_row_spacing_m=line.inter_row_spacing_m,
        )
        shade_results.append(schemas.ShadeDiagnostic(**shade))

    area_ha = float(plot.area_ha)
    pac = engine.check_pac_compliance(total_trees=total_trees, area_ha=area_ha)
    pac_schema = schemas.PACComplianceDiagnostic(**pac)

    dominant_species = (
        max(species_tree_counts.items(), key=lambda kv: kv[1])[0]
        if species_tree_counts
        else engine.DEFAULT_SPECIES_KEY
    )
    carbon = engine.estimate_carbon_sequestration(
        species=dominant_species,
        tree_count=total_trees,
        duration_years=duration_years,
    )
    carbon_schema = schemas.CarbonEstimate(**carbon)

    gross = carbon_schema.total_tco2 * price_per_credit_eur
    farmer_payout, platform_fee = engine.split_revenue(gross)

    return schemas.PlotDiagnostic(
        plot_id=plot.id,
        area_ha=area_ha,
        pac=pac_schema,
        shade=shade_results,
        carbon=carbon_schema,
        estimated_revenue_eur=round(gross, 2),
        platform_fee_eur=platform_fee,
        farmer_payout_eur=farmer_payout,
    )


# ---------------------------------------------------------------------------
# Solar simulations (pvlib-backed, cached)
# ---------------------------------------------------------------------------

solar_router = APIRouter(prefix="/solar", tags=["solar"])


@solar_router.post(
    "/simulate/{plot_id}",
    response_model=schemas.SolarSimulationOut,
)
def simulate_solar_shade(
    plot_id: uuid.UUID,
    payload: schemas.SolarSimulationRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> schemas.SolarSimulationOut:
    plot = _require_owned_plot(plot_id, current_user, db)
    plot_geojson = _geometry_to_geojson(plot.geometry)
    plot_shape = shapely_shape(plot_geojson)
    centroid = plot_shape.centroid

    lines = db.query(models.TreeLine).filter(models.TreeLine.plot_id == plot.id).all()
    tree_positions = _tree_positions_from_lines(
        plot_geojson=plot_geojson,
        lines=lines,
        tree_height_m=payload.tree_height_m,
    )
    params_hash = _solar_params_hash(plot.id, tree_positions, payload)

    cached = (
        db.query(models.SolarSimulation)
        .filter(
            models.SolarSimulation.plot_id == plot.id,
            models.SolarSimulation.params_hash == params_hash,
        )
        .one_or_none()
    )
    if cached is not None:
        return _solar_simulation_to_out(cached)

    shade_result = solar.compute_annual_shade_ratio(
        plot_geojson=plot_geojson,
        tree_positions=tree_positions,
        latitude=centroid.y,
        longitude=centroid.x,
        sample_days=payload.sample_days,
        tree_canopy_radius_m=payload.canopy_radius_m,
    )
    heatmap_geojson = solar.generate_shade_heatmap(
        plot_geojson=plot_geojson,
        tree_positions=tree_positions,
        latitude=centroid.y,
        longitude=centroid.x,
        resolution_m=payload.resolution_m,
        sample_days=payload.sample_days,
    )

    simulation = models.SolarSimulation(
        plot_id=plot.id,
        params_hash=params_hash,
        shade_ratio_annual=shade_result["shade_ratio_annual"],
        shade_ratio_by_month=shade_result["shade_ratio_by_month"],
        peak_shade_hour_utc=shade_result["peak_shade_hour_utc"],
        total_shadow_area_m2=shade_result["total_shadow_area_m2"],
        plot_area_m2=shade_result["plot_area_m2"],
        heatmap_geojson=heatmap_geojson,
        sample_days=shade_result["sample_days"],
    )
    db.add(simulation)
    db.commit()
    db.refresh(simulation)
    return _solar_simulation_to_out(simulation)


@solar_router.get(
    "/simulate/{plot_id}/latest",
    response_model=schemas.SolarSimulationOut,
)
def get_latest_solar_simulation(
    plot_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> schemas.SolarSimulationOut:
    plot = _require_owned_plot(plot_id, current_user, db)
    simulation = (
        db.query(models.SolarSimulation)
        .filter(models.SolarSimulation.plot_id == plot.id)
        .order_by(models.SolarSimulation.created_at.desc())
        .first()
    )
    _require(simulation, "Solar simulation")
    return _solar_simulation_to_out(simulation)


# ---------------------------------------------------------------------------
# Carbon projects
# ---------------------------------------------------------------------------

projects_router = APIRouter(prefix="/projects", tags=["projects"])


def _mint_credit_serial(project_id: uuid.UUID, index: int) -> str:
    """Generate a unique, traceable serial number per credit unit."""
    suffix = secrets.token_hex(4).upper()
    return f"ARBO-{project_id.hex[:8].upper()}-{index:05d}-{suffix}"


@projects_router.post("", response_model=schemas.CarbonProjectOut, status_code=201)
def create_project(
    payload: schemas.CarbonProjectCreate,
    current_user: models.User = Depends(require_role("farmer", "admin")),
    db: Session = Depends(get_db),
) -> schemas.CarbonProjectOut:
    farm = _require_owned_farm(payload.farm_id, current_user, db)
    plot = _require_owned_plot(payload.plot_id, current_user, db)
    if plot.farm_id != farm.id:
        raise HTTPException(
            status_code=400, detail="Plot does not belong to the specified farm."
        )

    lines = db.query(models.TreeLine).filter(models.TreeLine.plot_id == plot.id).all()
    if not lines:
        raise HTTPException(
            status_code=422,
            detail="Cannot create a project on a plot with no tree lines.",
        )

    total_trees = 0
    species_tree_counts: dict[str, int] = {}
    for line in lines:
        geojson = _geometry_to_geojson(line.geometry)
        length = engine.compute_line_length_m(geojson)
        n = engine.compute_tree_count(length, line.intra_row_spacing_m)
        total_trees += n
        species_tree_counts[line.species] = species_tree_counts.get(line.species, 0) + n

    dominant = max(species_tree_counts.items(), key=lambda kv: kv[1])[0]
    carbon = engine.estimate_carbon_sequestration(
        species=dominant,
        tree_count=total_trees,
        duration_years=payload.project_duration_years,
    )

    project = models.CarbonProject(
        farm_id=payload.farm_id,
        plot_id=payload.plot_id,
        name=payload.name,
        methodology="LBC_HAIES_V2",
        status="draft",
        project_duration_years=payload.project_duration_years,
        estimated_tco2=_to_decimal4(carbon["total_tco2"]),
        price_per_credit_eur=_to_decimal(payload.price_per_credit_eur),
        metadata_json={
            "dominant_species": dominant,
            "total_trees": total_trees,
            "annual_curve_tco2": carbon["annual_curve_tco2"],
        },
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return schemas.CarbonProjectOut.model_validate(project)


@projects_router.post(
    "/{project_id}/list-on-marketplace",
    response_model=schemas.CarbonProjectOut,
)
def list_on_marketplace(
    project_id: uuid.UUID,
    current_user: models.User = Depends(require_role("farmer", "admin")),
    db: Session = Depends(get_db),
) -> schemas.CarbonProjectOut:
    project = db.get(models.CarbonProject, project_id)
    _require(project, "Project")
    _require_owned_farm(project.farm_id, current_user, db)

    if project.status not in ("draft", "validated"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot list project in status '{project.status}'.",
        )

    credit_count = int(project.estimated_tco2)
    if credit_count <= 0:
        raise HTTPException(
            status_code=422,
            detail="Project has zero certifiable credits; refusing to list.",
        )

    for i in range(1, credit_count + 1):
        credit = models.CarbonCredit(
            project_id=project.id,
            serial_number=_mint_credit_serial(project.id, i),
            vintage_year=project.vintage_year,
            status="available",
            price_eur=project.price_per_credit_eur,
        )
        db.add(credit)

    project.status = "listed_on_marketplace"
    db.commit()
    db.refresh(project)
    return schemas.CarbonProjectOut.model_validate(project)


@projects_router.patch("/{project_id}", response_model=schemas.CarbonProjectOut)
def update_project(
    project_id: uuid.UUID,
    payload: schemas.ProjectPriceUpdate,
    current_user: models.User = Depends(require_role("farmer", "admin")),
    db: Session = Depends(get_db),
) -> schemas.CarbonProjectOut:
    project = db.get(models.CarbonProject, project_id)
    _require(project, "Project")
    _require_owned_farm(project.farm_id, current_user, db)

    new_price = _to_decimal(payload.price_per_credit_eur)
    project.price_per_credit_eur = new_price
    for credit in project.credits:
        if credit.status in ("available", "withdrawn"):
            credit.price_eur = new_price

    db.commit()
    db.refresh(project)
    return schemas.CarbonProjectOut.model_validate(project)


@projects_router.post("/{project_id}/withdraw", response_model=schemas.FarmerProjectOut)
def withdraw_project(
    project_id: uuid.UUID,
    current_user: models.User = Depends(require_role("farmer", "admin")),
    db: Session = Depends(get_db),
) -> schemas.FarmerProjectOut:
    project = db.get(models.CarbonProject, project_id)
    _require(project, "Project")
    _require_owned_farm(project.farm_id, current_user, db)

    available = [credit for credit in project.credits if credit.status == "available"]
    if not available:
        raise HTTPException(status_code=400, detail="No available credits to withdraw.")
    for credit in available:
        credit.status = "withdrawn"
    project.status = "withdrawn"

    db.commit()
    db.refresh(project)
    return _project_to_farmer_out(project)


@projects_router.post("/{project_id}/relist", response_model=schemas.FarmerProjectOut)
def relist_project(
    project_id: uuid.UUID,
    current_user: models.User = Depends(require_role("farmer", "admin")),
    db: Session = Depends(get_db),
) -> schemas.FarmerProjectOut:
    project = db.get(models.CarbonProject, project_id)
    _require(project, "Project")
    _require_owned_farm(project.farm_id, current_user, db)

    withdrawn = [credit for credit in project.credits if credit.status == "withdrawn"]
    if not withdrawn:
        raise HTTPException(status_code=400, detail="No withdrawn credits to relist.")
    for credit in withdrawn:
        credit.status = "available"
        credit.price_eur = project.price_per_credit_eur

    counts = _project_credit_counts(project)
    project.status = "partially_sold" if counts["sold"] > 0 else "listed_on_marketplace"

    db.commit()
    db.refresh(project)
    return _project_to_farmer_out(project)


@projects_router.get("/{project_id}", response_model=schemas.CarbonProjectOut)
def get_project(
    project_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> schemas.CarbonProjectOut:
    project = db.get(models.CarbonProject, project_id)
    _require(project, "Project")
    if current_user.role != "admin":
        _require_owned_farm(project.farm_id, current_user, db)
    return schemas.CarbonProjectOut.model_validate(project)


# ---------------------------------------------------------------------------
# Farmer workspace
# ---------------------------------------------------------------------------
farmer_router = APIRouter(prefix="/farmer", tags=["farmer"])


@farmer_router.get("/projects", response_model=List[schemas.FarmerProjectOut])
def list_farmer_projects(
    current_user: models.User = Depends(require_role("farmer", "admin")),
    db: Session = Depends(get_db),
) -> List[schemas.FarmerProjectOut]:
    query = db.query(models.CarbonProject).join(models.Farm)
    if current_user.role != "admin":
        query = query.filter(models.Farm.owner_id == current_user.id)
    projects = query.order_by(models.CarbonProject.created_at.desc()).all()
    return [_project_to_farmer_out(project) for project in projects]


@farmer_router.get("/dashboard", response_model=schemas.FarmerDashboardOut)
def get_farmer_dashboard(
    current_user: models.User = Depends(require_role("farmer", "admin")),
    db: Session = Depends(get_db),
) -> schemas.FarmerDashboardOut:
    projects_query = db.query(models.CarbonProject).join(models.Farm)
    if current_user.role != "admin":
        projects_query = projects_query.filter(models.Farm.owner_id == current_user.id)
    projects = projects_query.all()
    project_ids = [project.id for project in projects]

    credits_available = 0
    total_tco2 = Decimal("0.0000")
    for project in projects:
        counts = _project_credit_counts(project)
        credits_available += counts["available"]
        total_tco2 += project.estimated_tco2 or Decimal("0.0000")

    if project_ids:
        transactions = (
            db.query(models.Transaction)
            .join(models.CarbonCredit, models.Transaction.credit_id == models.CarbonCredit.id)
            .filter(models.CarbonCredit.project_id.in_(project_ids))
            .order_by(models.Transaction.created_at.desc())
            .all()
        )
    else:
        transactions = []

    total_revenue = sum((tx.farmer_payout_eur or Decimal("0.00")) for tx in transactions)
    recent = []
    for tx in transactions[:10]:
        buyer = db.get(models.User, tx.buyer_id) if tx.buyer_id else None
        recent.append(
            schemas.FarmerTransactionOut(
                date=tx.created_at,
                credit_serial=tx.credit.serial_number,
                buyer_email=buyer.email if buyer else None,
                amount_eur=tx.amount_eur,
                farmer_payout_eur=tx.farmer_payout_eur,
            )
        )

    monthly = defaultdict(lambda: {"sales": 0, "gross": Decimal("0.00"), "payout": Decimal("0.00")})
    now = datetime.utcnow()
    month_keys = []
    for offset in range(5, -1, -1):
        year = now.year
        month = now.month - offset
        while month <= 0:
            month += 12
            year -= 1
        key = f"{year}-{month:02d}"
        month_keys.append(key)
        monthly[key]
    for tx in transactions:
        key = tx.created_at.strftime("%Y-%m")
        if key in monthly:
            monthly[key]["sales"] += 1
            monthly[key]["gross"] += tx.amount_eur or Decimal("0.00")
            monthly[key]["payout"] += tx.farmer_payout_eur or Decimal("0.00")

    return schemas.FarmerDashboardOut(
        total_revenue_eur=total_revenue,
        credits_sold=len(transactions),
        credits_available=credits_available,
        total_tco2=total_tco2,
        recent_transactions=recent,
        monthly_sales=[
            schemas.MonthlySalesOut(
                month=key,
                sales=monthly[key]["sales"],
                gross_eur=monthly[key]["gross"],
                payout_eur=monthly[key]["payout"],
            )
            for key in month_keys
        ],
    )


# ---------------------------------------------------------------------------
# Buyer workspace
# ---------------------------------------------------------------------------
buyer_router = APIRouter(prefix="/buyer", tags=["buyer"])


@buyer_router.get("/dashboard", response_model=schemas.BuyerDashboardOut)
def get_buyer_dashboard(
    current_user: models.User = Depends(require_role("buyer", "admin")),
    db: Session = Depends(get_db),
) -> schemas.BuyerDashboardOut:
    transactions = (
        db.query(models.Transaction)
        .filter(models.Transaction.buyer_id == current_user.id)
        .order_by(models.Transaction.created_at.desc())
        .all()
    )
    owned_credits = []
    for tx in transactions:
        credit = tx.credit
        project = credit.project
        owned_credits.append(
            schemas.BuyerOwnedCreditOut(
                credit_id=credit.id,
                serial_number=credit.serial_number,
                farm_name=project.farm.name,
                species=_project_species(project),
                project_duration_years=project.project_duration_years,
                purchased_at=tx.created_at,
                price_paid_eur=tx.amount_eur,
            )
        )

    total_spent = sum((tx.amount_eur or Decimal("0.00")) for tx in transactions)
    return schemas.BuyerDashboardOut(
        total_tco2_compensated=Decimal(len(transactions)),
        credits_owned=len(transactions),
        total_spent_eur=total_spent,
        credits=owned_credits,
    )


credits_router = APIRouter(prefix="/credits", tags=["credits"])


@credits_router.get("/{credit_id}/certificate", response_class=HTMLResponse)
def get_credit_certificate(
    credit_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HTMLResponse:
    credit = db.get(models.CarbonCredit, credit_id)
    _require(credit, "Credit")
    transaction = credit.transaction
    if transaction is None:
        raise HTTPException(status_code=404, detail="Certificate not available before purchase.")
    if current_user.role != "admin" and transaction.buyer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden.")

    project = credit.project
    buyer = db.get(models.User, transaction.buyer_id) if transaction.buyer_id else None
    html = f"""
    <!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>Certificat ARBO {credit.serial_number}</title>
        <style>
          body {{ font-family: Inter, system-ui, sans-serif; background: #FAF9F6; color: #183B2A; padding: 48px; }}
          .certificate {{ max-width: 820px; margin: 0 auto; border: 2px solid #0F3D24; border-radius: 24px; padding: 36px; background: white; }}
          .kicker {{ color: #2ECC71; letter-spacing: .18em; font-weight: 900; }}
          h1 {{ margin: 0 0 12px; color: #0F3D24; }}
          dl {{ display: grid; grid-template-columns: 220px 1fr; gap: 12px; margin-top: 28px; }}
          dt {{ font-weight: 800; color: #627466; }}
          dd {{ margin: 0; font-weight: 700; }}
        </style>
      </head>
      <body>
        <main class="certificate">
          <p class="kicker">ARBO</p>
          <h1>Certificat de credit carbone</h1>
          <p>Ce document atteste l'achat d'un credit carbone demonstratif sur la plateforme ARBO.</p>
          <dl>
            <dt>Serial number</dt><dd>{credit.serial_number}</dd>
            <dt>Acheteur</dt><dd>{buyer.email if buyer else "N/A"}</dd>
            <dt>Ferme d'origine</dt><dd>{project.farm.name}</dd>
            <dt>Projet</dt><dd>{project.name}</dd>
            <dt>Essence</dt><dd>{_project_species(project) or "N/A"}</dd>
            <dt>Duree</dt><dd>{project.project_duration_years} ans</dd>
            <dt>Date d'achat</dt><dd>{transaction.created_at.strftime("%d/%m/%Y")}</dd>
            <dt>Prix paye</dt><dd>{transaction.amount_eur} EUR</dd>
          </dl>
          <p style="margin-top:32px;color:#627466">MVP de demonstration. Non certifie officiellement Label Bas-Carbone.</p>
        </main>
      </body>
    </html>
    """
    return HTMLResponse(content=html)


# ---------------------------------------------------------------------------
# Marketplace
# ---------------------------------------------------------------------------

marketplace_router = APIRouter(prefix="/marketplace", tags=["marketplace"])


@marketplace_router.get("/credits", response_model=List[schemas.MarketplaceCreditOut])
def list_available_credits(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[schemas.MarketplaceCreditOut]:
    credits = (
        db.query(models.CarbonCredit)
        .options(
            joinedload(models.CarbonCredit.project)
            .joinedload(models.CarbonProject.farm),
            joinedload(models.CarbonCredit.project)
            .joinedload(models.CarbonProject.plot),
        )
        .filter(models.CarbonCredit.status == "available")
        .order_by(models.CarbonCredit.created_at.desc())
        .limit(500)
        .all()
    )
    return [_marketplace_credit_to_out(credit) for credit in credits]


@marketplace_router.post(
    "/purchase/{credit_id}", response_model=schemas.TransactionOut, status_code=201
)
def purchase_credit(
    credit_id: uuid.UUID,
    current_user: models.User = Depends(require_role("buyer", "admin")),
    db: Session = Depends(get_db),
) -> schemas.TransactionOut:
    credit = (
        db.query(models.CarbonCredit)
        .filter(models.CarbonCredit.id == credit_id)
        .with_for_update()
        .one_or_none()
    )
    _require(credit, "Credit")

    if credit.status != "available":
        raise HTTPException(
            status_code=409,
            detail=f"Credit is not available for purchase (status={credit.status}).",
        )

    project = db.get(models.CarbonProject, credit.project_id)
    _require(project, "Parent project")
    farm = db.get(models.Farm, project.farm_id)
    _require(farm, "Parent farm")
    seller_id = farm.owner_id

    amount = _to_decimal(float(credit.price_eur))
    commission = Decimal(str(engine.PLATFORM_COMMISSION_RATE))
    platform_fee = (amount * commission).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    farmer_payout = (amount - platform_fee).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    transaction = models.Transaction(
        credit_id=credit.id,
        seller_id=seller_id,
        buyer_id=current_user.id,
        amount_eur=amount,
        farmer_payout_eur=farmer_payout,
        platform_fee_eur=platform_fee,
        status="completed",
        payment_reference=f"MVP-{secrets.token_hex(6).upper()}",
    )
    db.add(transaction)

    credit.status = "retired"
    credit.owner_id = current_user.id

    remaining = (
        db.query(models.CarbonCredit)
        .filter(
            models.CarbonCredit.project_id == project.id,
            models.CarbonCredit.status == "available",
        )
        .count()
    )
    project.status = "sold_out" if remaining == 0 else "partially_sold"

    db.commit()
    db.refresh(transaction)
    return schemas.TransactionOut.model_validate(transaction)


# ---------------------------------------------------------------------------
# Aggregate router
# ---------------------------------------------------------------------------

def build_api_router() -> APIRouter:
    """Compose and return the top-level API router."""
    api = APIRouter(prefix="/api/v1")
    api.include_router(auth_router)
    api.include_router(users_router)
    api.include_router(farms_router)
    api.include_router(plots_router)
    api.include_router(lines_router)
    api.include_router(diagnostics_router)
    api.include_router(solar_router)
    api.include_router(projects_router)
    api.include_router(farmer_router)
    api.include_router(buyer_router)
    api.include_router(credits_router)
    api.include_router(marketplace_router)
    return api
