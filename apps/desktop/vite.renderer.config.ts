// Renderer-only build: used to rebuild the browser bundle without the slow
// main-process (7MB Node) bundle. Run as:
//   vite build --config vite.renderer.config.ts
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

function tightenCsp(): Plugin {
  return {
    name: "pi-tighten-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        /(<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>)/i,
        (m) => m.replace("'unsafe-eval'", ""),
      );
    },
  };
}

function dropLegacyFontFallbacks(): Plugin {
  return {
    name: "pi-drop-legacy-font-fallbacks",
    apply: "build",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith(".css")) return;
      return code.replace(/src:[^;]+url\([^)]+\.(woff|ttf)[^)]*\)[^;]*;/g, "");
    },
  };
}

export default defineConfig({
  root: ".",
  // electron-vite sets base: './' for renderer so asset URLs in index.html and
  // dynamic imports use relative paths (required for file:// loadFile protocol).
  base: "./",
  build: {
    outDir: "out/renderer",
    emptyOutDir: false,
    minify: "esbuild",
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
      },
    },
  },
  plugins: [react(), tailwindcss(), dropLegacyFontFallbacks()],
  resolve: {
    alias: {
      "@renderer": resolve(__dirname, "src"),
      "@pi-desktop/i18n": resolve(__dirname, "../../packages/i18n/src/index.ts"),
    },
  },
});
