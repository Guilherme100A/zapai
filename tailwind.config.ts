import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        fg: "var(--fg)",
        muted: "var(--muted)",
        brand: "var(--brand)",
        ok: "var(--ok)",
      },
      boxShadow: {
        soft: "var(--shadow)",
        pop: "var(--shadow-lg)",
      },
    },
  },
  plugins: [],
} satisfies Config;
