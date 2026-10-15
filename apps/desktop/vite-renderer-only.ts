import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const __dirname = new URL(".", import.meta.url).pathname.replace(/\/$/, "");

export default defineConfig({
  root: __dirname,
  base: "./",
  build: {
    outDir: resolve(__dirname, "out/renderer"),
    emptyOutDir: true,
    minify: "esbuild" as const,
    rollupOptions: {
      input: { index: resolve(__dirname, "index.html") },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@renderer": resolve(__dirname, "src"),
      "@pi-desktop/i18n": resolve(__dirname, "../../packages/i18n/src/index.ts"),
    },
  },
  // Prevent vite from crawling symlinked node_modules
  server: {
    fs: { deny: ["node_modules"] },
  },
});
