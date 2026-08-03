import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_PORT = process.env.PORT ?? "3001";

export default defineConfig({
  root: "web",
  plugins: [react()],
  server: {
    port: 5173,
    // The API key lives on the Express side, so every /api call is proxied
    // there rather than going out from the browser.
    proxy: {
      "/api": `http://localhost:${API_PORT}`,
    },
    // The UI imports its types from ../shared, which sits outside the Vite root.
    fs: { allow: [".."] },
  },
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
  },
});
