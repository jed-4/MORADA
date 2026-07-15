import { useMutation } from "@tanstack/react-query";
import { Loader2, Home, Mail, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type GivePortalAccessDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  contactName: string;
  email: string;
  projects: { id: string; name: string }[];
};

export function GivePortalAccessDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
  email,
  projects,
}: GivePortalAccessDialogProps) {
  const { toast } = useToast();

  const inviteMutation = useMutation({
    mutationFn: () => apiRequest(`/api/contacts/${contactId}/portal-access/invite`, "POST"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactId, "portal-access"] });
      toast({
        title: "Invite sent",
        description: `${contactName} has been emailed a link to set their password.`,
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to send invite",
        description: error?.message || "Please try again.",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Give portal access</DialogTitle>
          <DialogDescription>
            {contactName} will be able to log in to Morada and view the projects below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="font-medium" data-testid="text-portal-invite-email">{email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Role</p>
                <p className="font-medium">Client (read-only)</p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Projects this access covers</p>
            {projects.length > 0 ? (
              <div className="rounded-md border bg-muted/50 divide-y">
                {projects.map((project) => (
                  <div key={project.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <Home className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{project.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3">
                No projects linked — link a project to this contact first.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-portal-invite">
            Cancel
          </Button>
          <Button
            onClick={() => inviteMutation.mutate()}
            disabled={inviteMutation.isPending || projects.length === 0}
            data-testid="button-send-portal-invite"
          >
            {inviteMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              "Send invite"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
