import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/playground/",
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 4000
  }
});
