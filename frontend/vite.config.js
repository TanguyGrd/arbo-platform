import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Optional dev proxy: if you prefer to call /api/* instead of full URLs,
    // requests are forwarded to the FastAPI backend on :8000.
    // We keep absolute URLs in App.jsx via VITE_API_BASE for clarity,
    // but the proxy is here as a fallback.
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
