import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Hash,
} from "lucide-react";
import type { Project, SystemConfiguration } from "@shared/schema";

export type SystemPhase = "lead" | "pre_construction" | "construction" | "post_construction" | "archive";

interface PhaseTransitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  fromPhase: SystemPhase;
  toPhase: SystemPhase;
  newStatusKey: string;
  onConfirm: () => void;
}

const phaseLabels: Record<SystemPhase, string> = {
  lead: "Lead",
  pre_construction: "Pre-Construction",
  construction: "Construction",
  post_construction: "Post-Construction",
  archive: "Archive",
};

const phaseDescriptions: Record<string, string> = {
  "lead_to_pre_construction": "This project will enter the Pre-Construction (ECI) phase. A new pre-construction job number will be generated.",
  "lead_to_construction": "This project will become an active construction job. A job number will be generated.",
  "pre_construction_to_construction": "Pre-construction data will be locked and a new construction job number will be generated.",
  "construction_to_post_construction": "The project will enter practical completion. Construction costs will be finalized.",
  "post_construction_to_archive": "The project will be archived and closed. This marks final handover.",
};

export default function PhaseTransitionDialog({
  open,
  onOpenChange,
  project,
  fromPhase,
  toPhase,
  newStatusKey,
  onConfirm,
}: PhaseTransitionDialogProps) {
  const { toast } = useToast();
  const [customJobNumber, setCustomJobNumber] = useState("");
  const [previewJobNumber, setPreviewJobNumber] = useState<string | null>(null);

  const { data: config } = useQuery<SystemConfiguration>({
    queryKey: ["/api/system-configuration"],
  });

  const isCustomMode = config?.jobNumberingMode === "custom";
  const needsJobNumber = toPhase === "pre_construction" || toPhase === "construction";
  
  const transitionKey = `${fromPhase}_to_${toPhase}`;
  const description = phaseDescriptions[transitionKey] || "This project will transition to a new phase.";

  useEffect(() => {
    if (open && needsJobNumber && !isCustomMode) {
      fetch(`/api/job-numbers/preview?phase=${toPhase}`, { credentials: "include" })
        .then(res => res.json())
        .then(data => setPreviewJobNumber(data.jobNumber))
        .catch(() => setPreviewJobNumber(null));
    }
  }, [open, needsJobNumber, toPhase, isCustomMode]);

  const transitionMutation = useMutation({
    mutationFn: async () => {
      const jobNumber = isCustomMode ? customJobNumber : previewJobNumber;
      
      return await apiRequest(`/api/projects/${project.id}/transition-phase`, "POST", {
        fromPhase,
        toPhase,
        newStatusKey,
        jobNumber: needsJobNumber ? jobNumber : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
      toast({
        title: "Phase transition complete",
        description: `Project has been moved to ${phaseLabels[toPhase]}.`,
      });
      onConfirm();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to transition project phase.",
        variant: "destructive",
      });
    },
  });

  const handleConfirm = () => {
    if (needsJobNumber && isCustomMode && !customJobNumber.trim()) {
      toast({
        title: "Job number required",
        description: "Please enter a job number for this phase.",
        variant: "destructive",
      });
      return;
    }
    transitionMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-phase-transition">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Phase Transition
          </DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-center gap-3">
            <Badge variant="secondary" className="text-sm px-3 py-1">
              {phaseLabels[fromPhase]}
            </Badge>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            <Badge className="text-sm px-3 py-1 bg-primary">
              {phaseLabels[toPhase]}
            </Badge>
          </div>

          <div className="border rounded-md p-3 bg-muted/30">
            <div className="text-sm font-medium mb-1">Project</div>
            <div className="text-sm text-muted-foreground">{project.name}</div>
            {project.location && (
              <div className="text-xs text-muted-foreground mt-1">{project.location}</div>
            )}
          </div>

          {needsJobNumber && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Hash className="h-4 w-4" />
                {toPhase === "pre_construction" ? "Pre-Construction Number" : "Job Number"}
              </div>
              
              {isCustomMode ? (
                <div className="space-y-2">
                  <Label htmlFor="customJobNumber">Enter job number</Label>
                  <Input
                    id="customJobNumber"
                    value={customJobNumber}
                    onChange={(e) => setCustomJobNumber(e.target.value)}
                    placeholder="e.g., 4501"
                    data-testid="input-custom-job-number"
                  />
                </div>
              ) : (
                <div className="border rounded-md p-3 bg-green-50 dark:bg-green-900/20">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm">Auto-generated number:</span>
                    <span className="font-mono font-bold text-green-700 dark:text-green-400">
                      {previewJobNumber || "Loading..."}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {fromPhase === "pre_construction" && toPhase === "construction" && (
            <div className="border rounded-md p-3 bg-amber-50 dark:bg-amber-900/20">
              <div className="text-sm text-amber-800 dark:text-amber-300">
                <strong>Note:</strong> Pre-construction data (costs, timesheets) will be locked and preserved separately from construction data.
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={transitionMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={transitionMutation.isPending || (needsJobNumber && isCustomMode && !customJobNumber.trim())}
            data-testid="button-confirm-transition"
          >
            {transitionMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Transitioning...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirm Transition
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
