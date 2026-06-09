import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installChunkReloadHandlers, isDynamicImportError, attemptChunkReload } from "./lib/chunk-reload";

installChunkReloadHandlers();

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
