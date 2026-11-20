import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/fitness/",
  plugins: [
    react(),
    {
      name: "local-admin-vault",
      configureServer(server) {
        server.middlewares.use("/research/admin.json", async (_req, res) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          try {
            const upstream = await fetch("https://nir.pechuk.com/research/admin.json", { signal: AbortSignal.timeout(15000) });
            res.statusCode = upstream.status;
            res.end(await upstream.text());
          } catch {
            res.statusCode = 502;
            res.end("Encrypted vault is unavailable.");
          }
        });
      },
    },
  ],
  build: { outDir: "../../dist/fitness/fitness", emptyOutDir: true },
});
