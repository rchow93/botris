import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Strict Content-Security-Policy for the built app. Build-only: the dev
// server injects inline scripts (React Fast Refresh) that it would block.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const csp: Plugin = {
  name: "botris-csp",
  apply: "build",
  transformIndexHtml: () => [
    {
      tag: "meta",
      attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
      injectTo: "head-prepend",
    },
  ],
};

// base: './' so dist/index.html and its assets load correctly from file://
// when Electron loads the built renderer.
export default defineConfig({
  plugins: [react(), csp],
  base: "./",
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
  },
});
