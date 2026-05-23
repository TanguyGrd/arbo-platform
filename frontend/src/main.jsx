import React from "react";
import ReactDOM from "react-dom/client";
import L from "leaflet";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

import App from "./App.jsx";
import LandingPage from "./pages/LandingPage.jsx";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

const ALLOWED_ROLES = new Set(["farmer", "buyer"]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<AppWithRolePreset />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

function AppWithRolePreset() {
  const location = useLocation();

  React.useEffect(() => {
    const role = new URLSearchParams(location.search).get("role");
    if (!ALLOWED_ROLES.has(role)) return undefined;

    let timeoutId = 0;
    let frameId = 0;
    let attempts = 0;
    let cancelled = false;

    function applyPreset() {
      if (cancelled) return;
      attempts += 1;

      const registerButton = Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "Inscription",
      );
      registerButton?.click();

      frameId = window.requestAnimationFrame(() => {
        const roleSelect = Array.from(document.querySelectorAll("select")).find((select) =>
          Array.from(select.options).some((option) => option.value === "farmer" || option.value === "buyer"),
        );

        if (roleSelect) {
          setNativeSelectValue(roleSelect, role);
          return;
        }

        if (attempts < 8) {
          timeoutId = window.setTimeout(applyPreset, 60);
        }
      });
    }

    applyPreset();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(frameId);
    };
  }, [location.search]);

  return <App />;
}

function setNativeSelectValue(select, value) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select), "value");
  descriptor?.set?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}
