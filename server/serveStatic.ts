/**
 * Production static serving and the shared log helper.
 *
 * Split out of server/vite.ts so the production server never reaches Vite.
 * server/index.ts imported ./vite statically, ./vite imported `vite` and
 * ../vite.config statically, and esbuild's --packages=external hoisted all of
 * that into the shipped bundle — so dist/index.js top-level-imported `vite`,
 * `@vitejs/plugin-react`, `@sentry/vite-plugin` and
 * `@replit/vite-plugin-runtime-error-modal`, every one of them a
 * devDependency. It worked only because the deploy installed devDeps too; any
 * `npm ci --omit=dev` would have killed production at boot with
 * "Cannot find module 'vite'".
 *
 * Nothing in this file may import from ./vite.
 */
import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve hashed asset bundles with long cache; force revalidation on the SPA
  // entry document so back/forward + bfcache restores always pick up new app
  // shells after a deploy.
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
