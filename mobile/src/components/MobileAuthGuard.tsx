import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/MobileButton";
import { LogIn, RefreshCw, Wifi } from "lucide-react";

interface MobileAuthGuardProps {
  children: React.ReactNode;
}

export function MobileAuthGuard({ children }: MobileAuthGuardProps) {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-background p-6">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    const loginUrl = `/api/login?redirect=${encodeURIComponent('/mobile')}`;
    
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-background p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <Wifi className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-xl font-semibold mb-2">Session Expired</h1>
        <p className="text-muted-foreground mb-6 max-w-xs">
          Your session has expired or you've been logged out. Please sign in again to continue.
        </p>
        <a href={loginUrl} className="w-full max-w-xs">
          <Button className="w-full gap-2">
            <LogIn className="h-4 w-4" />
            Sign In with Replit
          </Button>
        </a>
      </div>
    );
  }

  return <>{children}</>;
}
