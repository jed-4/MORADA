import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/use-permission";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { ExpenseSuggestion } from "@shared/schema";
import { invalidateCashflow, money, shortDate } from "./cashflowShared";

export const SUGGESTIONS_KEY = ["/api/cashflow/expense-suggestions"];

interface ScanStatus {
  state: "idle" | "running" | "done" | "error";
  error?: string;
  found?: number;
  skipped?: { jobCost: number; ato: number; irregular: number; oneOff: number };
  aiUsed?: boolean;
  finishedAt?: string;
}
export interface SuggestionsResponse {
  xeroConnected: boolean;
  scan: ScanStatus;
  suggestions: ExpenseSuggestion[];
}

const EVERY: Record<string, string> = {
  once: "once",
  weekly: "a week",
  fortnightly: "a fortnight",
  monthly: "a month",
  quarterly: "a quarter",
  yearly: "a year",
};

/** Polls while a scan runs; otherwise loads once like everything else. */
export function useExpenseSuggestions() {
  return useQuery<SuggestionsResponse>({
    queryKey: SUGGESTIONS_KEY,
    refetchInterval: (q) => (q.state.data?.scan.state === "running" ? 2500 : false),
  });
}

export function SuggestionsBanner({ data }: { data: SuggestionsResponse }) {
  const { toast } = useToast();
  const canAdd = usePermission("business.cashflow", "add");
  const scan = useMutation({
    mutationFn: () => apiRequest("/api/cashflow/expense-suggestions/scan", "POST"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SUGGESTIONS_KEY }),
    onError: () => toast({ title: "Couldn't start the scan", variant: "destructive" }),
  });

  const pending = data.suggestions.filter((s) => s.status === "pending").length;
  const { state } = data.scan;
  let title: string;
  let body: string;
  if (!data.xeroConnected) {
    title = "Connect Xero to have Morada find your regular payments";
    body = "Once Xero is connected, Morada reads a year of spending and suggests rent, wages, insurance and the rest.";
  } else if (state === "running") {
    title = "Reading the last 12 months of Xero…";
    body = "Looking for suppliers you pay on a regular pattern. This takes up to a minute.";
  } else if (state === "error") {
    title = "The scan didn't finish";
    body = data.scan.error ?? "Try again in a minute.";
  } else if (state === "done" || data.suggestions.length > 0) {
    const sk = data.scan.skipped;
    title = pending > 0 ? `${pending} regular payment${pending === 1 ? "" : "s"} from Xero to check` : "All suggestions checked";
    body = sk
      ? `Left out: ${sk.jobCost} supplier${sk.jobCost === 1 ? "" : "s"} mostly coded to jobs${sk.ato ? ", the ATO (BAS is already forecast)" : ""}, and ${sk.irregular + sk.oneOff} with no regular pattern.`
      : "One click each: add it, mark it a job cost, or ignore it.";
  } else {
    title = "Let Morada read your Xero and suggest your business expenses";
    body = "It looks at a year of bills and bank spending, finds the regular ones, and explains each. Job costs and GST are left out.";
  }

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 flex items-center justify-between gap-3 flex-wrap" data-testid="banner-expense-suggestions">
      <div className="flex items-start gap-3 min-w-0">
        <div className="h-8 w-8 rounded-lg bg-primary text-white flex items-center justify-center shrink-0">
          {state === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{body}</p>
        </div>
      </div>
      {data.xeroConnected && canAdd && state !== "running" && (
        <Button size="sm" variant={data.suggestions.length ? "outline" : "default"} onClick={() => scan.mutate()} disabled={scan.isPending} data-testid="button-scan-xero">
          {scan.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          {data.scan.state === "idle" && !data.suggestions.length ? "Scan Xero" : "Re-scan Xero"}
        </Button>
      )}
    </div>
  );
}

function SuggestionCard({ s }: { s: ExpenseSuggestion }) {
  const { toast } = useToast();
  const canAdd = usePermission("business.cashflow", "add");
  const canEdit = usePermission("business.cashflow", "edit");
  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: SUGGESTIONS_KEY });
    await invalidateCashflow();
  };
  const accept = useMutation({
    mutationFn: () => apiRequest(`/api/cashflow/expense-suggestions/${s.id}/accept`, "POST", {}),
    onSuccess: done,
    onError: () => toast({ title: "Couldn't add it", variant: "destructive" }),
  });
  const decide = useMutation({
    mutationFn: (status: "job_cost" | "ignored") => apiRequest(`/api/cashflow/expense-suggestions/${s.id}`, "PATCH", { status }),
    onSuccess: done,
    onError: () => toast({ title: "Couldn't save that", variant: "destructive" }),
  });
  const busy = accept.isPending || decide.isPending;
  const looksJob = s.aiKind === "job_cost";

  return (
    <div className="rounded-lg border p-3 space-y-2 bg-card" data-testid={`card-suggestion-${s.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{s.name}</p>
          {s.name !== s.contactName && <p className="text-data text-muted-foreground truncate">{s.contactName}</p>}
        </div>
        <p className="text-xs font-semibold tabular-nums whitespace-nowrap">
          {money(s.amountCents)} <span className="font-normal text-muted-foreground">{EVERY[s.frequency]}</span>
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {s.category && <Badge variant="secondary" className="text-data no-default-active-elevate">{s.category}</Badge>}
        {looksJob && <Badge className="text-data no-default-active-elevate bg-status-warning-bg text-status-warning">Looks like a job cost</Badge>}
        {s.lapsed && <Badge className="text-data no-default-active-elevate bg-status-warning-bg text-status-warning">Stopped?</Badge>}
        {s.confidence === "low" && !s.lapsed && <Badge variant="outline" className="text-data no-default-active-elevate">Check</Badge>}
        <span className="text-data text-muted-foreground">next {shortDate(s.nextDate)}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{s.reason}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        {canAdd && (
          <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => accept.mutate()} data-testid={`button-accept-${s.id}`}>
            {accept.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Add
          </Button>
        )}
        {canEdit && (
          <>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => decide.mutate("job_cost")} data-testid={`button-jobcost-${s.id}`}>
              It's a job cost
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => decide.mutate("ignored")} data-testid={`button-ignore-${s.id}`}>
              Ignore
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function DecidedRow({ s }: { s: ExpenseSuggestion }) {
  const canEdit = usePermission("business.cashflow", "edit");
  const undo = useMutation({
    mutationFn: () => apiRequest(`/api/cashflow/expense-suggestions/${s.id}`, "PATCH", { status: "pending" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SUGGESTIONS_KEY }),
  });
  return (
    <div className="flex items-center justify-between gap-2 text-xs py-1">
      <span className="truncate">
        {s.name} <span className="text-muted-foreground">· {s.status === "job_cost" ? "job cost" : "ignored"}</span>
      </span>
      {canEdit && (
        <button type="button" className="text-primary hover:underline shrink-0" onClick={() => undo.mutate()} disabled={undo.isPending}>
          Undo
        </button>
      )}
    </div>
  );
}

export function SuggestionsPanel({ data }: { data: SuggestionsResponse }) {
  const [showDecided, setShowDecided] = useState(false);
  const pending = data.suggestions.filter((s) => s.status === "pending");
  const decided = data.suggestions.filter((s) => s.status === "job_cost" || s.status === "ignored");
  if (pending.length === 0 && decided.length === 0) return null;

  return (
    <Card className="p-4 space-y-3 self-start" data-testid="panel-expense-suggestions">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-primary flex items-center gap-1.5"><Sparkles className="h-4 w-4" />Suggested from Xero</p>
        <span className="text-xs text-muted-foreground">{pending.length} to check</span>
      </div>
      <div className="space-y-2">
        {pending.map((s) => <SuggestionCard key={s.id} s={s} />)}
      </div>
      {decided.length > 0 && (
        <div className="border-t pt-2">
          <button type="button" onClick={() => setShowDecided((v) => !v)} className={cn("flex items-center gap-1 text-xs text-muted-foreground")}>
            {showDecided ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {decided.length} left out
          </button>
          {showDecided && <div className="mt-1">{decided.map((s) => <DecidedRow key={s.id} s={s} />)}</div>}
        </div>
      )}
    </Card>
  );
}
