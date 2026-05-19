/**
 * ARBO Platform - Unified frontend (App.jsx)
 *
 * Single-file React component delivering:
 *   - Interactive Leaflet map with polygon (plot) and polyline (tree row)
 *     drawing tools.
 *   - Live design control panel: species, spacings, price, duration.
 *   - Server-computed diagnostic dashboard: PAC compliance, shade per
 *     row, 20-year sigmoid carbon projection, and 85/15 revenue split.
 *   - Marketplace simulator: lists available credits and executes mock
 *     purchases showing the platform commission split.
 *
 * Theme
 * -----
 *   Forest green background : #0F3D24
 *   Cream foreground        : #FAF9F6
 *   Emerald accent          : #2ECC71
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  FeatureGroup,
  Polygon as LeafletPolygon,
  Polyline as LeafletPolyline,
  useMap,
} from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_BASE =
  import.meta.env?.VITE_API_BASE || "http://localhost:8000/api/v1";

const COLORS = {
  forest: "#0F3D24",
  forestSoft: "#163E2A",
  cream: "#FAF9F6",
  emerald: "#2ECC71",
  emeraldSoft: "#1F8F4F",
  warning: "#F5A623",
  danger: "#E04C4C",
  mute: "#8FA59A",
};

const SPECIES_OPTIONS = [
  { key: "chene", label: "Chêne" },
  { key: "noyer", label: "Noyer" },
  { key: "peuplier", label: "Peuplier" },
  { key: "alisier", label: "Alisier" },
];

// Centered on Floirac / Bordeaux right bank — adjust as needed.
const DEFAULT_CENTER = [44.83, -0.53];
const DEFAULT_ZOOM = 15;

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`POST ${path} failed (${res.status}): ${detail}`);
  }
  return res.json();
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`GET ${path} failed (${res.status}): ${detail}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Geometry adapters: Leaflet <-> GeoJSON
// ---------------------------------------------------------------------------

function polygonLayerToGeoJSON(layer) {
  const latlngs = layer.getLatLngs()[0];
  const ring = latlngs.map(({ lat, lng }) => [lng, lat]);
  if (ring.length > 0) {
    const [fx, fy] = ring[0];
    const [lx, ly] = ring[ring.length - 1];
    if (fx !== lx || fy !== ly) ring.push([fx, fy]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

function polylineLayerToGeoJSON(layer) {
  const latlngs = layer.getLatLngs();
  const line = latlngs.map(({ lat, lng }) => [lng, lat]);
  return { type: "MultiLineString", coordinates: [line] };
}

function geoJSONPolygonToLatLngs(geojson) {
  if (!geojson || geojson.type !== "Polygon") return [];
  return geojson.coordinates[0].map(([lng, lat]) => [lat, lng]);
}

function geoJSONLineToLatLngs(geojson) {
  if (!geojson || geojson.type !== "MultiLineString") return [];
  return geojson.coordinates.map((line) => line.map(([lng, lat]) => [lat, lng]));
}

// ---------------------------------------------------------------------------
// Map helper component — fits bounds to a GeoJSON polygon after persistence.
// Must be a child of MapContainer to access the map instance via useMap().
// ---------------------------------------------------------------------------

function FitToPolygon({ polygonGeoJSON }) {
  const map = useMap();
  useEffect(() => {
    if (!polygonGeoJSON) return;
    const latlngs = geoJSONPolygonToLatLngs(polygonGeoJSON);
    if (latlngs.length === 0) return;
    try {
      map.fitBounds(latlngs, { padding: [40, 40] });
    } catch (_err) {
      // Silently ignore if bounds are degenerate
    }
  }, [polygonGeoJSON, map]);
  return null;
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function StatCard({ label, value, unit, accent }) {
  return (
    <div
      className="rounded-lg p-3 flex flex-col"
      style={{
        backgroundColor: COLORS.forestSoft,
        border: `1px solid ${accent || COLORS.emeraldSoft}`,
      }}
    >
      <span
        className="text-xs uppercase tracking-wider"
        style={{ color: COLORS.mute }}
      >
        {label}
      </span>
      <span
        className="text-lg font-semibold"
        style={{ color: COLORS.cream }}
      >
        {value}
        {unit && (
          <span className="text-sm ml-1" style={{ color: COLORS.mute }}>
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}

function Badge({ children, level }) {
  const colorMap = {
    low: COLORS.emerald,
    medium: COLORS.warning,
    high: COLORS.danger,
    good: COLORS.emerald,
    suboptimal: COLORS.warning,
    critical: COLORS.danger,
    compliant: COLORS.emerald,
    "non-compliant": COLORS.danger,
  };
  const bg = colorMap[level] || COLORS.mute;
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: bg, color: COLORS.forest }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function App() {
  // -- Identity (MVP: auto-bootstrap a farmer + a buyer) ------------------
  const [farmer, setFarmer] = useState(null);
  const [buyer, setBuyer] = useState(null);
  const [farm, setFarm] = useState(null);

  // -- Map state ----------------------------------------------------------
  const [plotGeoJSON, setPlotGeoJSON] = useState(null);
  const [persistedPlot, setPersistedPlot] = useState(null);
  const [lineGeoJSON, setLineGeoJSON] = useState(null);
  const [persistedLine, setPersistedLine] = useState(null);
  const featureGroupRef = useRef(null);

  // -- Design parameters --------------------------------------------------
  const [species, setSpecies] = useState("chene");
  const [interRowSpacing, setInterRowSpacing] = useState(10);
  const [intraRowSpacing, setIntraRowSpacing] = useState(8);
  const [pricePerCredit, setPricePerCredit] = useState(35);
  const [durationYears, setDurationYears] = useState(20);

  // -- Diagnostic / Project state ----------------------------------------
  const [diagnostic, setDiagnostic] = useState(null);
  const [project, setProject] = useState(null);
  const [marketCredits, setMarketCredits] = useState([]);
  const [latestPurchase, setLatestPurchase] = useState(null);

  // -- UX state ----------------------------------------------------------
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(
    "Bienvenue sur ARBO. Tracez d'abord un polygone de parcelle, puis une ligne d'arbres."
  );

  // -- Bootstrap users + farm on first mount -----------------------------
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const f = await apiPost("/users", {
          email: `farmer-${Date.now()}@arbo.demo`,
          password: "demo-password-12",
          full_name: "Agriculteur Démo",
          role: "farmer",
        });
        const b = await apiPost("/users", {
          email: `buyer-${Date.now()}@arbo.demo`,
          password: "demo-password-12",
          full_name: "Acheteur RSE Démo",
          role: "buyer",
        });
        const farmObj = await apiPost(`/farms?owner_id=${f.id}`, {
          name: "Ferme Démo",
          country_code: "FR",
          region: "Nouvelle-Aquitaine",
        });
        if (!cancelled) {
          setFarmer(f);
          setBuyer(b);
          setFarm(farmObj);
          setInfo(
            `Compte agriculteur prêt (${f.email}). Tracez votre première parcelle.`
          );
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            "Impossible de joindre l'API. Vérifiez que le backend tourne sur " +
              API_BASE +
              "."
          );
        }
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  // -- Drawing handlers --------------------------------------------------
  const handleCreated = useCallback((e) => {
    const layer = e.layer;
    if (e.layerType === "polygon") {
      const gj = polygonLayerToGeoJSON(layer);
      setPlotGeoJSON(gj);
      setPersistedPlot(null);
      setDiagnostic(null);
      setProject(null);
      setInfo("Parcelle tracée. Tracez maintenant une ligne d'arbres.");
    } else if (e.layerType === "polyline") {
      const gj = polylineLayerToGeoJSON(layer);
      setLineGeoJSON(gj);
      setPersistedLine(null);
      setDiagnostic(null);
      setProject(null);
      setInfo("Rang d'arbres tracé. Lancez le diagnostic dans le panneau.");
    }
  }, []);

  const handleDeleted = useCallback(() => {
    setPlotGeoJSON(null);
    setLineGeoJSON(null);
    setPersistedPlot(null);
    setPersistedLine(null);
    setDiagnostic(null);
    setProject(null);
  }, []);

  // -- Action: persist drawings + compute diagnostic ---------------------
  const runDiagnostic = async () => {
    setError(null);
    if (!farm) {
      setError("Aucune ferme n'est encore prête.");
      return;
    }
    if (!plotGeoJSON) {
      setError("Tracez d'abord un polygone de parcelle.");
      return;
    }
    if (!lineGeoJSON) {
      setError("Tracez au moins une ligne d'arbres dans la parcelle.");
      return;
    }
    setBusy(true);
    try {
      const plot = await apiPost("/plots", {
        farm_id: farm.id,
        name: "Parcelle Démo",
        geometry: plotGeoJSON,
        soil_type: "limon",
      });
      setPersistedPlot(plot);

      const line = await apiPost("/tree-lines", {
        plot_id: plot.id,
        species,
        geometry: lineGeoJSON,
        inter_row_spacing_m: Number(interRowSpacing),
        intra_row_spacing_m: Number(intraRowSpacing),
      });
      setPersistedLine(line);

      const diag = await apiGet(
        `/diagnostics/plot/${plot.id}?duration_years=${durationYears}` +
          `&price_per_credit_eur=${pricePerCredit}`
      );
      setDiagnostic(diag);
      setInfo("Diagnostic prêt. Vous pouvez certifier et publier sur le marché.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // -- Action: create + list a carbon project ---------------------------
  const certifyAndList = async () => {
    setError(null);
    if (!persistedPlot || !diagnostic) {
      setError("Lancez d'abord un diagnostic complet.");
      return;
    }
    setBusy(true);
    try {
      const proj = await apiPost("/projects", {
        farm_id: farm.id,
        plot_id: persistedPlot.id,
        name: "Projet Démo ARBO",
        price_per_credit_eur: Number(pricePerCredit),
        project_duration_years: Number(durationYears),
      });
      const listed = await apiPost(
        `/projects/${proj.id}/list-on-marketplace`,
        {}
      );
      setProject(listed);

      const credits = await apiGet("/marketplace/credits");
      setMarketCredits(credits);
      setInfo(
        `Projet certifié et publié. ${credits.length} crédit(s) disponibles sur le marché.`
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // -- Action: simulate a credit purchase -------------------------------
  const buyOne = async () => {
    setError(null);
    if (!buyer) {
      setError("Aucun acheteur configuré.");
      return;
    }
    const next = marketCredits.find((c) => c.status === "available");
    if (!next) {
      setError("Aucun crédit disponible — publiez d'abord un projet.");
      return;
    }
    setBusy(true);
    try {
      const tx = await apiPost("/marketplace/purchase", {
        buyer_id: buyer.id,
        credit_id: next.id,
      });
      setLatestPurchase(tx);
      const refreshed = await apiGet("/marketplace/credits");
      setMarketCredits(refreshed);
      setInfo(
        `Crédit ${next.serial_number} acheté. Commission ARBO : ${tx.platform_fee_eur} €.`
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // -- Derived display values -------------------------------------------
  const chartData = useMemo(() => {
    if (!diagnostic) return [];
    return diagnostic.carbon.annual_curve_tco2.map((tco2, i) => ({
      year: i + 1,
      tCO2: Number(tco2.toFixed(2)),
    }));
  }, [diagnostic]);

  const availableCount = marketCredits.filter(
    (c) => c.status === "available"
  ).length;

  // -- Render ------------------------------------------------------------
  return (
    <div
      className="min-h-screen w-full"
      style={{ backgroundColor: COLORS.forest, color: COLORS.cream }}
    >
      <header
        className="px-6 py-4 flex items-center justify-between border-b"
        style={{ borderColor: COLORS.emeraldSoft }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-xl font-black"
            style={{ backgroundColor: COLORS.emerald, color: COLORS.forest }}
          >
            A
          </div>
          <div>
            <h1
              className="text-xl font-bold tracking-tight"
              style={{ color: COLORS.cream }}
            >
              ARBO
            </h1>
            <p className="text-xs" style={{ color: COLORS.mute }}>
              Agroforesterie × FinTech carbone — MVP
            </p>
          </div>
        </div>
        <div className="text-sm" style={{ color: COLORS.mute }}>
          {farmer ? `👤 ${farmer.full_name}` : "Initialisation..."}
        </div>
      </header>

      <div
        className="px-6 py-2 text-sm flex items-center justify-between"
        style={{ backgroundColor: COLORS.forestSoft }}
      >
        <span>{error ? `⚠️ ${error}` : info}</span>
        {busy && <span style={{ color: COLORS.emerald }}>⏳ Traitement...</span>}
      </div>

      <main className="grid grid-cols-12 gap-4 p-4">
        <section
          className="col-span-12 lg:col-span-8 rounded-xl overflow-hidden border"
          style={{ borderColor: COLORS.emeraldSoft, height: "70vh" }}
        >
          <MapContainer
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FeatureGroup ref={featureGroupRef}>
              <EditControl
                position="topright"
                onCreated={handleCreated}
                onDeleted={handleDeleted}
                draw={{
                  rectangle: false,
                  circle: false,
                  circlemarker: false,
                  marker: false,
                  polygon: {
                    shapeOptions: { color: COLORS.emerald, weight: 3 },
                  },
                  polyline: {
                    shapeOptions: { color: COLORS.cream, weight: 4 },
                  },
                }}
              />
            </FeatureGroup>

            {persistedPlot && (
              <>
                <LeafletPolygon
                  positions={geoJSONPolygonToLatLngs(persistedPlot.geometry)}
                  pathOptions={{ color: COLORS.emerald, fillOpacity: 0.15 }}
                />
                <FitToPolygon polygonGeoJSON={persistedPlot.geometry} />
              </>
            )}
            {persistedLine &&
              geoJSONLineToLatLngs(persistedLine.geometry).map((line, idx) => (
                <LeafletPolyline
                  key={idx}
                  positions={line}
                  pathOptions={{ color: COLORS.cream, weight: 4 }}
                />
              ))}
          </MapContainer>
        </section>

        <aside className="col-span-12 lg:col-span-4 flex flex-col gap-4">
          <div
            className="rounded-xl p-4 border"
            style={{
              backgroundColor: COLORS.forestSoft,
              borderColor: COLORS.emeraldSoft,
            }}
          >
            <h2
              className="text-sm font-bold uppercase tracking-wider mb-3"
              style={{ color: COLORS.emerald }}
            >
              Paramètres de design
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <label
                className="flex flex-col text-xs"
                style={{ color: COLORS.mute }}
              >
                Essence
                <select
                  value={species}
                  onChange={(e) => setSpecies(e.target.value)}
                  className="mt-1 rounded px-2 py-1 text-sm"
                  style={{
                    backgroundColor: COLORS.forest,
                    color: COLORS.cream,
                    border: `1px solid ${COLORS.emeraldSoft}`,
                  }}
                >
                  {SPECIES_OPTIONS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label
                className="flex flex-col text-xs"
                style={{ color: COLORS.mute }}
              >
                Durée projet (ans)
                <input
                  type="number"
                  min={5}
                  max={50}
                  value={durationYears}
                  onChange={(e) => setDurationYears(e.target.value)}
                  className="mt-1 rounded px-2 py-1 text-sm"
                  style={{
                    backgroundColor: COLORS.forest,
                    color: COLORS.cream,
                    border: `1px solid ${COLORS.emeraldSoft}`,
                  }}
                />
              </label>
              <label
                className="flex flex-col text-xs"
                style={{ color: COLORS.mute }}
              >
                Inter-rang (m)
                <input
                  type="number"
                  step="0.5"
                  min={1}
                  value={interRowSpacing}
                  onChange={(e) => setInterRowSpacing(e.target.value)}
                  className="mt-1 rounded px-2 py-1 text-sm"
                  style={{
                    backgroundColor: COLORS.forest,
                    color: COLORS.cream,
                    border: `1px solid ${COLORS.emeraldSoft}`,
                  }}
                />
              </label>
              <label
                className="flex flex-col text-xs"
                style={{ color: COLORS.mute }}
              >
                Intra-rang (m)
                <input
                  type="number"
                  step="0.5"
                  min={1}
                  value={intraRowSpacing}
                  onChange={(e) => setIntraRowSpacing(e.target.value)}
                  className="mt-1 rounded px-2 py-1 text-sm"
                  style={{
                    backgroundColor: COLORS.forest,
                    color: COLORS.cream,
                    border: `1px solid ${COLORS.emeraldSoft}`,
                  }}
                />
              </label>
              <label
                className="flex flex-col text-xs col-span-2"
                style={{ color: COLORS.mute }}
              >
                Prix par crédit carbone (€)
                <input
                  type="number"
                  step="1"
                  min={1}
                  value={pricePerCredit}
                  onChange={(e) => setPricePerCredit(e.target.value)}
                  className="mt-1 rounded px-2 py-1 text-sm"
                  style={{
                    backgroundColor: COLORS.forest,
                    color: COLORS.cream,
                    border: `1px solid ${COLORS.emeraldSoft}`,
                  }}
                />
              </label>
            </div>
            <button
              onClick={runDiagnostic}
              disabled={busy || !plotGeoJSON || !lineGeoJSON}
              className="w-full mt-4 py-2 rounded-lg font-bold text-sm disabled:opacity-50"
              style={{ backgroundColor: COLORS.emerald, color: COLORS.forest }}
            >
              Lancer le diagnostic
            </button>
          </div>

          {diagnostic && (
            <div
              className="rounded-xl p-4 border"
              style={{
                backgroundColor: COLORS.forestSoft,
                borderColor: COLORS.emeraldSoft,
              }}
            >
              <h2
                className="text-sm font-bold uppercase tracking-wider mb-3"
                style={{ color: COLORS.emerald }}
              >
                Diagnostic
              </h2>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <StatCard
                  label="Surface"
                  value={diagnostic.area_ha.toFixed(2)}
                  unit="ha"
                />
                <StatCard label="Arbres" value={diagnostic.pac.total_trees} />
                <StatCard
                  label="Densité"
                  value={diagnostic.pac.density_per_ha.toFixed(0)}
                  unit="/ha"
                  accent={
                    diagnostic.pac.compliant ? COLORS.emerald : COLORS.danger
                  }
                />
                <StatCard
                  label="tCO₂ (20 ans)"
                  value={diagnostic.carbon.total_tco2.toFixed(1)}
                />
              </div>

              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-xs uppercase tracking-wider"
                    style={{ color: COLORS.mute }}
                  >
                    Conformité PAC
                  </span>
                  <Badge
                    level={diagnostic.pac.compliant ? "compliant" : "non-compliant"}
                  >
                    {diagnostic.pac.compliant ? "Conforme" : "Non conforme"}
                  </Badge>
                </div>
                <p className="text-xs" style={{ color: COLORS.cream }}>
                  {diagnostic.pac.message}
                </p>
              </div>

              <div className="mb-3">
                <span
                  className="text-xs uppercase tracking-wider"
                  style={{ color: COLORS.mute }}
                >
                  Ombrage par rang
                </span>
                {diagnostic.shade.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 mt-2">
                    <Badge level={s.risk_level}>{s.spacing_status}</Badge>
                    <p className="text-xs" style={{ color: COLORS.cream }}>
                      {s.message}
                    </p>
                  </div>
                ))}
              </div>

              <div style={{ height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 5, right: 10, left: -15, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={COLORS.emeraldSoft}
                    />
                    <XAxis dataKey="year" stroke={COLORS.mute} fontSize={10} />
                    <YAxis stroke={COLORS.mute} fontSize={10} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: COLORS.forest,
                        border: `1px solid ${COLORS.emerald}`,
                        color: COLORS.cream,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="tCO2"
                      stroke={COLORS.emerald}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div
                className="mt-3 p-3 rounded-lg"
                style={{
                  backgroundColor: COLORS.forest,
                  border: `1px dashed ${COLORS.emerald}`,
                }}
              >
                <div className="flex justify-between text-xs mb-1">
                  <span style={{ color: COLORS.mute }}>Revenu brut estimé</span>
                  <span className="font-mono">
                    {diagnostic.estimated_revenue_eur.toLocaleString("fr-FR")} €
                  </span>
                </div>
                <div className="flex justify-between text-xs mb-1">
                  <span style={{ color: COLORS.mute }}>
                    Reversé à l'agriculteur (85 %)
                  </span>
                  <span
                    className="font-mono"
                    style={{ color: COLORS.emerald }}
                  >
                    {diagnostic.farmer_payout_eur.toLocaleString("fr-FR")} €
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: COLORS.mute }}>
                    Commission ARBO (15 %)
                  </span>
                  <span className="font-mono">
                    {diagnostic.platform_fee_eur.toLocaleString("fr-FR")} €
                  </span>
                </div>
              </div>

              <button
                onClick={certifyAndList}
                disabled={busy || project !== null}
                className="w-full mt-3 py-2 rounded-lg font-bold text-sm disabled:opacity-50"
                style={{ backgroundColor: COLORS.cream, color: COLORS.forest }}
              >
                {project ? "✓ Projet publié" : "Certifier & publier sur le marché"}
              </button>
            </div>
          )}

          {project && (
            <div
              className="rounded-xl p-4 border"
              style={{
                backgroundColor: COLORS.forestSoft,
                borderColor: COLORS.emeraldSoft,
              }}
            >
              <h2
                className="text-sm font-bold uppercase tracking-wider mb-3"
                style={{ color: COLORS.emerald }}
              >
                Marché secondaire
              </h2>
              <div className="text-xs mb-2" style={{ color: COLORS.mute }}>
                {availableCount} crédit(s) disponible(s) — méthodologie{" "}
                {project.methodology}
              </div>
              <button
                onClick={buyOne}
                disabled={busy || availableCount === 0}
                className="w-full py-2 rounded-lg font-bold text-sm disabled:opacity-50"
                style={{ backgroundColor: COLORS.emerald, color: COLORS.forest }}
              >
                Acheter 1 crédit (simulation RSE)
              </button>

              {latestPurchase && (
                <div
                  className="mt-3 p-2 rounded text-xs"
                  style={{ backgroundColor: COLORS.forest }}
                >
                  <div className="flex justify-between">
                    <span style={{ color: COLORS.mute }}>Dernier achat</span>
                    <span className="font-mono">
                      {latestPurchase.payment_reference}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: COLORS.mute }}>Montant brut</span>
                    <span className="font-mono">
                      {Number(latestPurchase.amount_eur).toFixed(2)} €
                    </span>
                  </div>
                  <div
                    className="flex justify-between"
                    style={{ color: COLORS.emerald }}
                  >
                    <span>Reversé agriculteur</span>
                    <span className="font-mono">
                      {Number(latestPurchase.farmer_payout_eur).toFixed(2)} €
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: COLORS.mute }}>Commission ARBO</span>
                    <span className="font-mono">
                      {Number(latestPurchase.platform_fee_eur).toFixed(2)} €
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </main>

      <footer
        className="px-6 py-3 text-xs text-center border-t"
        style={{ borderColor: COLORS.emeraldSoft, color: COLORS.mute }}
      >
        ARBO MVP — Les crédits affichés sont simulés et ne constituent pas une
        certification Label Bas-Carbone officielle.
      </footer>
    </div>
  );
}
