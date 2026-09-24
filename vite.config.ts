import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  // The XD Sites static target serves the build under its own base path.
  base: process.env.VITE_SITE_BASE ?? "/",
  assetsInclude: ["**/*.fbx", "**/*.obj"],
  plugins: [react()],
  server: {
    proxy: {
      // Same contract as the XD Sites worker: /api/mivo/* -> Mivo API (no CORS in dev).
      "/api/mivo": {
        target: "https://aigc.xindong.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mivo/, ""),
      },
    },
    fs: {
      allow: [
        decodeURIComponent(new URL(".", import.meta.url).pathname),
        decodeURIComponent(new URL("../模型库", import.meta.url).pathname),
      ],
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    pool: "threads",
    maxWorkers: 1,
    setupFiles: "./src/test/setup.ts",
  },
});
