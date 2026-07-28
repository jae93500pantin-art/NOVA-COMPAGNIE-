import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Premium neutral graphite surfaces (warm, sober).
        ink: {
          950: "#08080a",
          900: "#0c0c0f",
          850: "#101015",
          800: "#15151b",
          700: "#1e1e26",
          600: "#2a2a34",
          500: "#3d3d49",
        },
        // Sober near-monochrome accent (muted greige, almost neutral).
        royal: {
          50: "#f6f6f5",
          100: "#ededeb",
          200: "#dededa",
          300: "#c4c3bd",
          400: "#a8a79f",
          500: "#8c8b82",
          600: "#73726a",
          700: "#5b5a54",
          800: "#454440",
          900: "#34332f",
        },
        gold: {
          400: "#b9b3a4",
          500: "#a39d8c",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
        "radial-glow":
          "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.06), transparent 60%)",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.05), 0 18px 50px -24px rgba(0,0,0,0.7)",
        card: "0 10px 40px -12px rgba(0,0,0,0.65)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.7)", opacity: "0.7" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both",
        "pulse-ring": "pulse-ring 2.4s cubic-bezier(0.4,0,0.2,1) infinite",
        float: "float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
