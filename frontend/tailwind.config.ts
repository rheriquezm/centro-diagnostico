import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        gob: {
          blue: "#003390",
          red: "#ef3340",
          success: "#2c8c3a",
          warning: "#f6a500",
          error: "#d93025",
          info: "#007bff",
        },
        surface: {
          DEFAULT: "var(--surface)",
          soft: "var(--surface-soft)",
          card: "var(--surface-card)",
          border: "var(--surface-border)",
        },
        content: {
          DEFAULT: "var(--text)",
          muted: "var(--text-muted)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
