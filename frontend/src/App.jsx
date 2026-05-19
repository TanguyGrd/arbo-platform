import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api/v1";

const inputStyle = {
  width: "100%",
  border: "1px solid rgba(15, 61, 36, 0.16)",
  borderRadius: "14px",
  padding: "14px 16px",
  fontSize: "15px",
  outline: "none",
  boxSizing: "border-box",
};

const defaultSolarPayload = {
  sample_days: ["2024-03-21", "2024-06-21", "2024-09-21", "2024-12-21"],
  tree_height_m: 8.0,
  canopy_radius_m: 3.0,
  resolution_m: 5.0,
};

function App() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("farmer");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState(() => localStorage.getItem("arbo_token") || "");
  const [plotId, setPlotId] = useState("");
  const [solarLoading, setSolarLoading] = useState(false);
  const [solarResult, setSolarResult] = useState(null);
  const [solarMessage, setSolarMessage] = useState("");

  const isRegister = mode === "register";

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const endpoint = isRegister ? "/auth/register" : "/auth/login-json";
    const payload = isRegister ? { email, password, role } : { email, password };

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Une erreur est survenue.");
      }

      localStorage.setItem("arbo_token", data.access_token);
      setToken(data.access_token);
      setMessage(
        isRegister
          ? "Inscription réussie. Votre session est active."
          : "Connexion réussie. Bienvenue sur ARBO."
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function simulateSolarShade() {
    if (!plotId.trim()) {
      setSolarMessage("Renseignez d'abord l'identifiant de la parcelle.");
      return;
    }

    setSolarLoading(true);
    setSolarMessage("☀️ Simulation solaire en cours (~5s)...");
    setSolarResult(null);

    try {
      const response = await fetch(`${API_BASE}/solar/simulate/${plotId.trim()}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(defaultSolarPayload),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "La simulation solaire a échoué.");
      }

      setSolarResult(data);
      setSolarMessage("Simulation solaire terminée.");
    } catch (error) {
      setSolarMessage(error.message);
    } finally {
      setSolarLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(183, 214, 80, 0.24), transparent 32%), #0F3D24",
        color: "#0F3D24",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "560px",
          background: "#F8F5EA",
          borderRadius: "28px",
          padding: "36px",
          boxShadow: "0 28px 80px rgba(0, 0, 0, 0.28)",
        }}
      >
        <div style={{ marginBottom: "28px", textAlign: "center" }}>
          <p
            style={{
              margin: "0 0 10px",
              color: "#5C7C38",
              fontWeight: 800,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            ARBO
          </p>
          <h1 style={{ margin: 0, fontSize: "34px", lineHeight: 1.05 }}>
            Plateforme agroforestière
          </h1>
          <p style={{ margin: "12px 0 0", color: "#496452" }}>
            Connectez-vous ou créez votre compte pour piloter vos projets carbone.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px",
            background: "rgba(15, 61, 36, 0.08)",
            borderRadius: "16px",
            padding: "6px",
            marginBottom: "24px",
          }}
        >
          <button
            type="button"
            onClick={() => setMode("login")}
            style={tabStyle(mode === "login")}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            style={tabStyle(isRegister)}
          >
            Inscription
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "16px" }}>
          <label style={{ display: "grid", gap: "8px", fontWeight: 700 }}>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="vous@entreprise.fr"
              required
              style={inputStyle}
            />
          </label>

          <label style={{ display: "grid", gap: "8px", fontWeight: 700 }}>
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 8 caractères"
              minLength={8}
              required
              style={inputStyle}
            />
          </label>

          {isRegister && (
            <label style={{ display: "grid", gap: "8px", fontWeight: 700 }}>
              Type de compte
              <select
                value={role}
                onChange={(event) => setRole(event.target.value)}
                style={inputStyle}
              >
                <option value="farmer">Agriculteur</option>
                <option value="buyer">Acheteur RSE</option>
              </select>
            </label>
          )}

          <button type="submit" disabled={loading} style={primaryButtonStyle(loading)}>
            {loading ? "Traitement..." : isRegister ? "Créer mon compte" : "Connexion"}
          </button>
        </form>

        {message && (
          <p
            style={{
              margin: "18px 0 0",
              color: message.includes("réussie") ? "#0F3D24" : "#9B2C2C",
              fontWeight: 700,
              textAlign: "center",
            }}
          >
            {message}
          </p>
        )}

        {token && (
          <section
            style={{
              marginTop: "28px",
              borderTop: "1px solid rgba(15, 61, 36, 0.16)",
              paddingTop: "24px",
              display: "grid",
              gap: "14px",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "22px" }}>Diagnostic parcelle</h2>
            <label style={{ display: "grid", gap: "8px", fontWeight: 700 }}>
              Identifiant de la parcelle
              <input
                value={plotId}
                onChange={(event) => setPlotId(event.target.value)}
                placeholder="UUID de la parcelle"
                style={inputStyle}
              />
            </label>

            <button type="button" style={secondaryButtonStyle}>
              Certifier & publier
            </button>
            <button
              type="button"
              onClick={simulateSolarShade}
              disabled={solarLoading}
              style={primaryButtonStyle(solarLoading)}
            >
              Simuler l'ombrage solaire
            </button>

            {solarMessage && (
              <p style={{ margin: 0, color: solarLoading ? "#5C7C38" : "#0F3D24", fontWeight: 700 }}>
                {solarMessage}
              </p>
            )}

            {solarResult && <SolarResult simulation={solarResult} />}
          </section>
        )}
      </section>
    </main>
  );
}

function SolarResult({ simulation }) {
  const monthlyLabels = ["Mars", "Juin", "Sep", "Déc"];
  const annualPercent = Math.round(simulation.shade_ratio_annual * 100);
  const monthlyText = simulation.shade_ratio_by_month
    .map((value, index) => `${monthlyLabels[index] || `M${index + 1}`} ${Math.round(value * 100)}%`)
    .join(" | ");

  return (
    <div
      style={{
        background: "rgba(15, 61, 36, 0.08)",
        borderRadius: "18px",
        padding: "18px",
        display: "grid",
        gap: "8px",
      }}
    >
      <strong>Taux d'ombrage annuel : {annualPercent}%</strong>
      <span>Taux par mois : {monthlyText}</span>
      <span>Heure de pic d'ombrage UTC : {simulation.peak_shade_hour_utc || "N/A"}</span>
      <span>{interpretShade(simulation.shade_ratio_annual)}</span>
    </div>
  );
}

function interpretShade(value) {
  if (value < 0.2) {
    return "Excellente luminosité, culture sous couvert possible";
  }
  if (value <= 0.4) {
    return "Ombrage modéré, favorable aux cultures mi-ombre";
  }
  return "Ombrage dense, réservez aux espèces tolérantes";
}

function primaryButtonStyle(disabled) {
  return {
    border: 0,
    borderRadius: "16px",
    padding: "15px 18px",
    background: "#0F3D24",
    color: "#F8F5EA",
    fontWeight: 800,
    fontSize: "16px",
    cursor: disabled ? "wait" : "pointer",
    marginTop: "4px",
  };
}

const secondaryButtonStyle = {
  border: "1px solid rgba(15, 61, 36, 0.24)",
  borderRadius: "16px",
  padding: "15px 18px",
  background: "transparent",
  color: "#0F3D24",
  fontWeight: 800,
  fontSize: "16px",
  cursor: "pointer",
};

function tabStyle(active) {
  return {
    border: 0,
    borderRadius: "12px",
    padding: "12px",
    background: active ? "#0F3D24" : "transparent",
    color: active ? "#F8F5EA" : "#0F3D24",
    fontWeight: 800,
    cursor: "pointer",
  };
}

export default App;
