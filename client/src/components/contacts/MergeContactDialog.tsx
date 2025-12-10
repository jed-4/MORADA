import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, Merge, AlertTriangle, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Contact } from "@shared/schema";

interface MergeContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
  preselectedSourceId?: string;
}

export function MergeContactDialog({
  open,
  onOpenChange,
  contacts,
  preselectedSourceId,
}: MergeContactDialogProps) {
  const { toast } = useToast();
  const [sourceId, setSourceId] = useState<string>(preselectedSourceId || "");
  const [targetId, setTargetId] = useState<string>("");

  const activeContacts = useMemo(() => {
    return contacts.filter((c) => !c.isArchived);
  }, [contacts]);

  const sourceContact = activeContacts.find((c) => c.id === sourceId);
  const targetContact = activeContacts.find((c) => c.id === targetId);

  const availableTargets = useMemo(() => {
    return activeContacts.filter((c) => c.id !== sourceId);
  }, [activeContacts, sourceId]);

  const mergeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/contacts/merge", "POST", {
        sourceId,
        targetId,
      });
    },
    onSuccess: async (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      const data = await response.json?.() || response;
      toast({
        title: "Contacts merged",
        description: data.message || "Contacts merged successfully.",
      });
      onOpenChange(false);
      setSourceId("");
      setTargetId("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to merge contacts.",
        variant: "destructive",
      });
    },
  });

  const handleMerge = () => {
    if (!sourceId || !targetId) return;
    mergeMutation.mutate();
  };

  const resetState = () => {
    setSourceId(preselectedSourceId || "");
    setTargetId("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) resetState();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Merge Contacts
          </DialogTitle>
          <DialogDescription>
            Transfer all linked records from the source contact to the target
            contact. The source contact will be archived after merging.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="merge-source">Source Contact (will be archived)</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger id="merge-source" data-testid="select-merge-source">
                <SelectValue placeholder="Select source contact" />
              </SelectTrigger>
              <SelectContent>
                {activeContacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    <div className="flex items-center gap-2">
                      <span>{contact.name}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {contact.contactType}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {sourceId && (
            <div className="flex justify-center">
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="merge-target">Target Contact (will receive records)</Label>
            <Select
              value={targetId}
              onValueChange={setTargetId}
              disabled={!sourceId}
            >
              <SelectTrigger id="merge-target" data-testid="select-merge-target">
                <SelectValue placeholder="Select target contact" />
              </SelectTrigger>
              <SelectContent>
                {availableTargets.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    <div className="flex items-center gap-2">
                      <span>{contact.name}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {contact.contactType}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {sourceContact && targetContact && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>"{sourceContact.name}"</strong> will be merged into{" "}
                <strong>"{targetContact.name}"</strong>. All linked projects,
                tasks, RFQs, RFIs, bills, and schedule items will be transferred
                to the target contact.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              resetState();
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleMerge}
            disabled={!sourceId || !targetId || mergeMutation.isPending}
            data-testid="button-confirm-merge"
          >
            {mergeMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Merging...
              </>
            ) : (
              <>
                <Merge className="h-4 w-4 mr-2" />
                Merge Contacts
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
