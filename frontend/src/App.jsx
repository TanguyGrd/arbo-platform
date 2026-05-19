import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FeatureGroup, MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api/v1";

const COLORS = {
  forest: "#0F3D24",
  cream: "#FAF9F6",
  emerald: "#2ECC71",
  mint: "#E7F6EC",
  sand: "#F4EFE3",
  text: "#183B2A",
  muted: "#627466",
  danger: "#A33A3A",
  warning: "#C9801A",
  border: "rgba(15, 61, 36, 0.14)",
};

const BORDEAUX = [44.83, -0.53];
const SPECIES = ["chene", "noyer", "peuplier", "alisier"];
const SOLAR_SAMPLE_DAYS = ["2024-03-21", "2024-06-21", "2024-09-21", "2024-12-21"];

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("arbo_token") || "");
  const [user, setUser] = useState(() => readStoredUser());

  function handleAuthenticated(nextToken, nextUser) {
    localStorage.setItem("arbo_token", nextToken);
    localStorage.setItem("arbo_user", JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }

  function logout() {
    localStorage.removeItem("arbo_token");
    localStorage.removeItem("arbo_user");
    setToken("");
    setUser(null);
  }

  if (!token || !user) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  return <MainApp token={token} user={user} onLogout={logout} />;
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("farmer");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const isRegister = mode === "register";

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`${API_BASE}${isRegister ? "/auth/register" : "/auth/login-json"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isRegister ? { email, password, role } : { email, password }),
      });
      const data = await parseJson(response);
      if (!response.ok) {
        throw new Error(extractError(data, "Authentification impossible."));
      }
      onAuthenticated(data.access_token, data.user);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.authShell}>
      <section style={styles.authCard}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <p style={styles.logoKicker}>ARBO</p>
          <h1 style={styles.authTitle}>Plateforme agroforestière</h1>
          <p style={styles.authSubtitle}>Design parcellaire, diagnostic carbone et marketplace de crédits LBC.</p>
        </div>

        <div style={styles.authTabs}>
          <button type="button" onClick={() => setMode("login")} style={tabStyle(mode === "login")}>Connexion</button>
          <button type="button" onClick={() => setMode("register")} style={tabStyle(isRegister)}>Inscription</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
          <Field label="Email">
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="vous@entreprise.fr" required style={styles.input} />
          </Field>
          <Field label="Mot de passe">
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 8 caractères" minLength={8} required style={styles.input} />
          </Field>
          {isRegister && (
            <Field label="Type de compte">
              <select value={role} onChange={(event) => setRole(event.target.value)} style={styles.input}>
                <option value="farmer">Agriculteur</option>
                <option value="buyer">Acheteur RSE</option>
              </select>
            </Field>
          )}
          <button type="submit" disabled={loading} style={primaryButtonStyle(loading)}>
            {loading ? "Traitement..." : isRegister ? "Créer mon compte" : "Connexion"}
          </button>
        </form>

        {message && <p style={styles.errorText}>{message}</p>}
      </section>
    </main>
  );
}

function MainApp({ token, user, onLogout }) {
  const [farm, setFarm] = useState(null);
  const [marketplace, setMarketplace] = useState([]);
  const [plotGeojson, setPlotGeojson] = useState(null);
  const [lineGeojson, setLineGeojson] = useState(null);
  const [plotId, setPlotId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [diagnostic, setDiagnostic] = useState(null);
  const [solarResult, setSolarResult] = useState(null);
  const [transaction, setTransaction] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({
    species: "chene",
    interRowSpacingM: 10,
    intraRowSpacingM: 8,
    pricePerCreditEur: 35,
    durationYears: 20,
    treeHeightM: 8,
    canopyRadiusM: 3,
    resolutionM: 10,
  });
  const featureGroupRef = useRef(null);

  const isFarmer = user.role === "farmer" || user.role === "admin";
  const isBuyer = user.role === "buyer" || user.role === "admin";

  const apiRequest = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    const data = await parseJson(response);
    if (response.status === 401) {
      onLogout();
      throw new Error("Session expirée. Merci de vous reconnecter.");
    }
    if (!response.ok) {
      throw new Error(extractError(data, "Requête impossible."));
    }
    return data;
  }, [onLogout, token]);

  const refreshMarketplace = useCallback(async () => {
    try {
      const credits = await apiRequest("/marketplace/credits");
      setMarketplace(Array.isArray(credits) ? credits : []);
    } catch (error) {
      setError(errorMessage(error));
    }
  }, [apiRequest]);

  useEffect(() => {
    async function bootstrap() {
      setError("");
      try {
        if (isFarmer) {
          const farms = await apiRequest("/farms");
          if (farms.length > 0) {
            setFarm(farms[0]);
          } else {
            const createdFarm = await apiRequest("/farms", {
              method: "POST",
              body: JSON.stringify({ name: "Ferme principale", country_code: "FR", region: "Nouvelle-Aquitaine" }),
            });
            setFarm(createdFarm);
          }
        }
        await refreshMarketplace();
      } catch (error) {
        setError(errorMessage(error));
      }
    }
    bootstrap();
  }, [apiRequest, isFarmer, refreshMarketplace]);

  function onCreated(event) {
    const geojson = event.layer.toGeoJSON().geometry;
    if (event.layerType === "polygon") {
      setPlotGeojson(closePolygon(geojson));
      setDiagnostic(null);
      setSolarResult(null);
      setPlotId("");
      setProjectId("");
      setStatus("Parcelle dessinée. Dessinez maintenant un rang d'arbres.");
    }
    if (event.layerType === "polyline") {
      setLineGeojson(polylineToMultiLineString(geojson));
      setDiagnostic(null);
      setSolarResult(null);
      setStatus("Rang d'arbres dessiné. Vous pouvez lancer le diagnostic.");
    }
  }

  function updateSetting(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function runDiagnostic() {
    if (!farm) {
      setError("Aucune ferme disponible pour créer la parcelle.");
      return;
    }
    if (!plotGeojson || !lineGeojson) {
      setError("Dessinez une parcelle et un rang d'arbres avant de lancer le diagnostic.");
      return;
    }

    setLoading(true);
    setError("");
    setStatus("Création de la parcelle et calcul du diagnostic...");
    setSolarResult(null);
    setTransaction(null);

    try {
      const plot = await apiRequest("/plots", {
        method: "POST",
        body: JSON.stringify({
          farm_id: farm.id,
          name: `Parcelle ${new Date().toLocaleDateString("fr-FR")}`,
          geometry: plotGeojson,
          soil_type: "limon",
        }),
      });
      setPlotId(plot.id);

      await apiRequest("/tree-lines", {
        method: "POST",
        body: JSON.stringify({
          plot_id: plot.id,
          species: settings.species,
          geometry: lineGeojson,
          inter_row_spacing_m: Number(settings.interRowSpacingM),
          intra_row_spacing_m: Number(settings.intraRowSpacingM),
        }),
      });

      const diag = await apiRequest(`/diagnostics/plot/${plot.id}?duration_years=${settings.durationYears}&price_per_credit_eur=${settings.pricePerCreditEur}`);
      setDiagnostic(diag);
      setStatus("Diagnostic terminé.");
    } catch (error) {
      setError(errorMessage(error));
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  async function certifyAndPublish() {
    if (!farm || !plotId) {
      setError("Lancez d'abord un diagnostic pour créer une parcelle certifiable.");
      return;
    }

    setLoading(true);
    setError("");
    setStatus("Certification MVP et publication sur la marketplace...");

    try {
      const project = await apiRequest("/projects", {
        method: "POST",
        body: JSON.stringify({
          farm_id: farm.id,
          plot_id: plotId,
          name: `Projet carbone ${plotId.slice(0, 8)}`,
          price_per_credit_eur: Number(settings.pricePerCreditEur),
          project_duration_years: Number(settings.durationYears),
        }),
      });
      setProjectId(project.id);
      await apiRequest(`/projects/${project.id}/list-on-marketplace`, { method: "POST" });
      await refreshMarketplace();
      setStatus("Projet certifié MVP et crédits publiés sur la marketplace.");
    } catch (error) {
      setError(errorMessage(error));
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  async function simulateSolarShade() {
    if (!plotId) {
      setError("Lancez d'abord un diagnostic pour disposer d'un plot_id.");
      return;
    }

    setLoading(true);
    setError("");
    setStatus("☀️ Simulation solaire en cours (~5s)...");

    try {
      const result = await apiRequest(`/solar/simulate/${plotId}`, {
        method: "POST",
        body: JSON.stringify({
          sample_days: SOLAR_SAMPLE_DAYS,
          tree_height_m: Number(settings.treeHeightM),
          canopy_radius_m: Number(settings.canopyRadiusM),
          resolution_m: Number(settings.resolutionM),
        }),
      });
      setSolarResult(result);
      setStatus("Simulation solaire terminée.");
    } catch (error) {
      setError(errorMessage(error));
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  async function purchaseCredit(credit) {
    setLoading(true);
    setError("");
    setStatus("Achat du crédit en cours...");

    try {
      const tx = await apiRequest(`/marketplace/purchase/${credit.id}`, { method: "POST" });
      setTransaction(tx);
      await refreshMarketplace();
      setStatus("Crédit acheté et transaction enregistrée.");
    } catch (error) {
      setError(errorMessage(error));
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  function clearDrawingState() {
    setPlotGeojson(null);
    setLineGeojson(null);
    setPlotId("");
    setProjectId("");
    setDiagnostic(null);
    setSolarResult(null);
    setStatus("Dessins réinitialisés.");
    if (featureGroupRef.current) {
      featureGroupRef.current.clearLayers();
    }
  }

  return (
    <div style={styles.appShell}>
      <header style={styles.header}>
        <div>
          <p style={styles.headerKicker}>ARBO</p>
          <h1 style={styles.headerTitle}>Design agroforestier & crédits carbone</h1>
        </div>
        <div style={styles.userPill}>
          <span>{user.email}</span>
          <strong>{labelRole(user.role)}</strong>
          <button type="button" onClick={onLogout} style={styles.logoutButton}>Déconnexion</button>
        </div>
      </header>

      <main style={styles.dashboardGrid}>
        {isFarmer && (
          <section style={styles.mapCard}>
            <div style={styles.sectionHeader}>
              <div>
                <h2 style={styles.sectionTitle}>Carte de conception</h2>
                <p style={styles.sectionSubtitle}>Dessinez une parcelle puis un rang d'arbres avec les outils en haut à droite.</p>
              </div>
              <button type="button" onClick={clearDrawingState} style={styles.smallButton}>Réinitialiser</button>
            </div>
            <MapContainer center={BORDEAUX} zoom={13} style={styles.map} scrollWheelZoom>
              <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <FeatureGroup ref={featureGroupRef}>
                <EditControl
                  position="topright"
                  onCreated={onCreated}
                  draw={{
                    rectangle: false,
                    circle: false,
                    circlemarker: false,
                    marker: false,
                    polygon: { allowIntersection: false, showArea: true },
                    polyline: true,
                  }}
                />
              </FeatureGroup>
              {solarResult?.heatmap_geojson?.features?.map((feature, index) => (
                <CircleMarker
                  key={`${feature.geometry.coordinates.join("-")}-${index}`}
                  center={[feature.geometry.coordinates[1], feature.geometry.coordinates[0]]}
                  radius={5}
                  pathOptions={{
                    color: shadeColor(feature.properties.shade_score),
                    fillColor: shadeColor(feature.properties.shade_score),
                    fillOpacity: 0.72,
                    weight: 0,
                  }}
                >
                  <Popup>Ombrage : {Math.round(feature.properties.shade_score * 100)}%</Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </section>
        )}

        <aside style={isFarmer ? styles.sidePanel : styles.buyerPanel}>
          {isFarmer && (
            <>
              <DesignSettings settings={settings} updateSetting={updateSetting} farm={farm} plotGeojson={plotGeojson} lineGeojson={lineGeojson} />
              <div style={styles.actionStack}>
                <button type="button" disabled={loading} onClick={runDiagnostic} style={primaryButtonStyle(loading)}>Lancer le diagnostic</button>
                <button type="button" disabled={loading || !diagnostic} onClick={certifyAndPublish} style={secondaryButtonStyle(!diagnostic || loading)}>Certifier & publier</button>
                <button type="button" disabled={loading || !plotId} onClick={simulateSolarShade} style={primaryButtonStyle(loading || !plotId)}>Simuler ombrage solaire</button>
              </div>
            </>
          )}

          {status && <p style={styles.statusText}>{status}</p>}
          {error && <p style={styles.errorText}>{error}</p>}

          {isFarmer && diagnostic && <DiagnosticPanel diagnostic={diagnostic} projectId={projectId} />}
          {isFarmer && solarResult && <SolarPanel solarResult={solarResult} />}
          {transaction && <TransactionPanel transaction={transaction} />}
          <Marketplace credits={marketplace} canPurchase={isBuyer} onPurchase={purchaseCredit} loading={loading} />
        </aside>
      </main>

      <footer style={styles.footer}>
        MVP de démonstration. Les crédits carbone générés ne sont pas certifiés officiellement Label Bas-Carbone.
      </footer>
    </div>
  );
}

function DesignSettings({ settings, updateSetting, farm, plotGeojson, lineGeojson }) {
  return (
    <section style={styles.panelCard}>
      <h2 style={styles.panelTitle}>Paramètres de design</h2>
      <div style={styles.metaGrid}>
        <Badge label="Ferme" value={farm?.name || "Chargement"} />
        <Badge label="Parcelle" value={plotGeojson ? "Dessinée" : "À dessiner"} />
        <Badge label="Rang" value={lineGeojson ? "Dessiné" : "À dessiner"} />
      </div>
      <div style={styles.formGrid}>
        <Field label="Essence">
          <select value={settings.species} onChange={(event) => updateSetting("species", event.target.value)} style={styles.input}>
            {SPECIES.map((species) => <option key={species} value={species}>{speciesLabel(species)}</option>)}
          </select>
        </Field>
        <Field label="Espacement inter-rang (m)">
          <NumberInput value={settings.interRowSpacingM} onChange={(value) => updateSetting("interRowSpacingM", value)} />
        </Field>
        <Field label="Espacement intra-rang (m)">
          <NumberInput value={settings.intraRowSpacingM} onChange={(value) => updateSetting("intraRowSpacingM", value)} />
        </Field>
        <Field label="Prix par crédit (€)">
          <NumberInput value={settings.pricePerCreditEur} onChange={(value) => updateSetting("pricePerCreditEur", value)} />
        </Field>
        <Field label="Durée projet (années)">
          <NumberInput value={settings.durationYears} onChange={(value) => updateSetting("durationYears", value)} />
        </Field>
        <Field label="Hauteur arbres (m)">
          <NumberInput value={settings.treeHeightM} onChange={(value) => updateSetting("treeHeightM", value)} />
        </Field>
      </div>
    </section>
  );
}

function DiagnosticPanel({ diagnostic, projectId }) {
  const chartData = diagnostic.carbon.annual_curve_tco2.map((value, index) => ({ year: index + 1, tco2: value }));
  return (
    <section style={styles.panelCard}>
      <div style={styles.sectionHeaderCompact}>
        <h2 style={styles.panelTitle}>Diagnostic complet</h2>
        {projectId && <span style={styles.successBadge}>Projet publié</span>}
      </div>
      <div style={styles.statGrid}>
        <StatCard label="Surface" value={`${diagnostic.area_ha.toFixed(2)} ha`} />
        <StatCard label="Arbres" value={diagnostic.pac.total_trees} />
        <StatCard label="Densité" value={`${diagnostic.pac.density_per_ha.toFixed(1)}/ha`} badge={diagnostic.pac.compliant ? "PAC conforme" : "Non conforme"} danger={!diagnostic.pac.compliant} />
        <StatCard label="Carbone" value={`${diagnostic.carbon.total_tco2.toFixed(1)} tCO2`} />
      </div>
      <div style={{ height: 190, marginTop: 14 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="carbon" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.emerald} stopOpacity={0.8} />
                <stop offset="95%" stopColor={COLORS.emerald} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,61,36,0.12)" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => [`${Number(value).toFixed(2)} tCO2`, "Stock"]} labelFormatter={(year) => `Année ${year}`} />
            <Area type="monotone" dataKey="tco2" stroke={COLORS.forest} fillOpacity={1} fill="url(#carbon)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div style={styles.messageBox}>{diagnostic.pac.message}</div>
      {diagnostic.shade.map((shade, index) => (
        <div key={`${shade.orientation_deg}-${index}`} style={styles.messageBox}>
          <strong>Ombrage rang {index + 1} : {shade.risk_level}</strong><br />
          {shade.message}
        </div>
      ))}
      <div style={styles.revenueBox}>
        <span>Revenu estimé : <strong>{diagnostic.estimated_revenue_eur.toFixed(2)} €</strong></span>
        <span>Agriculteur 85% : <strong>{diagnostic.farmer_payout_eur.toFixed(2)} €</strong></span>
        <span>ARBO 15% : <strong>{diagnostic.platform_fee_eur.toFixed(2)} €</strong></span>
      </div>
    </section>
  );
}

function SolarPanel({ solarResult }) {
  const labels = ["Mars", "Juin", "Sept", "Déc"];
  return (
    <section style={styles.panelCard}>
      <h2 style={styles.panelTitle}>Heatmap solaire pvlib</h2>
      <div style={styles.statGrid}>
        <StatCard label="Ombrage annuel" value={`${Math.round(solarResult.shade_ratio_annual * 100)}%`} />
        <StatCard label="Pic UTC" value={solarResult.peak_shade_hour_utc || "N/A"} />
        <StatCard label="Points heatmap" value={solarResult.heatmap_geojson?.metadata?.point_count || 0} />
      </div>
      <p style={styles.messageBox}>{interpretShade(solarResult.shade_ratio_annual)}</p>
      <p style={styles.compactText}>
        {solarResult.shade_ratio_by_month.map((value, index) => `${labels[index] || `M${index + 1}`} ${Math.round(value * 100)}%`).join(" | ")}
      </p>
    </section>
  );
}

function Marketplace({ credits, canPurchase, onPurchase, loading }) {
  return (
    <section style={styles.panelCard}>
      <div style={styles.sectionHeaderCompact}>
        <h2 style={styles.panelTitle}>Marketplace carbone</h2>
        <span style={styles.countBadge}>{credits.length} crédits</span>
      </div>
      {credits.length === 0 ? (
        <p style={styles.compactText}>Aucun crédit disponible pour le moment.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {credits.slice(0, 20).map((credit) => (
            <article key={credit.id} style={styles.creditCard}>
              <div>
                <strong>{credit.serial_number}</strong>
                <p style={styles.compactText}>Vintage {credit.vintage_year} · {Number(credit.price_eur).toFixed(2)} € · {credit.status}</p>
              </div>
              {canPurchase && credit.status === "available" && (
                <button type="button" disabled={loading} onClick={() => onPurchase(credit)} style={styles.smallButton}>Acheter</button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function TransactionPanel({ transaction }) {
  return (
    <section style={styles.panelCard}>
      <h2 style={styles.panelTitle}>Transaction</h2>
      <div style={styles.revenueBox}>
        <span>Montant : <strong>{Number(transaction.amount_eur).toFixed(2)} €</strong></span>
        <span>Agriculteur : <strong>{Number(transaction.farmer_payout_eur).toFixed(2)} €</strong></span>
        <span>Commission ARBO : <strong>{Number(transaction.platform_fee_eur).toFixed(2)} €</strong></span>
        <span>Référence : <strong>{transaction.payment_reference}</strong></span>
      </div>
    </section>
  );
}

function Field({ label, children }) {
  return <label style={styles.field}><span>{label}</span>{children}</label>;
}

function NumberInput({ value, onChange }) {
  return <input type="number" min="0" step="0.1" value={value} onChange={(event) => onChange(Number(event.target.value))} style={styles.input} />;
}

function StatCard({ label, value, badge, danger }) {
  return (
    <div style={styles.statCard}>
      <span style={styles.statLabel}>{label}</span>
      <strong style={styles.statValue}>{value}</strong>
      {badge && <span style={danger ? styles.dangerBadge : styles.successBadge}>{badge}</span>}
    </div>
  );
}

function Badge({ label, value }) {
  return (
    <div style={styles.badgeBox}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function readStoredUser() {
  try {
    const raw = localStorage.getItem("arbo_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function parseJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractError(data, fallback) {
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail)) return data.detail.map((item) => item.msg || JSON.stringify(item)).join(" · ");
  if (data.detail) return JSON.stringify(data.detail);
  return fallback;
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function closePolygon(geometry) {
  const ring = [...geometry.coordinates[0]];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push(first);
  }
  return { type: "Polygon", coordinates: [ring] };
}

function polylineToMultiLineString(geometry) {
  if (geometry.type === "MultiLineString") return geometry;
  return { type: "MultiLineString", coordinates: [geometry.coordinates] };
}

function labelRole(role) {
  if (role === "farmer") return "Agriculteur";
  if (role === "buyer") return "Acheteur RSE";
  return "Administrateur";
}

function speciesLabel(species) {
  const labels = { chene: "Chêne", noyer: "Noyer", peuplier: "Peuplier", alisier: "Alisier" };
  return labels[species] || species;
}

function interpretShade(value) {
  if (value < 0.2) return "Excellente luminosité, culture sous couvert possible";
  if (value <= 0.4) return "Ombrage modéré, favorable aux cultures mi-ombre";
  return "Ombrage dense, réservez aux espèces tolérantes";
}

function shadeColor(score) {
  if (score > 0.66) return "#14532D";
  if (score > 0.33) return "#2ECC71";
  return "#F2C94C";
}

function tabStyle(active) {
  return {
    border: 0,
    borderRadius: 12,
    padding: 12,
    background: active ? COLORS.forest : "transparent",
    color: active ? COLORS.cream : COLORS.forest,
    fontWeight: 800,
    cursor: "pointer",
  };
}

function primaryButtonStyle(disabled) {
  return {
    border: 0,
    borderRadius: 16,
    padding: "14px 18px",
    background: disabled ? "#789486" : COLORS.forest,
    color: COLORS.cream,
    fontWeight: 800,
    fontSize: 15,
    cursor: disabled ? "wait" : "pointer",
  };
}

function secondaryButtonStyle(disabled) {
  return {
    border: `1px solid ${COLORS.border}`,
    borderRadius: 16,
    padding: "14px 18px",
    background: disabled ? "rgba(15,61,36,0.06)" : "white",
    color: disabled ? COLORS.muted : COLORS.forest,
    fontWeight: 800,
    fontSize: 15,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const styles = {
  authShell: {
    minHeight: "100vh",
    background: `radial-gradient(circle at top left, rgba(46, 204, 113, 0.20), transparent 32%), ${COLORS.forest}`,
    color: COLORS.text,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    fontFamily: "Inter, system-ui, sans-serif",
  },
  authCard: {
    width: "100%",
    maxWidth: 460,
    background: COLORS.cream,
    borderRadius: 28,
    padding: 36,
    boxShadow: "0 28px 80px rgba(0, 0, 0, 0.28)",
  },
  logoKicker: { margin: "0 0 10px", color: "#5C7C38", fontWeight: 900, letterSpacing: "0.18em" },
  authTitle: { margin: 0, fontSize: 34, lineHeight: 1.05 },
  authSubtitle: { margin: "12px 0 0", color: COLORS.muted },
  authTabs: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: "rgba(15,61,36,0.08)", borderRadius: 16, padding: 6, marginBottom: 24 },
  input: { width: "100%", border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "12px 14px", fontSize: 14, outline: "none", boxSizing: "border-box", background: "white" },
  field: { display: "grid", gap: 7, fontWeight: 800, color: COLORS.text, fontSize: 13 },
  errorText: { margin: "12px 0 0", color: COLORS.danger, fontWeight: 800 },
  statusText: { margin: 0, color: COLORS.forest, background: COLORS.mint, borderRadius: 14, padding: 12, fontWeight: 800 },
  appShell: { minHeight: "100vh", background: COLORS.cream, color: COLORS.text, fontFamily: "Inter, system-ui, sans-serif", padding: 20 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, marginBottom: 20, background: COLORS.forest, color: COLORS.cream, borderRadius: 24, padding: "18px 22px" },
  headerKicker: { margin: 0, letterSpacing: "0.2em", fontWeight: 900, color: COLORS.emerald },
  headerTitle: { margin: "4px 0 0", fontSize: 24 },
  userPill: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" },
  logoutButton: { border: "1px solid rgba(250,249,246,0.35)", background: "transparent", color: COLORS.cream, borderRadius: 999, padding: "9px 12px", cursor: "pointer", fontWeight: 800 },
  dashboardGrid: { display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(360px, 1fr)", gap: 20, alignItems: "start" },
  mapCard: { background: "white", border: `1px solid ${COLORS.border}`, borderRadius: 24, padding: 16, boxShadow: "0 16px 42px rgba(15,61,36,0.08)" },
  map: { width: "100%", height: "70vh", minHeight: 560, borderRadius: 18, overflow: "hidden" },
  sidePanel: { display: "grid", gap: 14 },
  buyerPanel: { maxWidth: 920, margin: "0 auto", display: "grid", gap: 14, width: "100%" },
  panelCard: { background: "white", border: `1px solid ${COLORS.border}`, borderRadius: 22, padding: 18, boxShadow: "0 14px 36px rgba(15,61,36,0.07)" },
  sectionHeader: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 },
  sectionHeaderCompact: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 },
  sectionTitle: { margin: 0, fontSize: 22 },
  sectionSubtitle: { margin: "5px 0 0", color: COLORS.muted },
  panelTitle: { margin: 0, fontSize: 19 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 },
  metaGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 },
  badgeBox: { background: COLORS.sand, borderRadius: 14, padding: 10, display: "grid", gap: 3, fontSize: 12 },
  actionStack: { display: "grid", gridTemplateColumns: "1fr", gap: 10 },
  statGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 },
  statCard: { background: COLORS.sand, borderRadius: 16, padding: 12, display: "grid", gap: 5 },
  statLabel: { fontSize: 12, color: COLORS.muted, fontWeight: 800 },
  statValue: { fontSize: 21, color: COLORS.forest },
  successBadge: { background: COLORS.mint, color: COLORS.forest, borderRadius: 999, padding: "5px 8px", fontSize: 12, fontWeight: 900 },
  dangerBadge: { background: "#FCE8E8", color: COLORS.danger, borderRadius: 999, padding: "5px 8px", fontSize: 12, fontWeight: 900 },
  countBadge: { background: COLORS.forest, color: COLORS.cream, borderRadius: 999, padding: "5px 9px", fontSize: 12, fontWeight: 900 },
  messageBox: { margin: "12px 0 0", background: "rgba(15,61,36,0.06)", borderRadius: 14, padding: 12, color: COLORS.text, lineHeight: 1.45 },
  revenueBox: { marginTop: 12, display: "grid", gap: 7, background: COLORS.mint, borderRadius: 14, padding: 12 },
  compactText: { margin: 0, color: COLORS.muted, fontSize: 13, lineHeight: 1.4 },
  creditCard: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 12 },
  smallButton: { border: 0, background: COLORS.forest, color: COLORS.cream, borderRadius: 999, padding: "9px 12px", fontWeight: 900, cursor: "pointer" },
  footer: { marginTop: 18, textAlign: "center", color: COLORS.muted, fontSize: 13 },
};

export default App;
