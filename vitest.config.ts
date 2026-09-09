import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      /**
       * `server-only` est une barrière de BUILD : il lève une erreur dès qu'un
       * module serveur se retrouve dans un bundle client. Les tests tournent en
       * jsdom, donc il se déclenche sur les modules qu'on veut justement
       * tester (brokers, persistance). On le neutralise ici — la garantie
       * qu'il apporte est vérifiée par `next build`, pas par vitest.
       */
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
