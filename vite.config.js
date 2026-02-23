import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    assetsInlineLimit: 999999999, // inline all assets
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: "app.js",
        chunkFileNames: "app.js",
        assetFileNames: "app.[ext]",
      },
    },
  },
});
