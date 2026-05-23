import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FeatureGroup,
  MapContainer,
  Marker,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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

  const logout = useCallback(() => {
    localStorage.removeItem("arbo_token");
    localStorage.removeItem("arbo_user");
    setToken("");
    setUser(null);
  }, []);

  if (!token || !user) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  if (user.role === "buyer") {
    return <BuyerApp token={token} user={user} onLogout={logout} />;
  }

  return <FarmerApp token={token} user={user} onLogout={logout} />;
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
          <p style={styles.authSubtitle}>Design agricole pour les farmers, marketplace carbone pour les buyers.</p>
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

function FarmerApp({ token, user, onLogout }) {
  const [activeTab, setActiveTab] = useState("design");
  const [farm, setFarm] = useState(null);
  const [plotGeojson, setPlotGeojson] = useState(null);
  const [lineGeojson, setLineGeojson] = useState(null);
  const [plotId, setPlotId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [diagnostic, setDiagnostic] = useState(null);
  const [solarResult, setSolarResult] = useState(null);
  const [listings, setListings] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [focusedPlot, setFocusedPlot] = useState(null);
  const [editingListing, setEditingListing] = useState(null);
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

  const apiRequest = useApi(token, onLogout);

  const refreshFarmerData = useCallback(async () => {
    const [projects, stats] = await Promise.all([
      apiRequest("/farmer/projects"),
      apiRequest("/farmer/dashboard"),
    ]);
    setListings(Array.isArray(projects) ? projects : []);
    setDashboard(stats);
  }, [apiRequest]);

  useEffect(() => {
    async function bootstrap() {
      setError("");
      try {
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
        await refreshFarmerData();
      } catch (error) {
        setError(errorMessage(error));
      }
    }
    bootstrap();
  }, [apiRequest, refreshFarmerData]);

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
      const listed = await apiRequest(`/projects/${project.id}/list-on-marketplace`, { method: "POST" });
      await refreshFarmerData();
      const available = Math.floor(Number(listed.estimated_tco2 || 0));
      setStatus(`✅ Crédits publiés sur la marketplace - ${available} crédits disponibles à la vente`);
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
    setStatus("☀️ Simulation solaire en cours...");

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

  async function updateListingPrice(listing, nextPrice) {
    setLoading(true);
    setError("");
    try {
      await apiRequest(`/projects/${listing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ price_per_credit_eur: Number(nextPrice) }),
      });
      await refreshFarmerData();
      setEditingListing(null);
      setStatus("Prix de l'annonce mis à jour.");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function withdrawListing(listing) {
    setLoading(true);
    setError("");
    try {
      await apiRequest(`/projects/${listing.id}/withdraw`, { method: "POST" });
      await refreshFarmerData();
      setStatus("Annonce retirée de la marketplace.");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function relistListing(listing) {
    setLoading(true);
    setError("");
    try {
      await apiRequest(`/projects/${listing.id}/relist`, { method: "POST" });
      await refreshFarmerData();
      setStatus("Annonce remise sur la marketplace.");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function viewPlot(listing) {
    if (listing.plot_geometry) {
      setFocusedPlot(listing.plot_geometry);
      setActiveTab("design");
      setStatus("Carte centrée sur la parcelle sélectionnée.");
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
    featureGroupRef.current?.clearLayers();
  }

  const latestSale = dashboard?.recent_transactions?.[0];

  return (
    <Shell user={user} badge="Agriculteur" onLogout={onLogout} tabs={[
      ["design", "Carte de conception"],
      ["listings", "Mes annonces"],
      ["dashboard", "Tableau de bord"],
    ]} activeTab={activeTab} setActiveTab={setActiveTab}>
      {status && <Toast>{status}</Toast>}
      {error && <p style={styles.errorText}>{error}</p>}

      {activeTab === "design" && (
        <main style={styles.dashboardGrid}>
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
              <MapFocus geometry={focusedPlot} />
              <FeatureGroup ref={featureGroupRef}>
                <EditControl
                  position="topright"
                  onCreated={onCreated}
                  draw={{
                    rectangle: false,
                    circle: false,
                    circlemarker: false,
                    marker: false,
                    polygon: {
                      shapeOptions: { color: "#2ECC71", weight: 3 },
                      showArea: true,
                      metric: true,
                      feet: false,
                      nautic: false,
                      repeatMode: false,
                      allowIntersection: false,
                      finishOn: "click",
                    },
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

          <aside style={styles.sidePanel}>
            <DesignSettings settings={settings} updateSetting={updateSetting} farm={farm} plotGeojson={plotGeojson} lineGeojson={lineGeojson} />
            <div style={styles.actionStack}>
              <button type="button" disabled={loading} onClick={runDiagnostic} style={primaryButtonStyle(loading)}>Lancer le diagnostic</button>
              <button type="button" disabled={loading || !diagnostic} onClick={certifyAndPublish} style={secondaryButtonStyle(!diagnostic || loading)}>Certifier & publier</button>
              <button type="button" disabled={loading || !plotId} onClick={simulateSolarShade} style={primaryButtonStyle(loading || !plotId)}>Simuler ombrage solaire</button>
            </div>
            {diagnostic && <DiagnosticPanel diagnostic={diagnostic} projectId={projectId} />}
            {solarResult && <SolarPanel solarResult={solarResult} />}
            {latestSale && <FarmerSalePanel transaction={latestSale} />}
          </aside>
        </main>
      )}

      {activeTab === "listings" && (
        <FarmerListings listings={listings} loading={loading} onEdit={setEditingListing} onWithdraw={withdrawListing} onRelist={relistListing} onViewPlot={viewPlot} />
      )}

      {activeTab === "dashboard" && (
        <FarmerDashboard dashboard={dashboard} />
      )}

      {editingListing && (
        <PriceModal listing={editingListing} loading={loading} onClose={() => setEditingListing(null)} onSave={updateListingPrice} />
      )}
    </Shell>
  );
}

function BuyerApp({ token, user, onLogout }) {
  const [activeTab, setActiveTab] = useState("marketplace");
  const [credits, setCredits] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [mapFocus, setMapFocus] = useState(null);
  const [filters, setFilters] = useState(defaultFilters());
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const apiRequest = useApi(token, onLogout);

  const refreshBuyerData = useCallback(async () => {
    const [market, stats] = await Promise.all([
      apiRequest("/marketplace/credits"),
      apiRequest("/buyer/dashboard"),
    ]);
    setCredits(Array.isArray(market) ? market : []);
    setDashboard(stats);
  }, [apiRequest]);

  useEffect(() => {
    refreshBuyerData().catch((error) => setError(errorMessage(error)));
  }, [refreshBuyerData]);

  const filteredCredits = useMemo(() => {
    return credits.filter((credit) => {
      const price = Number(credit.price_eur);
      const duration = Number(credit.project_duration_years);
      const region = (credit.farm_region || "").toLowerCase();
      return (
        (filters.species === "all" || credit.species === filters.species) &&
        (!filters.region || region.includes(filters.region.toLowerCase())) &&
        (!filters.priceMin || price >= Number(filters.priceMin)) &&
        (!filters.priceMax || price <= Number(filters.priceMax)) &&
        (!filters.durationMin || duration >= Number(filters.durationMin)) &&
        (!filters.durationMax || duration <= Number(filters.durationMax))
      );
    });
  }, [credits, filters]);

  async function purchaseCredit(credit) {
    setLoading(true);
    setError("");
    setStatus("Achat du crédit en cours...");
    try {
      await apiRequest(`/marketplace/purchase/${credit.id}`, { method: "POST" });
      await refreshBuyerData();
      setStatus("Crédit acheté et ajouté à Mes crédits.");
      setActiveTab("credits");
    } catch (error) {
      setError(errorMessage(error));
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  async function openCertificate(creditId) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/credits/${creditId}/certificate`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const html = await response.text();
      if (!response.ok) {
        throw new Error(extractError(safeJson(html), "Certificat indisponible."));
      }
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      window.open(url, "_blank", "noopener,noreferrer");
      setStatus("Certificat ouvert dans un nouvel onglet.");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function focusCreditPlot(credit) {
    if (credit.plot_geometry) {
      setMapFocus(credit.plot_geometry);
      setStatus("Carte centrée sur la parcelle marketplace.");
    }
  }

  return (
    <Shell user={user} badge="Acheteur RSE" onLogout={onLogout} tabs={[
      ["marketplace", "Marketplace"],
      ["credits", "Mes crédits"],
    ]} activeTab={activeTab} setActiveTab={setActiveTab}>
      {status && <Toast>{status}</Toast>}
      {error && <p style={styles.errorText}>{error}</p>}

      {activeTab === "marketplace" && (
        <BuyerMarketplace
          credits={filteredCredits}
          filters={filters}
          setFilters={setFilters}
          resetFilters={() => setFilters(defaultFilters())}
          loading={loading}
          onPurchase={purchaseCredit}
          onViewPlot={focusCreditPlot}
          mapFocus={mapFocus}
        />
      )}

      {activeTab === "credits" && (
        <BuyerCredits dashboard={dashboard} loading={loading} onCertificate={openCertificate} />
      )}
    </Shell>
  );
}

function Shell({ user, badge, onLogout, tabs, activeTab, setActiveTab, children }) {
  return (
    <div style={styles.appShell}>
      <header style={styles.header}>
        <div>
          <p style={styles.headerKicker}>ARBO</p>
          <h1 style={styles.headerTitle}>Plateforme carbone agroforestière</h1>
        </div>
        <div style={styles.userPill}>
          <span>{user.email}</span>
          <strong style={styles.roleBadge}>{badge}</strong>
          <button type="button" onClick={onLogout} style={styles.logoutButton}>Déconnexion</button>
        </div>
      </header>
      <nav style={styles.topTabs}>
        {tabs.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setActiveTab(key)} style={topTabStyle(activeTab === key)}>
            {label}
          </button>
        ))}
      </nav>
      {children}
      <footer style={styles.footer}>MVP de démonstration. Les crédits carbone générés ne sont pas certifiés officiellement Label Bas-Carbone.</footer>
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

function FarmerSalePanel({ transaction }) {
  return (
    <section style={styles.panelCard}>
      <h2 style={styles.panelTitle}>Dernière vente sur vos crédits</h2>
      <div style={styles.transactionBreakdown}>
        <span style={styles.transactionGross}>Prix brut : <strong>{Number(transaction.amount_eur).toFixed(2)} €</strong></span>
        <span style={styles.transactionPayout}>Reversé à l'agriculteur (85%) : <strong>{Number(transaction.farmer_payout_eur).toFixed(2)} €</strong></span>
        <span style={styles.transactionRef}>Crédit : <strong>{transaction.credit_serial}</strong></span>
      </div>
    </section>
  );
}

function FarmerListings({ listings, loading, onEdit, onWithdraw, onRelist, onViewPlot }) {
  return (
    <section style={styles.panelCard}>
      <div style={styles.sectionHeaderCompact}>
        <h2 style={styles.panelTitle}>Mes annonces</h2>
        <span style={styles.countBadge}>{listings.length} projets</span>
      </div>
      {listings.length === 0 ? (
        <p style={styles.compactText}>Aucun projet carbone publié ou brouillon pour le moment.</p>
      ) : (
        <div style={styles.tableShell}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th>Projet</th>
                <th>Status</th>
                <th>Crédits</th>
                <th>Prix</th>
                <th>Revenus</th>
                <th>Certification</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr key={listing.id}>
                  <td>
                    <strong>{listing.name}</strong>
                    <p style={styles.compactText}>{listing.farm_name} · {listing.plot_name || "Parcelle"}</p>
                  </td>
                  <td><span style={listing.status === "Retiré" ? styles.warningBadge : styles.successBadge}>{listing.status}</span></td>
                  <td>{listing.total_credits} total · {listing.sold_credits} vendus · {listing.available_credits} dispo</td>
                  <td>{Number(listing.price_per_credit_eur).toFixed(2)} €</td>
                  <td>{Number(listing.revenue_generated_eur).toFixed(2)} €</td>
                  <td>{formatDate(listing.certified_at)}</td>
                  <td>
                    <div style={styles.inlineActions}>
                      <button type="button" disabled={loading} onClick={() => onEdit(listing)} style={styles.tinyButton}>Modifier le prix</button>
                      {listing.status === "Retiré" ? (
                        <button type="button" disabled={loading} onClick={() => onRelist(listing)} style={styles.tinyButton}>Remettre sur la marketplace</button>
                      ) : (
                        <button type="button" disabled={loading || listing.available_credits === 0} onClick={() => onWithdraw(listing)} style={styles.tinyButton}>Retirer de la marketplace</button>
                      )}
                      <button type="button" onClick={() => onViewPlot(listing)} style={styles.tinyButton}>Voir la parcelle</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FarmerDashboard({ dashboard }) {
  const monthly = dashboard?.monthly_sales || [];
  return (
    <section style={styles.panelCard}>
      <h2 style={styles.panelTitle}>Tableau de bord farmer</h2>
      <div style={styles.fourStatGrid}>
        <StatCard label="Revenus totaux" value={`${Number(dashboard?.total_revenue_eur || 0).toFixed(2)} €`} />
        <StatCard label="Crédits vendus" value={dashboard?.credits_sold || 0} />
        <StatCard label="Crédits disponibles" value={dashboard?.credits_available || 0} />
        <StatCard label="tCO2 séquestré" value={Number(dashboard?.total_tco2 || 0).toFixed(1)} />
      </div>
      <div style={styles.chartBox}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,61,36,0.12)" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value, name) => [Number(value).toFixed(name === "sales" ? 0 : 2), name === "sales" ? "Ventes" : "Payout €"]} />
            <Bar dataKey="sales" fill={COLORS.emerald} />
            <Bar dataKey="payout_eur" fill={COLORS.forest} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <RecentTransactions rows={dashboard?.recent_transactions || []} />
    </section>
  );
}

function RecentTransactions({ rows }) {
  return (
    <div style={styles.tableShell}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Crédit</th>
            <th>Acheteur</th>
            <th>Montant brut</th>
            <th>Payout reçu</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan="5">Aucune vente enregistrée.</td></tr>
          ) : rows.map((row) => (
            <tr key={`${row.credit_serial}-${row.date}`}>
              <td>{formatDate(row.date)}</td>
              <td>{row.credit_serial}</td>
              <td>{row.buyer_email || "N/A"}</td>
              <td>{Number(row.amount_eur).toFixed(2)} €</td>
              <td>{Number(row.farmer_payout_eur).toFixed(2)} €</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BuyerMarketplace({ credits, filters, setFilters, resetFilters, loading, onPurchase, onViewPlot, mapFocus }) {
  return (
    <main style={styles.marketplaceGrid}>
      <section style={styles.panelCard}>
        <div style={styles.sectionHeaderCompact}>
          <h2 style={styles.panelTitle}>Marketplace</h2>
          <span style={styles.countBadge}>{credits.length} crédits</span>
        </div>
        <MarketplaceFilters filters={filters} setFilters={setFilters} resetFilters={resetFilters} />
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {credits.length === 0 ? (
            <p style={styles.compactText}>Aucun crédit disponible avec ces filtres.</p>
          ) : credits.slice(0, 80).map((credit) => (
            <article key={credit.id} style={styles.creditCard}>
              <div>
                <strong>{credit.serial_number}</strong>
                <p style={styles.compactText}>{credit.farm_name} · {credit.farm_region || "Région N/A"} · {speciesLabel(credit.species)} · {credit.project_duration_years} ans</p>
                <p style={styles.compactText}>GPS {formatGps(credit)} · {Number(credit.price_eur).toFixed(2)} €</p>
              </div>
              <div style={styles.inlineActions}>
                <button type="button" onClick={() => onViewPlot(credit)} style={styles.tinyButton}>Voir la parcelle</button>
                <button type="button" disabled={loading} onClick={() => onPurchase(credit)} style={styles.smallButton}>Acheter</button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section style={styles.mapCard}>
        <h2 style={styles.panelTitle}>Carte des projets</h2>
        <MapContainer center={BORDEAUX} zoom={7} style={styles.marketMap} scrollWheelZoom>
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapFocus geometry={mapFocus} />
          {credits.filter((credit) => credit.centroid_lat && credit.centroid_lng).map((credit) => (
            <Marker key={credit.id} position={[credit.centroid_lat, credit.centroid_lng]}>
              <Popup>
                <strong>{credit.farm_name}</strong><br />
                {speciesLabel(credit.species)} · {Number(credit.price_eur).toFixed(2)} €
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </section>
    </main>
  );
}

function MarketplaceFilters({ filters, setFilters, resetFilters }) {
  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  return (
    <div style={styles.filterGrid}>
      <Field label="Essence">
        <select value={filters.species} onChange={(event) => setFilter("species", event.target.value)} style={styles.input}>
          <option value="all">Tous</option>
          {SPECIES.map((species) => <option key={species} value={species}>{speciesLabel(species)}</option>)}
        </select>
      </Field>
      <Field label="Région">
        <input value={filters.region} onChange={(event) => setFilter("region", event.target.value)} placeholder="Nouvelle-Aquitaine" style={styles.input} />
      </Field>
      <Field label="Prix min (€)">
        <input type="number" min="0" value={filters.priceMin} onChange={(event) => setFilter("priceMin", event.target.value)} style={styles.input} />
      </Field>
      <Field label="Prix max (€)">
        <input type="number" min="0" value={filters.priceMax} onChange={(event) => setFilter("priceMax", event.target.value)} style={styles.input} />
      </Field>
      <Field label="Durée min">
        <input type="number" min="0" value={filters.durationMin} onChange={(event) => setFilter("durationMin", event.target.value)} style={styles.input} />
      </Field>
      <Field label="Durée max">
        <input type="number" min="0" value={filters.durationMax} onChange={(event) => setFilter("durationMax", event.target.value)} style={styles.input} />
      </Field>
      <button type="button" onClick={resetFilters} style={secondaryButtonStyle(false)}>Réinitialiser</button>
    </div>
  );
}

function BuyerCredits({ dashboard, loading, onCertificate }) {
  return (
    <section style={styles.panelCard}>
      <h2 style={styles.panelTitle}>Mes crédits</h2>
      <div style={styles.threeStatGrid}>
        <StatCard label="tCO2 compensé total" value={Number(dashboard?.total_tco2_compensated || 0).toFixed(0)} />
        <StatCard label="Crédits possédés" value={dashboard?.credits_owned || 0} />
        <StatCard label="Total dépensé" value={`${Number(dashboard?.total_spent_eur || 0).toFixed(2)} €`} />
      </div>
      <div style={styles.tableShell}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th>Serial number</th>
              <th>Ferme d'origine</th>
              <th>Essence + durée</th>
              <th>Date d'achat</th>
              <th>Prix payé</th>
              <th>Certificat</th>
            </tr>
          </thead>
          <tbody>
            {(dashboard?.credits || []).length === 0 ? (
              <tr><td colSpan="6">Aucun crédit acheté.</td></tr>
            ) : dashboard.credits.map((credit) => (
              <tr key={credit.credit_id}>
                <td>{credit.serial_number}</td>
                <td>{credit.farm_name}</td>
                <td>{speciesLabel(credit.species)} · {credit.project_duration_years} ans</td>
                <td>{formatDate(credit.purchased_at)}</td>
                <td>{Number(credit.price_paid_eur).toFixed(2)} €</td>
                <td><button type="button" disabled={loading} onClick={() => onCertificate(credit.credit_id)} style={styles.tinyButton}>Télécharger certificat</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PriceModal({ listing, loading, onClose, onSave }) {
  const [price, setPrice] = useState(Number(listing.price_per_credit_eur).toFixed(2));
  return (
    <div style={styles.modalBackdrop}>
      <section style={styles.modalCard}>
        <h2 style={styles.panelTitle}>Modifier le prix</h2>
        <p style={styles.compactText}>{listing.name}</p>
        <Field label="Prix par crédit (€)">
          <input type="number" min="0" step="0.1" value={price} onChange={(event) => setPrice(event.target.value)} style={styles.input} />
        </Field>
        <div style={styles.modalActions}>
          <button type="button" onClick={onClose} style={secondaryButtonStyle(false)}>Annuler</button>
          <button type="button" disabled={loading} onClick={() => onSave(listing, price)} style={primaryButtonStyle(loading)}>Enregistrer</button>
        </div>
      </section>
    </div>
  );
}

function MapFocus({ geometry }) {
  const map = useMap();
  useEffect(() => {
    if (!geometry?.coordinates?.[0]?.length) return;
    const bounds = geometry.coordinates[0].map(([lng, lat]) => [lat, lng]);
    map.fitBounds(bounds, { padding: [36, 36] });
  }, [geometry, map]);
  return null;
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

function Toast({ children }) {
  return <p style={styles.statusText}>{children}</p>;
}

function useApi(token, onLogout) {
  return useCallback(async (path, options = {}) => {
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

function safeJson(text) {
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

function speciesLabel(species) {
  const labels = { chene: "Chêne", noyer: "Noyer", peuplier: "Peuplier", alisier: "Alisier" };
  return labels[species] || species || "N/A";
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString("fr-FR") : "N/A";
}

function formatGps(credit) {
  if (!credit.centroid_lat || !credit.centroid_lng) return "N/A";
  return `${Number(credit.centroid_lat).toFixed(4)}, ${Number(credit.centroid_lng).toFixed(4)}`;
}

function defaultFilters() {
  return { species: "all", region: "", priceMin: "", priceMax: "", durationMin: "", durationMax: "" };
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

function topTabStyle(active) {
  return {
    ...tabStyle(active),
    border: `1px solid ${active ? COLORS.forest : COLORS.border}`,
    background: active ? COLORS.forest : "white",
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
  authCard: { width: "100%", maxWidth: 460, background: COLORS.cream, borderRadius: 28, padding: 36, boxShadow: "0 28px 80px rgba(0, 0, 0, 0.28)" },
  logoKicker: { margin: "0 0 10px", color: "#5C7C38", fontWeight: 900, letterSpacing: "0.18em" },
  authTitle: { margin: 0, fontSize: 34, lineHeight: 1.05 },
  authSubtitle: { margin: "12px 0 0", color: COLORS.muted },
  authTabs: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: "rgba(15,61,36,0.08)", borderRadius: 16, padding: 6, marginBottom: 24 },
  input: { width: "100%", border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "12px 14px", fontSize: 14, outline: "none", boxSizing: "border-box", background: "white" },
  field: { display: "grid", gap: 7, fontWeight: 800, color: COLORS.text, fontSize: 13 },
  errorText: { margin: "12px 0", color: COLORS.danger, fontWeight: 800 },
  statusText: { margin: "0 0 14px", color: COLORS.forest, background: COLORS.mint, borderRadius: 14, padding: 12, fontWeight: 800 },
  appShell: { minHeight: "100vh", background: COLORS.cream, color: COLORS.text, fontFamily: "Inter, system-ui, sans-serif", padding: 20 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, marginBottom: 14, background: COLORS.forest, color: COLORS.cream, borderRadius: 24, padding: "18px 22px" },
  headerKicker: { margin: 0, letterSpacing: "0.2em", fontWeight: 900, color: COLORS.emerald },
  headerTitle: { margin: "4px 0 0", fontSize: 24 },
  userPill: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" },
  roleBadge: { background: COLORS.mint, color: COLORS.forest, borderRadius: 999, padding: "7px 10px" },
  logoutButton: { border: "1px solid rgba(250,249,246,0.35)", background: "transparent", color: COLORS.cream, borderRadius: 999, padding: "9px 12px", cursor: "pointer", fontWeight: 800 },
  topTabs: { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  dashboardGrid: { display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(360px, 1fr)", gap: 20, alignItems: "start" },
  marketplaceGrid: { display: "grid", gridTemplateColumns: "minmax(420px, 1.25fr) minmax(420px, 1fr)", gap: 20, alignItems: "start" },
  mapCard: { background: "white", border: `1px solid ${COLORS.border}`, borderRadius: 24, padding: 16, boxShadow: "0 16px 42px rgba(15,61,36,0.08)" },
  map: { width: "100%", height: "70vh", minHeight: 560, borderRadius: 18, overflow: "hidden" },
  marketMap: { width: "100%", height: "72vh", minHeight: 560, borderRadius: 18, overflow: "hidden", marginTop: 14 },
  sidePanel: { display: "grid", gap: 14 },
  panelCard: { background: "white", border: `1px solid ${COLORS.border}`, borderRadius: 22, padding: 18, boxShadow: "0 14px 36px rgba(15,61,36,0.07)" },
  sectionHeader: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 },
  sectionHeaderCompact: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 },
  sectionTitle: { margin: 0, fontSize: 22 },
  sectionSubtitle: { margin: "5px 0 0", color: COLORS.muted },
  panelTitle: { margin: 0, fontSize: 19 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 },
  filterGrid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(130px, 1fr))", gap: 12, alignItems: "end" },
  metaGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 },
  badgeBox: { background: COLORS.sand, borderRadius: 14, padding: 10, display: "grid", gap: 3, fontSize: 12 },
  actionStack: { display: "grid", gridTemplateColumns: "1fr", gap: 10 },
  statGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 },
  threeStatGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 12, marginBottom: 18 },
  fourStatGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 12 },
  statCard: { background: COLORS.sand, borderRadius: 16, padding: 12, display: "grid", gap: 5 },
  statLabel: { fontSize: 12, color: COLORS.muted, fontWeight: 800 },
  statValue: { fontSize: 21, color: COLORS.forest },
  successBadge: { background: COLORS.mint, color: COLORS.forest, borderRadius: 999, padding: "5px 8px", fontSize: 12, fontWeight: 900 },
  warningBadge: { background: "#FFF3D6", color: COLORS.warning, borderRadius: 999, padding: "5px 8px", fontSize: 12, fontWeight: 900 },
  dangerBadge: { background: "#FCE8E8", color: COLORS.danger, borderRadius: 999, padding: "5px 8px", fontSize: 12, fontWeight: 900 },
  countBadge: { background: COLORS.forest, color: COLORS.cream, borderRadius: 999, padding: "5px 9px", fontSize: 12, fontWeight: 900 },
  messageBox: { margin: "12px 0 0", background: "rgba(15,61,36,0.06)", borderRadius: 14, padding: 12, color: COLORS.text, lineHeight: 1.45 },
  revenueBox: { marginTop: 12, display: "grid", gap: 7, background: COLORS.mint, borderRadius: 14, padding: 12 },
  transactionBreakdown: { marginTop: 12, display: "grid", gap: 10, background: COLORS.cream, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 14 },
  transactionGross: { color: COLORS.text, fontWeight: 800 },
  transactionPayout: { color: COLORS.emerald, fontWeight: 900 },
  transactionRef: { color: COLORS.forest, fontWeight: 800 },
  compactText: { margin: 0, color: COLORS.muted, fontSize: 13, lineHeight: 1.4 },
  creditCard: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 12 },
  priceBadge: { background: COLORS.mint, color: COLORS.forest, borderRadius: 999, padding: "3px 9px", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" },
  smallButton: { border: 0, background: COLORS.forest, color: COLORS.cream, borderRadius: 999, padding: "9px 12px", fontWeight: 900, cursor: "pointer" },
  tinyButton: { border: `1px solid ${COLORS.border}`, background: "white", color: COLORS.forest, borderRadius: 999, padding: "7px 10px", fontWeight: 900, cursor: "pointer", fontSize: 12 },
  inlineActions: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" },
  tableShell: { overflowX: "auto", marginTop: 14 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  chartBox: { height: 260, marginTop: 18, background: COLORS.sand, borderRadius: 18, padding: 12 },
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "grid", placeItems: "center", zIndex: 1000 },
  modalCard: { width: "min(420px, calc(100vw - 36px))", background: "white", borderRadius: 22, padding: 22, boxShadow: "0 24px 80px rgba(0,0,0,.25)", display: "grid", gap: 14 },
  modalActions: { display: "flex", gap: 10, justifyContent: "flex-end" },
  footer: { marginTop: 18, textAlign: "center", color: COLORS.muted, fontSize: 13 },
};

export default App;
