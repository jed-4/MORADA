import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// Source-map upload is gated on SENTRY_AUTH_TOKEN so local/dev builds without
// the token still succeed. Must be the last plugin per Sentry's guidance.
const sentryEnabled = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
    ...(sentryEnabled
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Emit source maps only when uploading to Sentry, so normal builds stay lean.
    sourcemap: sentryEnabled,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const n = id.replace(/\\/g, "/").split("?")[0];
          if (!n.includes("/node_modules/")) return undefined;
          if (/\/node_modules\/(react|react-dom|scheduler|react-is)\//.test(n)) {
            return "vendor-react";
          }
          if (n.includes("/@radix-ui/")) return "vendor-radix";
          if (n.includes("/@tanstack/")) return "vendor-tanstack";
          if (n.includes("/react-hook-form/") || n.includes("/@hookform/") || n.includes("/zod/")) {
            return "vendor-forms";
          }
          if (n.includes("/date-fns/")) return "vendor-date-fns";
          if (n.includes("/lucide-react/")) return "vendor-icons";
          // NOTE: do NOT manually group recharts + d3-* into a single chunk.
          // Recharts imports d3-* internally, and Rollup's evaluation order
          // inside a combined chunk produces a TDZ ("Cannot access 'S' before
          // initialization"). Let Rollup auto-chunk them.
          if (n.includes("/wouter/")) return "vendor-wouter";
          if (n.includes("/@dnd-kit/")) return "vendor-dnd";
          if (n.includes("/framer-motion/")) return "vendor-motion";
          return undefined;
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
