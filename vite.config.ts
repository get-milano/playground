import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/playground/",
  plugins: [react()],
  resolve: {
    alias: {
      // The CLI's bindings generator is a pure, import-free module, but the
      // package exposes only its barrel, which re-exports Node-dependent
      // commands. The alias reaches the one browser-safe file directly.
      "@milano-cli-bindings": fileURLToPath(
        new URL("./node_modules/@get-milano/cli/dist/bindings.js", import.meta.url),
      ),
    },
  },
  build: {
    chunkSizeWarningLimit: 4000
  }
});
