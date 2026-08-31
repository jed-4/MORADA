import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ReviewCostBanner } from "./ReviewCostBanner";
import {
  VARIATION_ACKNOWLEDGEMENT_LABEL,
  type ReviewCostImpact,
  type ReviewEstimateMode,
} from "@shared/reviewCostImpact";

/**
 * Create a review item.
 *
 * Two behaviours worth knowing:
 *
 * 1. The estimated-impact fields only appear once cost impact is "confirmed" —
 *    prompted, but never required. A builder who does not have a number yet
 *    picks "TBC" rather than inventing one.
 *
 * 2. "Raise a draft variation on approval" AUTO-TICKS when the state becomes
 *    "confirmed" and unticks when it leaves — but only until the builder
 *    touches it themselves, after which their choice is respected. The column
 *    is deliberately not derived from cost impact server-side, so the override
 *    has to survive here.
 *
 * The reviewer is not asked for: it defaults server-side to the project's
 * assigned client (one client per project in V1).
 */

const dollarsToCents = (v: string): number | null => {
  const n = Number.parseFloat(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

export function CreateReviewDialog({
  projectId,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [costImpact, setCostImpact] = useState<ReviewCostImpact>("none");
  const [mode, setMode] = useState<ReviewEstimateMode | "">("");
  const [amount, setAmount] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [note, setNote] = useState("");
  const [autoVariation, setAutoVariation] = useState(false);
  const [autoVariationTouched, setAutoVariationTouched] = useState(false);

  // Auto-tick on "confirmed" until the builder overrides it themselves.
  useEffect(() => {
    if (!autoVariationTouched) setAutoVariation(costImpact === "confirmed");
  }, [costImpact, autoVariationTouched]);

  const reset = () => {
    setName(""); setDescription(""); setDueDate(undefined);
    setCostImpact("none"); setMode(""); setAmount(""); setMinAmount(""); setMaxAmount("");
    setNote(""); setAutoVariation(false); setAutoVariationTouched(false);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        projectId,
        name: name.trim(),
        description: description.trim() || null,
        costImpact,
        createVariationOnApproval: autoVariation,
        dueDate: dueDate ? dueDate.toISOString() : null,
      };
      if (costImpact === "confirmed" && mode) {
        body.costImpactEstimateMode = mode;
        body.costImpactNote = note.trim() || null;
        if (mode === "amount") body.costImpactAmountCents = dollarsToCents(amount);
        if (mode === "range") {
          body.costImpactMinCents = dollarsToCents(minAmount);
          body.costImpactMaxCents = dollarsToCents(maxAmount);
        }
      }
      return await apiRequest("/api/reviews", "POST", body);
    },
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
      toast({ title: "Review created", description: `“${created?.name}” is a draft until you issue Rev A.` });
      reset();
      onOpenChange(false);
      if (created?.id) onCreated?.(created.id);
    },
    onError: (e: Error) =>
      toast({ title: "Could not create the review", description: e.message, variant: "destructive" }),
  });

  const canSubmit = name.trim().length > 0 && !createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg" data-testid="create-review-dialog">
        <DialogHeader>
          <DialogTitle>New review</DialogTitle>
          <DialogDescription>
            Push documents to your client for approval. It stays a draft until you issue Rev A.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="review-name">Name</Label>
            <Input
              id="review-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kitchen joinery — revised layout"
              data-testid="input-review-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="review-description">What are you asking them to look at?</Label>
            <Textarea
              id="review-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional — the client sees this."
              data-testid="input-review-description"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start font-normal", !dueDate && "text-muted-foreground")}
                    data-testid="button-review-due-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "d MMM yyyy") : "No due date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label>Cost impact</Label>
              <Select value={costImpact} onValueChange={(v) => setCostImpact(v as ReviewCostImpact)}>
                <SelectTrigger data-testid="select-cost-impact">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="possible">Possible</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <ReviewCostBanner
            costImpact={costImpact}
            estimate={
              costImpact === "confirmed" && mode
                ? {
                    mode: mode as ReviewEstimateMode,
                    amountCents: dollarsToCents(amount),
                    minCents: dollarsToCents(minAmount),
                    maxCents: dollarsToCents(maxAmount),
                  }
                : null
            }
          />

          {costImpact === "confirmed" && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="space-y-1.5">
                <Label>Estimated impact <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Select value={mode} onValueChange={(v) => setMode(v as ReviewEstimateMode)}>
                  <SelectTrigger data-testid="select-estimate-mode">
                    <SelectValue placeholder="Not stated" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount">An amount</SelectItem>
                    <SelectItem value="range">A range</SelectItem>
                    <SelectItem value="tbc">To be confirmed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {mode === "amount" && (
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="$0.00"
                  inputMode="decimal"
                  data-testid="input-estimate-amount"
                />
              )}
              {mode === "range" && (
                <div className="grid grid-cols-2 gap-2">
                  <Input value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="From" inputMode="decimal" data-testid="input-estimate-min" />
                  <Input value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="To" inputMode="decimal" data-testid="input-estimate-max" />
                </div>
              )}
              {mode && (
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" data-testid="input-estimate-note" />
              )}
            </div>
          )}

          <label className="flex items-start gap-2.5 cursor-pointer">
            <Checkbox
              checked={autoVariation}
              onCheckedChange={(v) => { setAutoVariationTouched(true); setAutoVariation(v === true); }}
              data-testid="checkbox-auto-variation"
            />
            <span className="text-sm leading-snug">
              Raise a draft variation when this is approved
              <span className="block text-xs text-muted-foreground">
                {VARIATION_ACKNOWLEDGEMENT_LABEL} is shown to the client before they can approve a confirmed item.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!canSubmit} data-testid="button-create-review">
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
