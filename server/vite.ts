/**
 * Vite dev middleware. DEVELOPMENT ONLY.
 *
 * server/index.ts reaches this module through `await import("./vite")` inside
 * its development branch, and `vite` itself is imported dynamically below.
 * Both indirections are load-bearing: esbuild hoists *static* imports of
 * external packages to the top of the bundle even when the importing module is
 * only reachable dynamically, so a static `import { createServer } from "vite"`
 * here would put Vite back into the production import graph regardless of how
 * index.ts calls it. A dynamic import of an external specifier stays dynamic.
 *
 * Do not convert the imports below to static ones, and do not import this
 * module from anywhere that runs in production. `serveStatic` and `log` live
 * in server/serveStatic.ts precisely so that nothing has to.
 */
import type { Express } from "express";
import type { Server } from "http";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

export async function setupVite(app: Express, server: Server) {
  // Dynamic so the production bundle never references Vite. See the note above.
  const { createServer: createViteServer, createLogger } = await import("vite");
  const viteLogger = createLogger();

  const serverOptions = {
    middlewareMode: true as const,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    // Previously the config object was imported from ../vite.config and spread
    // in with `configFile: false`. That static relative import is what dragged
    // @vitejs/plugin-react, @sentry/vite-plugin and the @replit plugin into the
    // server bundle. Pointing Vite at the file instead gives the same resolved
    // config — aliases, plugins and all — without the server ever importing it.
    configFile: path.resolve(import.meta.dirname, "..", "vite.config.ts"),
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
