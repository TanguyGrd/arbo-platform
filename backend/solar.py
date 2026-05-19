"""
ARBO Platform - Solar shade engine (pvlib-based).

This module replaces the heuristic diagnose_shade() in engine.py with a
physically accurate solar position model. It computes:

1. Sun position (azimuth + altitude) for every hour of a given day or
   year, at the plot's geographic centroid.
2. Shadow length and direction cast by a tree of given height at each
   timestep.
3. Shadow polygon for each tree position (approximated as an ellipse
   projected on flat ground).
4. Aggregate shade coverage ratio for the plot over a time window.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Any

import pandas as pd
import pvlib
from pyproj import Transformer
from shapely.geometry import Point, Polygon, mapping, shape
from shapely.ops import transform as shapely_transform
from shapely.ops import unary_union


logger = logging.getLogger(__name__)

DEFAULT_SAMPLE_DAYS = [
    "2024-01-21",
    "2024-02-21",
    "2024-03-21",
    "2024-04-21",
    "2024-05-21",
    "2024-06-21",
    "2024-07-21",
    "2024-08-21",
    "2024-09-21",
    "2024-10-21",
    "2024-11-21",
    "2024-12-21",
]


@dataclass(frozen=True)
class _LocalProjection:
    to_local: Transformer
    to_wgs84: Transformer


def _clamp_ratio(value: float) -> float:
    return max(0.0, min(1.0, value))


def _make_local_projection(latitude: float, longitude: float) -> _LocalProjection:
    proj_str = (
        f"+proj=aeqd +lat_0={latitude} +lon_0={longitude} "
        f"+x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"
    )
    return _LocalProjection(
        to_local=Transformer.from_crs("EPSG:4326", proj_str, always_xy=True),
        to_wgs84=Transformer.from_crs(proj_str, "EPSG:4326", always_xy=True),
    )


def _project_plot(plot_geojson: dict) -> tuple[Polygon, _LocalProjection]:
    polygon = shape(plot_geojson)
    if polygon.is_empty or not polygon.is_valid:
        raise ValueError("Plot geometry is empty or invalid.")

    centroid = polygon.centroid
    projection = _make_local_projection(latitude=centroid.y, longitude=centroid.x)
    projected = shapely_transform(projection.to_local.transform, polygon)
    return projected, projection


def _project_tree_positions(
    tree_positions: list[dict],
    projection: _LocalProjection,
) -> list[tuple[Point, float]]:
    projected_trees: list[tuple[Point, float]] = []
    for tree in tree_positions:
        try:
            lng = float(tree["lng"])
            lat = float(tree["lat"])
            height_m = float(tree["height_m"])
            if height_m <= 0:
                logger.warning("Ignoring tree with non-positive height: %s", tree)
                continue
            x, y = projection.to_local.transform(lng, lat)
            projected_trees.append((Point(x, y), height_m))
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning("Ignoring invalid tree position %s: %s", tree, exc)
    return projected_trees


def _shadow_circles_for_position(
    sun_position: dict[str, Any],
    projected_trees: list[tuple[Point, float]],
    tree_canopy_radius_m: float,
) -> list[Polygon]:
    if not sun_position.get("is_daytime"):
        return []

    circles: list[Polygon] = []
    for base_point, tree_height_m in projected_trees:
        try:
            dx, dy = compute_shadow_vector(
                sun_azimuth_deg=float(sun_position["azimuth"]),
                sun_altitude_deg=float(sun_position["altitude"]),
                tree_height_m=tree_height_m,
            )
            shadow_length = math.hypot(dx, dy)
            if shadow_length <= 0:
                continue
            radius = tree_canopy_radius_m + shadow_length * 0.15
            circles.append(Point(base_point.x + dx, base_point.y + dy).buffer(radius))
        except (KeyError, TypeError, ValueError, OverflowError) as exc:
            logger.warning("Could not compute shadow for sun position %s: %s", sun_position, exc)
    return circles


def _empty_annual_result(plot_area_m2: float, sample_days: list[str]) -> dict:
    return {
        "shade_ratio_annual": 0.0,
        "shade_ratio_by_month": [0.0 for _ in sample_days],
        "peak_shade_hour_utc": None,
        "total_shadow_area_m2": 0.0,
        "plot_area_m2": plot_area_m2,
        "sample_days": sample_days,
    }


def get_sun_positions(
    latitude: float,
    longitude: float,
    date_str: str,
    freq_minutes: int = 60,
) -> list[dict]:
    """
    Return sun positions for every `freq_minutes` interval on `date_str`.
    Uses pvlib.solarposition.get_solarposition() with the Ineichen clear-sky
    model on the Linke turbidity atlas.

    Each dict in the returned list contains:
      - timestamp: ISO string
      - apparent_zenith: float (degrees, 0=overhead)
      - azimuth: float (degrees clockwise from North)
      - altitude: float (degrees above horizon, = 90 - zenith)
      - is_daytime: bool (altitude > 0)
    """
    if freq_minutes <= 0:
        raise ValueError("freq_minutes must be strictly positive.")

    try:
        times = pd.date_range(
            start=f"{date_str} 00:00:00",
            end=f"{date_str} 23:59:59",
            freq=f"{freq_minutes}min",
            tz="UTC",
        )
        location = pvlib.location.Location(latitude=latitude, longitude=longitude, tz="UTC")
        try:
            location.get_clearsky(times, model="ineichen")
        except Exception as exc:  # pvlib can fail for rare atlas/timestamp edge cases.
            logger.warning("Ineichen clear-sky lookup failed for %s: %s", date_str, exc)

        solar_position = pvlib.solarposition.get_solarposition(
            time=times,
            latitude=latitude,
            longitude=longitude,
        )
    except Exception as exc:
        logger.warning("Solar position computation failed for %s: %s", date_str, exc)
        return []

    positions: list[dict] = []
    for timestamp, row in solar_position.iterrows():
        try:
            apparent_zenith = float(row["apparent_zenith"])
            azimuth = float(row["azimuth"])
            altitude = 90.0 - apparent_zenith
            positions.append(
                {
                    "timestamp": timestamp.isoformat(),
                    "apparent_zenith": apparent_zenith,
                    "azimuth": azimuth,
                    "altitude": altitude,
                    "is_daytime": altitude > 0.0,
                }
            )
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning("Skipping invalid pvlib row at %s: %s", timestamp, exc)
    return positions


def compute_shadow_vector(
    sun_azimuth_deg: float,
    sun_altitude_deg: float,
    tree_height_m: float,
) -> tuple[float, float]:
    """
    Compute the (dx, dy) shadow displacement vector in meters for a tree
    of `tree_height_m` given sun azimuth and altitude.

    Formula:
      shadow_length = tree_height / tan(altitude_rad)
      dx = shadow_length * sin(azimuth_rad + pi)  # opposite to sun
      dy = shadow_length * cos(azimuth_rad + pi)

    Returns (0, 0) when sun_altitude_deg <= 0 (night / below horizon).
    Units are meters in a local metric projection.
    """
    if tree_height_m <= 0:
        raise ValueError("tree_height_m must be strictly positive.")
    if sun_altitude_deg <= 0:
        return (0.0, 0.0)

    altitude_rad = math.radians(sun_altitude_deg)
    tangent = math.tan(altitude_rad)
    if tangent <= 0:
        return (0.0, 0.0)

    shadow_length = tree_height_m / tangent
    azimuth_rad = math.radians(sun_azimuth_deg)
    dx = shadow_length * math.sin(azimuth_rad + math.pi)
    dy = shadow_length * math.cos(azimuth_rad + math.pi)
    return (dx, dy)


def compute_annual_shade_ratio(
    plot_geojson: dict,
    tree_positions: list[dict],
    latitude: float,
    longitude: float,
    sample_days: list[str] | None = None,
    tree_canopy_radius_m: float = 3.0,
) -> dict:
    """
    Estimate the annual shade coverage ratio for a plot.

    Algorithm:
    1. For each sample day, compute hourly sun positions.
    2. For each daytime hour, for each tree, compute shadow ellipse center
       (base_pos + shadow_vector) and approximate shadow as a circle of
       radius = canopy_radius + shadow_length * 0.15 (penumbra factor).
    3. Compute the union of all shadow circles (Shapely unary_union).
    4. Intersect with plot polygon.
    5. shade_ratio = intersection_area / plot_area, averaged over sample days.
    """
    sample_days = sample_days or DEFAULT_SAMPLE_DAYS

    try:
        plot_polygon, projection = _project_plot(plot_geojson)
    except Exception as exc:
        logger.exception("Could not project plot geometry: %s", exc)
        return _empty_annual_result(0.0, sample_days)

    plot_area_m2 = float(plot_polygon.area)
    if plot_area_m2 <= 0:
        logger.warning("Plot area is zero; returning empty shade result.")
        return _empty_annual_result(0.0, sample_days)

    projected_trees = _project_tree_positions(tree_positions, projection)
    if not projected_trees:
        return _empty_annual_result(plot_area_m2, sample_days)

    shade_ratio_by_month: list[float] = []
    daily_shadow_areas: list[float] = []
    peak_shade_hour_utc: str | None = None
    peak_shade_ratio = -1.0

    for sample_day in sample_days:
        try:
            sun_positions = get_sun_positions(latitude, longitude, sample_day)
            daytime_positions = [pos for pos in sun_positions if pos["is_daytime"]]
            if not daytime_positions:
                shade_ratio_by_month.append(0.0)
                daily_shadow_areas.append(0.0)
                continue

            hourly_ratios: list[float] = []
            hourly_areas: list[float] = []
            for sun_position in daytime_positions:
                circles = _shadow_circles_for_position(
                    sun_position,
                    projected_trees,
                    tree_canopy_radius_m,
                )
                if not circles:
                    hourly_ratios.append(0.0)
                    hourly_areas.append(0.0)
                    continue

                shadow_union = unary_union(circles)
                clipped_shadow = shadow_union.intersection(plot_polygon)
                shadow_area = float(clipped_shadow.area)
                shade_ratio = _clamp_ratio(shadow_area / plot_area_m2)
                hourly_ratios.append(shade_ratio)
                hourly_areas.append(shadow_area)

                if shade_ratio > peak_shade_ratio:
                    peak_shade_ratio = shade_ratio
                    peak_shade_hour_utc = sun_position["timestamp"][11:13] + ":00"

            shade_ratio_by_month.append(
                sum(hourly_ratios) / len(hourly_ratios) if hourly_ratios else 0.0
            )
            daily_shadow_areas.append(
                sum(hourly_areas) / len(hourly_areas) if hourly_areas else 0.0
            )
        except Exception as exc:
            logger.exception("Shade ratio computation failed for %s: %s", sample_day, exc)
            shade_ratio_by_month.append(0.0)
            daily_shadow_areas.append(0.0)

    annual_ratio = (
        sum(shade_ratio_by_month) / len(shade_ratio_by_month)
        if shade_ratio_by_month
        else 0.0
    )
    avg_shadow_area = (
        sum(daily_shadow_areas) / len(daily_shadow_areas)
        if daily_shadow_areas
        else 0.0
    )

    return {
        "shade_ratio_annual": _clamp_ratio(annual_ratio),
        "shade_ratio_by_month": [_clamp_ratio(value) for value in shade_ratio_by_month],
        "peak_shade_hour_utc": peak_shade_hour_utc,
        "total_shadow_area_m2": avg_shadow_area,
        "plot_area_m2": plot_area_m2,
        "sample_days": sample_days,
    }


def generate_shade_heatmap(
    plot_geojson: dict,
    tree_positions: list[dict],
    latitude: float,
    longitude: float,
    resolution_m: float = 5.0,
    sample_days: list[str] | None = None,
) -> dict:
    """
    Generate a grid-based shade heatmap for the plot.

    Creates a regular grid of points within the plot polygon
    (spacing = resolution_m meters), then for each grid point
    computes the fraction of daytime hours it falls within a
    shadow polygon across all sample days.
    """
    sample_days = sample_days or DEFAULT_SAMPLE_DAYS
    feature_collection = {
        "type": "FeatureCollection",
        "features": [],
        "metadata": {
            "resolution_m": resolution_m,
            "sample_days": sample_days,
            "point_count": 0,
        },
    }

    if resolution_m <= 0:
        logger.warning("resolution_m must be positive; returning empty heatmap.")
        return feature_collection

    try:
        plot_polygon, projection = _project_plot(plot_geojson)
        projected_trees = _project_tree_positions(tree_positions, projection)
    except Exception as exc:
        logger.exception("Could not initialize heatmap geometry: %s", exc)
        return feature_collection

    if not projected_trees:
        return feature_collection

    minx, miny, maxx, maxy = plot_polygon.bounds
    grid_points: list[Point] = []
    y = miny
    while y <= maxy:
        x = minx
        while x <= maxx:
            point = Point(x, y)
            if plot_polygon.contains(point) or plot_polygon.touches(point):
                grid_points.append(point)
            x += resolution_m
        y += resolution_m

    if not grid_points:
        return feature_collection

    shade_hits = [0 for _ in grid_points]
    total_daytime_steps = 0

    for sample_day in sample_days:
        try:
            sun_positions = get_sun_positions(latitude, longitude, sample_day)
            for sun_position in sun_positions:
                if not sun_position["is_daytime"]:
                    continue
                total_daytime_steps += 1
                circles = _shadow_circles_for_position(
                    sun_position,
                    projected_trees,
                    tree_canopy_radius_m=3.0,
                )
                if not circles:
                    continue
                shadow_union = unary_union(circles).intersection(plot_polygon)
                for index, point in enumerate(grid_points):
                    if shadow_union.contains(point) or shadow_union.touches(point):
                        shade_hits[index] += 1
        except Exception as exc:
            logger.exception("Heatmap computation failed for %s: %s", sample_day, exc)

    for point, hit_count in zip(grid_points, shade_hits):
        lng, lat = projection.to_wgs84.transform(point.x, point.y)
        shade_score = hit_count / total_daytime_steps if total_daytime_steps else 0.0
        feature_collection["features"].append(
            {
                "type": "Feature",
                "geometry": mapping(Point(lng, lat)),
                "properties": {"shade_score": _clamp_ratio(shade_score)},
            }
        )

    feature_collection["metadata"]["point_count"] = len(feature_collection["features"])
    return feature_collection
