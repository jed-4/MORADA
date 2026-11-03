import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/use-permission";

type StarterPackStatus = {
  version: number;
  total: { docs: number; tasks: number };
  available: { docs: number; tasks: number };
};

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

// Shown in the Library toolbar while there is any of the starter pack this
// company hasn't had yet. Disappears once it's all been added — deleting a
// starter SOP afterwards doesn't bring the button back.
export function StarterPackButton() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const canAddDocs = usePermission("operations.library", "add");
  const canAddTasks = usePermission("operations.tasks", "add");
  const canAdd = canAddDocs && canAddTasks;
  const { data } = useQuery<StarterPackStatus>({
    queryKey: ["/api/operations/starter-pack"],
    enabled: canAdd,
  });

  const install = useMutation({
    mutationFn: (): Promise<{ folders: number; docs: number; tasks: number }> =>
      apiRequest("/api/operations/starter-pack", "POST", {}),
    onSuccess: (added) => {
      queryClient.invalidateQueries({ queryKey: ["/api/operations/starter-pack"] });
      queryClient.invalidateQueries({ queryKey: ["/api/docs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/doc-folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/systems/task-templates"] });
      setOpen(false);
      toast({
        title: "Starter pack added",
        description: `${plural(added.docs, "document")} and ${plural(added.tasks, "task")}. The documents are drafts and the tasks are switched off until you turn them on.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Couldn't add the starter pack", description: error.message, variant: "destructive" });
    },
  });

  if (!canAdd || !data) return null;
  const { docs, tasks } = data.available;
  if (docs + tasks === 0) return null;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2 text-xs gap-1"
        onClick={() => setOpen(true)}
        data-testid="button-starter-pack"
      >
        <Sparkles className="w-3 h-3" />
        <span>Starter pack</span>
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add the starter pack?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Adds {plural(docs, "document")} to your Library and {plural(tasks, "operational task")}: bills review,
                  timesheet approval, site inspections and diary, toolbox talks, site induction, client updates and variations.
                </p>
                <p>
                  The documents arrive as drafts for you to read, adjust and approve. The tasks arrive switched off and
                  unassigned. Pick who does each one, then turn it on in Tasks.
                </p>
                <p>They're your own copies. Edit or delete anything.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); install.mutate(); }}
              disabled={install.isPending}
              data-testid="button-starter-pack-confirm"
            >
              {install.isPending ? "Adding…" : "Add starter pack"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
