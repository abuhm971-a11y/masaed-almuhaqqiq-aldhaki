/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#EFE7D8",
        "paper-dim": "#E4D9C4",
        ink: "#2B2620",
        "ink-soft": "#5A5145",
        bronze: "#8B6F3D",
        "bronze-light": "#C9A85F",
        marginalia: "#3F6656",
        border: "#D8CCB0",
      },
      fontFamily: {
        naskh: ["Amiri", "serif"],
        ui: ["IBM Plex Sans Arabic", "sans-serif"],
      },
    },
  },
  plugins: [],
};
