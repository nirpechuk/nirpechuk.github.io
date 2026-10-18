import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/flats/",
  plugins: [react()],
  build: {
    outDir: "../../flats",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor";
          if (id.endsWith("brownstone/assets.json")) return "brownstone-art";
        },
      },
    },
  },
  test: {
    environment: "node",
  },
});
