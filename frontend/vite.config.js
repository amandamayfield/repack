import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Django serves the built bundle under STATIC_URL; the dev server stays at "/".
  base: command === "build" ? "/static/" : "/",
  build: {
    // Django's STATICFILES_DIRS + TEMPLATES DIRS both point here.
    outDir: "../backend/frontend_build",
    emptyOutDir: true,
  },
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
  },
}));
