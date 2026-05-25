import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

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
          if (n.includes("/recharts/") || /\/d3-[^/]+\//.test(n)) return "vendor-charts";
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
