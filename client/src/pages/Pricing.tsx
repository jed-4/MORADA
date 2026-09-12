import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import moradaLogo from "@assets/icon_1783074833445.png";
import { PricingSection } from "@/components/pricing/PricingSection";

/**
 * Standalone public pricing page, linked from the login/register screen so a
 * prospect can see what Morada costs without creating an account first. The
 * app root stays the login form — this is the only public marketing surface
 * that's actually routed. Shares PricingSection with landing.tsx.
 */
export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-2">
            <img
              src={moradaLogo}
              alt="Morada"
              className="h-8 w-8 rounded object-contain"
              data-testid="logo-icon-pricing"
            />
            <span className="text-2xl font-bold text-foreground" data-testid="text-logo-pricing">
              Morada
            </span>
          </div>
          <Button
            onClick={() => (window.location.href = "/auth")}
            variant="default"
            data-testid="button-back-to-auth"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to sign in
          </Button>
        </header>

        <main className="pb-16">
          <PricingSection className="mt-8" />
        </main>

        <footer className="mt-12 border-t py-8">
          <p className="text-center text-sm text-muted-foreground" data-testid="text-footer-pricing">
            Morada &copy; {new Date().getFullYear()} - Project Management for Australian Residential Builders
          </p>
        </footer>
      </div>
    </div>
  );
}
