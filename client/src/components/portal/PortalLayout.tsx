import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import moradaLogo from "@assets/icon_1783074833445.png";

/**
 * Small Morada logo + wordmark used in the public portal chrome.
 * Reuses the same asset as Header.tsx / AuthPage.tsx / landing.tsx.
 */
export function MoradaWordmark({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      data-testid="portal-morada-wordmark"
    >
      <img
        src={moradaLogo}
        alt="Morada"
        className="h-5 w-5 rounded object-contain"
      />
      <span className="text-sm font-semibold tracking-tight">Morada</span>
    </div>
  );
}

export interface PortalLayoutProps {
  /** Portal title shown in the slim header (e.g. project or document name). */
  title: string;
  /** Optional secondary line under the title (builder/company name, doc type…). */
  subtitle?: ReactNode;
  /** Optional right-aligned header content (badge, count…), before the wordmark. */
  headerRight?: ReactNode;
  /** Content width — matches each portal's original container width. */
  maxWidth?: "max-w-2xl" | "max-w-3xl" | "max-w-4xl";
  /** Optional extra footer line under "Powered by Morada". */
  footerNote?: ReactNode;
  children: ReactNode;
}

/**
 * Shared shell for public client/trade-facing portals (Selection, Trades,
 * RFQ, Proposal, Variation). Provides a consistent page background, slim
 * branded header, centered content container, and standard footer.
 */
export function PortalLayout({
  title,
  subtitle,
  headerRight,
  maxWidth = "max-w-3xl",
  footerNote,
  children,
}: PortalLayoutProps) {
  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="border-b border-border bg-card">
        <div
          className={cn(
            "mx-auto w-full px-4 py-3 flex items-center gap-3",
            maxWidth,
          )}
        >
          <div className="min-w-0 flex-1">
            <h1
              className="text-base font-semibold leading-tight truncate"
              data-testid="portal-title"
            >
              {title}
            </h1>
            {subtitle && (
              <p
                className="text-xs text-muted-foreground truncate"
                data-testid="portal-subtitle"
              >
                {subtitle}
              </p>
            )}
          </div>
          {headerRight}
          <MoradaWordmark className="shrink-0" />
        </div>
      </header>

      <main className={cn("mx-auto w-full flex-1 px-4 py-6", maxWidth)}>
        {children}
      </main>

      <footer className="py-4">
        <div
          className={cn(
            "mx-auto w-full px-4 text-center text-xs text-muted-foreground space-y-1",
            maxWidth,
          )}
        >
          <p data-testid="portal-footer">Powered by Morada</p>
          {footerNote && <p>{footerNote}</p>}
        </div>
      </footer>
    </div>
  );
}
