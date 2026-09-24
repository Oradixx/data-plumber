import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// `base` must match the GitHub Pages path: https://oradixx.github.io/data-plumber/
// `--mode single` inlines everything into one HTML file (handy for previews).
export default defineConfig(({ mode }) => ({
  base: mode === "single" ? "./" : "/data-plumber/",
  plugins: mode === "single" ? [viteSingleFile()] : [],
  build: { outDir: mode === "single" ? "dist-single" : "dist", chunkSizeWarningLimit: 2000 },
}));
