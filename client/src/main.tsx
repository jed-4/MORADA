import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { Crisp } from "crisp-sdk-web";
import App from "./App";
import "./index.css";
import { installChunkReloadHandlers, isDynamicImportError, attemptChunkReload } from "./lib/chunk-reload";

installChunkReloadHandlers();

// Initialize the Crisp support chat widget before React mounts. This is a no-op
// when VITE_CRISP_WEBSITE_ID is unset, so local dev without it runs cleanly.
const crispWebsiteId = import.meta.env.VITE_CRISP_WEBSITE_ID as string | undefined;
if (crispWebsiteId) {
  Crisp.configure(crispWebsiteId);
}

// Initialize Sentry as early as possible, before the app mounts. This is a
// no-op when VITE_SENTRY_DSN is unset, so local dev without a DSN runs cleanly.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,
    integrations: [
      Sentry.browserTracingIntegration(),
      // Session Replay with privacy defaults: never record real text/inputs.
      Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true }),
    ],
    // Performance tracing: sample everything in dev, a fraction in prod.
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    replaysSessionSampleRate: import.meta.env.PROD ? 0.1 : 0,
    replaysOnErrorSampleRate: 1.0,
    // Filter out non-actionable noise: browser-extension crashes and benign
    // ResizeObserver warnings that aren't real BuildPro bugs.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
    ],
    denyUrls: [/^chrome-extension:\/\//i, /^moz-extension:\/\//i, /extensions\//i],
  });
}

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    if (isDynamicImportError(error)) {
      console.warn("[RootErrorBoundary] Stale app version detected, reloading…", error);
      attemptChunkReload();
      return;
    }
    console.error("[RootErrorBoundary] React tree crashed:", error, info.componentStack);
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack } },
    });
  }
  render() {
    if (this.state.error) {
      if (isDynamicImportError(this.state.error)) {
        return (
          <div style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            fontFamily: "system-ui, sans-serif",
            background: "#FAF8F5",
          }}>
            <div style={{ maxWidth: 560, textAlign: "center", color: "#6b7280", fontSize: 14 }}>
              Updating BuildPro to the latest version…
            </div>
          </div>
        );
      }
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily: "system-ui, sans-serif",
          background: "#FAF8F5",
        }}>
          <div style={{ maxWidth: 560, textAlign: "center" }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
              BuildPro hit an unexpected error
            </h1>
            <p style={{ color: "#6b7280", marginBottom: 16, fontSize: 14 }}>
              {this.state.error.message || "An unexpected error occurred while loading the app."}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "8px 16px",
                fontSize: 14,
                borderRadius: 6,
                border: "1px solid #d1d5db",
                background: "white",
                cursor: "pointer",
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
