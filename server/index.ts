import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startReminderProcessor } from "./utils/reminderProcessor";
import { storage } from "./storage";
import path from "path";
import fs from "fs";

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Serve uploaded files (avatars, gear photos, etc.)
app.use('/uploads', express.static(path.resolve(import.meta.dirname, '..', 'uploads')));

// Set Content Security Policy to allow blob URLs for PDF preview
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' ws: wss:; " +
    "frame-src 'self' blob:; " +
    "object-src 'self' blob:;"
  );
  next();
});

// Require SESSION_SECRET in production for security
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable must be set in production');
}

// Note: Replit Auth session setup is done in registerRoutes via setupAuth()

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Serve mobile manifest with no-cache headers for PWA updates
  app.get("/mobile-manifest.json", (_req, res) => {
    const manifestPath = path.resolve(import.meta.dirname, "..", "client", "public", "mobile-manifest.json");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(manifestPath);
  });

  // Serve mobile app preview from built files
  const mobileDistPath = path.resolve(import.meta.dirname, "..", "dist", "mobile");
  if (fs.existsSync(mobileDistPath)) {
    // Serve index.html with no-cache for PWA updates
    app.get("/mobile", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(path.join(mobileDistPath, "index.html"));
    });
    app.use("/mobile", express.static(mobileDistPath, {
      maxAge: '1d',
      setHeaders: (res, filePath) => {
        // Don't cache HTML files
        if (filePath.endsWith('.html')) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        }
      }
    }));
    app.get("/mobile/*", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(path.join(mobileDistPath, "index.html"));
    });
    log("Mobile app preview available at /mobile");
  }

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);
    
    // Auto-seed missing built-in field categories (for production databases)
    try {
      const seedResult = await storage.seedMissingBuiltInCategories();
      if (seedResult.addedCategories.length > 0 || seedResult.addedOptions.length > 0) {
        log(`Seeded missing field categories: ${seedResult.addedCategories.join(', ') || 'none'}`);
        log(`Seeded missing field options: ${seedResult.addedOptions.join(', ') || 'none'}`);
      }
    } catch (error) {
      console.error('Failed to seed missing field categories:', error);
    }
    
    startReminderProcessor(1);
  });
})();
