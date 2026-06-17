import { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDynamicImportError, attemptChunkReload } from "@/lib/chunk-reload";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Identifier (e.g. route path or "widget:cashflow") sent with crash reports. */
  context?: string;
  /**
   * When the boundary is in an errored state and any value in this array
   * changes, the boundary resets itself. Used to recover on navigation so a
   * single crash doesn't wedge the whole app until a hard reload.
   */
  resetKeys?: unknown[];
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    if (isDynamicImportError(error)) {
      console.warn("[ErrorBoundary] Stale app version detected, reloading…", error);
      attemptChunkReload();
      return;
    }
    console.error("[ErrorBoundary] Caught render error:", error, info.componentStack);
    // Forward render errors to the server so they show up in deployment logs.
    // React swallows render-time throws into this boundary, so without this they
    // never reach the inline window.onerror reporter in index.html.
    try {
      fetch("/api/_client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "react-render-error",
          info: {
            context: this.props.context,
            message: error?.message,
            stack: String(error?.stack || ""),
            componentStack: String(info?.componentStack || ""),
          },
          ua: navigator.userAgent,
          url: location.href,
        }),
      }).catch(() => {});
    } catch {}
  }

  componentDidUpdate(prevProps: Props) {
    if (!this.state.hasError) return;
    const prev = prevProps.resetKeys;
    const next = this.props.resetKeys;
    if (!prev || !next) return;
    const changed =
      prev.length !== next.length || prev.some((k, i) => !Object.is(k, next[i]));
    if (changed) this.reset();
  }

  reset() {
    this.setState({ hasError: false, error: undefined });
  }

  render() {
    if (this.state.hasError) {
      if (isDynamicImportError(this.state.error)) {
        return (
          <div className="flex flex-col items-center justify-center h-64 gap-2 p-8 text-center">
            <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
            <p className="text-sm text-muted-foreground">Updating BuildPro to the latest version…</p>
          </div>
        );
      }
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4 p-8 text-center">
          <AlertCircle className="w-12 h-12 text-destructive" />
          <div>
            <p className="font-semibold text-lg">Something went wrong</p>
            <p className="text-sm text-muted-foreground mt-1">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              this.setState({ hasError: false, error: undefined });
              window.location.reload();
            }}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reload page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
