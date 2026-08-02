import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sparkles, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const DISMISS_KEY = "morada_demo_banner_dismissed";

interface DemoStatus {
  seeded: boolean;
  demoProjectNames?: string[];
  demoContactNames?: string[];
}

/**
 * Slim bar shown while the signup demo dataset is still present, so new users
 * know what they're looking at is sample data — with a one-click way to clear
 * it when they're ready to work for real. Dismissable per-browser; disappears
 * for good once the demo data is gone.
 */
export function DemoDataBanner() {
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === "1",
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: status } = useQuery<DemoStatus>({
    queryKey: ["/api/demo-data/status"],
    staleTime: 5 * 60 * 1000,
    enabled: !dismissed,
  });

  const clearMutation = useMutation({
    mutationFn: async () => apiRequest("/api/demo-data/clear", "POST"),
    onSuccess: () => {
      setConfirmOpen(false);
      toast({
        title: "Demo data cleared",
        description: "You're starting fresh. Your cost codes and payment terms are kept.",
      });
      // The demo touched most of the app — refetch everything.
      queryClient.invalidateQueries();
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't clear demo data",
        description:
          error?.message?.includes("403") || error?.status === 403
            ? "Only an admin can clear the demo data."
            : error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (dismissed || !status?.seeded) return null;

  return (
    <>
      <div
        className="flex items-center gap-3 rounded-md border border-primary/30 bg-[hsl(var(--primary-light))] px-4 py-2 text-sm mb-2"
        data-testid="banner-demo-data"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <p className="flex-1 text-foreground">
          <span className="font-medium">You're looking at sample data.</span>{" "}
          We've loaded a demo project so you can explore how everything works.
          When you're ready to start on your own jobs, clear it.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          data-testid="button-clear-demo-data"
        >
          Clear demo data
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
          }}
          aria-label="Dismiss"
          data-testid="button-dismiss-demo-banner"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the demo data?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the sample projects, contacts, estimates, invoices,
              bills and tasks that were loaded at signup. Useful defaults like
              your cost codes and payment terms are kept. Anything you created
              yourself is untouched. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearMutation.isPending}>Keep exploring</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                clearMutation.mutate();
              }}
              disabled={clearMutation.isPending}
              data-testid="button-confirm-clear-demo"
            >
              {clearMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Clearing...
                </>
              ) : (
                "Clear demo data"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
