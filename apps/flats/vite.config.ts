import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/flats/",
  plugins: [react()],
  build: {
    outDir: "../../flats",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
  },
});
