import { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
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
    console.error("[ErrorBoundary] Caught render error:", error, info.componentStack);
  }

  reset() {
    this.setState({ hasError: false, error: undefined });
  }

  render() {
    if (this.state.hasError) {
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
