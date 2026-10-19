import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
export default defineConfig({
  base: "/fitness/",
  plugins: [
    react(),
    {
      name: "local-admin-vault",
      configureServer(server) {
        server.middlewares.use("/research/admin.json", (_req, res) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(readFileSync(new URL("../../research/admin.json", import.meta.url)));
        });
      },
    },
  ],
  build: { outDir: "../../fitness", emptyOutDir: true },
});
