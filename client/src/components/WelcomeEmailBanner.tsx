import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Set by the onboarding flow the moment a brand-new signup finishes choosing a
// plan, and cleared the moment the banner is dismissed. Existing users never
// have it, so they never see the banner — no server flag (and no migration)
// needed to tell "first session" from "signed up months ago".
const SHOW_KEY = "morada_welcome_email_banner";

const SUPPORT_EMAIL = "noreply@moradaco.com.au";

/** Call at the end of signup so the next app load shows the banner once. */
export function markWelcomeEmailBannerPending() {
  try {
    localStorage.setItem(SHOW_KEY, "1");
  } catch {
    // Private browsing / storage disabled — the banner just won't show.
  }
}

/**
 * First-run nudge telling a fresh signup to go and find the welcome email
 * (and check spam, which is where a first-contact email most often lands).
 * Shows only to genuinely new users, only until they dismiss it.
 */
export function WelcomeEmailBanner() {
  const { toast } = useToast();
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(SHOW_KEY) === "1";
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    try {
      localStorage.removeItem(SHOW_KEY);
    } catch {
      // Ignore — the state below still hides it for this session.
    }
    setVisible(false);
  };

  const resendMutation = useMutation({
    mutationFn: async () =>
      (await apiRequest("/api/onboarding/resend-welcome", "POST")) as {
        sent: boolean;
        reason?: string;
        to?: string;
      },
    onSuccess: (result) => {
      if (result?.sent) {
        toast({
          title: "Sent again",
          description: result.to
            ? `We've re-sent your welcome email to ${result.to}. Check your spam folder too.`
            : "We've re-sent your welcome email. Check your spam folder too.",
        });
        return;
      }
      toast({
        title: "Couldn't send it just now",
        description:
          result?.reason === "no_recipient"
            ? "We don't have an email address on your account. Add one in Settings and try again."
            : "Give it another go in a minute, or reply to us and we'll sort it out.",
        variant: "destructive",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't send it just now",
        description: error?.message || "Please try again in a minute.",
        variant: "destructive",
      });
    },
  });

  if (!visible) return null;

  return (
    <div
      className="rounded-md border border-primary/30 bg-[hsl(var(--primary-light))] px-4 py-3 mb-2"
      data-testid="banner-welcome-email"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Mail className="h-5 w-5 shrink-0 text-primary" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">
            <span className="font-medium">📩 We've sent your welcome email</span> — check your inbox,
            and your spam/junk folder just in case.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            to your contacts so you don't miss anything.
          </p>
        </div>
        {/* Full-width stacked buttons on phones — the audience is on site, not at a desk. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
          <Button
            size="lg"
            className="w-full sm:w-auto"
            onClick={dismiss}
            data-testid="button-welcome-email-found"
          >
            Yes, found it
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => resendMutation.mutate()}
            disabled={resendMutation.isPending}
            data-testid="button-welcome-email-resend"
          >
            {resendMutation.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              "Didn't arrive? Resend"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
