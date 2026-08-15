import { defineConfig } from "vite";

export default defineConfig({
  base: "/playground/",
  build: {
    chunkSizeWarningLimit: 4000
  }
});
