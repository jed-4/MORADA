import { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw, Copy, Check } from "lucide-react";
import * as Sentry from "@sentry/react";
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
  /** Kept so the crash screen can show where it came from, not just what it said. */
  componentStack?: string;
  copied?: boolean;
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
    this.setState({ componentStack: info.componentStack });
    Sentry.captureException(error, {
      tags: { context: this.props.context },
      contexts: { react: { componentStack: info.componentStack } },
    });
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

  /** Everything worth pasting into a bug report, in one block. */
  private details = () =>
    [
      `Context: ${this.props.context ?? "unknown"}`,
      `URL: ${typeof location !== "undefined" ? location.href : ""}`,
      `Message: ${this.state.error?.message ?? ""}`,
      "",
      this.state.error?.stack ?? "",
      "",
      "Component stack:",
      this.state.componentStack ?? "",
    ].join("\n");

  private copyDetails = () => {
    navigator.clipboard?.writeText(this.details()).then(
      () => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      },
      () => undefined,
    );
  };

  render() {
    if (this.state.hasError) {
      if (isDynamicImportError(this.state.error)) {
        return (
          <div className="flex flex-col items-center justify-center h-64 gap-2 p-8 text-center">
            <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
            <p className="text-sm text-muted-foreground">Updating Morada to the latest version…</p>
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                this.setState({ hasError: false, error: undefined, componentStack: undefined });
                window.location.reload();
              }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Reload page
            </Button>
            {/* A minified message like "AU is not a function" names nothing you
                can act on. The stack has always gone to Sentry and the server
                log; this puts it where the person looking at the crash is. */}
            <Button variant="ghost" onClick={this.copyDetails} data-testid="button-copy-crash-details">
              {this.state.copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {this.state.copied ? "Copied" : "Copy details"}
            </Button>
          </div>

          <details className="w-full max-w-2xl text-left">
            <summary className="text-xs text-muted-foreground cursor-pointer">Technical details</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-2 text-[11px] leading-relaxed whitespace-pre-wrap">
              {this.details()}
            </pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
