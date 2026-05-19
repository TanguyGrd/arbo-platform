/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // ARBO brand palette (also referenced via inline styles in App.jsx
        // for resilience if Tailwind purges custom classes during dev).
        arbo: {
          forest: "#0F3D24",
          "forest-soft": "#163E2A",
          cream: "#FAF9F6",
          emerald: "#2ECC71",
          "emerald-soft": "#1F8F4F",
          mute: "#8FA59A",
          warning: "#F5A623",
          danger: "#E04C4C",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
