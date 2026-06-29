import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ReportIssueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ISSUE_AREAS = [
  "Schedule",
  "Estimates",
  "Bills",
  "Projects",
  "Contacts",
  "Settings",
  "Other",
];

export default function ReportIssueModal({ open, onOpenChange }: ReportIssueModalProps) {
  const { toast } = useToast();
  const [area, setArea] = useState<string>("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setArea("");
    setDescription("");
  };

  const handleSubmit = async () => {
    if (!area || !description.trim()) {
      toast({
        title: "Almost there",
        description: "Please pick an area and describe the issue.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("/api/report-issue", "POST", {
        area,
        description: description.trim(),
      });
      toast({
        title: "Thanks — we'll look into it shortly",
      });
      reset();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Couldn't send report",
        description: "Something went wrong. Email us at hello@moradaco.com.au",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report an Issue</DialogTitle>
          <DialogDescription>
            Tell us what went wrong and we'll take a look.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="issue-area">Area of app</Label>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger id="issue-area" data-testid="select-issue-area">
                <SelectValue placeholder="Choose an area" />
              </SelectTrigger>
              <SelectContent>
                {ISSUE_AREAS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="issue-description">Description</Label>
            <Textarea
              id="issue-description"
              data-testid="input-issue-description"
              placeholder="Describe what happened and what you expected..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            data-testid="button-issue-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            data-testid="button-issue-submit"
          >
            {submitting ? "Sending..." : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
