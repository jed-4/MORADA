// Quick-view drawer for the Selections list. The chosen option is the hero;
// the remaining options collapse under a small header. Replaces the old
// inline expand panel.

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Send,
  Link as LinkIcon,
  FileText,
  Loader2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Image as ImageIcon,
} from "lucide-react";
import type { SelectionWithOptions, SelectionOption } from "@shared/schema";
import {
  getDerivedStatus,
  getSelectedOption,
  firstImage,
  formatMoneyCents,
  BudgetCell,
  SelectionStatusPill,
  SelectionThumbnail,
} from "./selectionHelpers";

export function SelectionDrawer({
  selection,
  open,
  onClose,
  onEdit,
  onSelectOption,
  selectPending,
}: {
  selection: SelectionWithOptions | null;
  open: boolean;
  onClose: () => void;
  onEdit: (id: string) => void;
  onSelectOption: (selectionId: string, optionId: string) => void;
  selectPending: boolean;
  projectId: string;
}) {
  const { toast } = useToast();
  const [commentText, setCommentText] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [othersOpen, setOthersOpen] = useState(false);
  const selId = selection?.id;

  const { data: comments = [] } = useQuery<any[]>({
    queryKey: ["/api/selections", selId, "comments"],
    queryFn: () => apiRequest(`/api/selections/${selId}/comments`, "GET"),
    enabled: open && !!selId,
  });

  const postCommentMutation = useMutation({
    mutationFn: async () => apiRequest(`/api/selections/${selId}/comments`, "POST", { content: commentText.trim() }),
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["/api/selections", selId, "comments"] });
    },
  });

  const sendPortalMutation = useMutation({
    mutationFn: async () => apiRequest(`/api/selections/${selId}/send-portal`, "POST", { to: sendTo.trim() }),
    onSuccess: () => {
      setSendOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/selections/with-options"] });
      toast({ title: "Sent to client", description: `Portal link emailed to ${sendTo.trim()}.` });
    },
    onError: (err: any) => {
      toast({ title: "Send failed", description: err?.message?.replace(/^\d+:\s*/, "") ?? "Failed to send.", variant: "destructive" });
    },
  });

  const copyPortalLink = async () => {
    if (!selection) return;
    let token = (selection as any).portalToken;
    if (!token) {
      const fresh: any = await apiRequest(`/api/selections/${selection.id}`, "GET");
      token = fresh?.portalToken;
    }
    if (!token) return;
    navigator.clipboard.writeText(`${window.location.origin}/portal/selections/${token}`).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  if (!selection) return null;
  const derived = getDerivedStatus(selection);
  const chosen = getSelectedOption(selection);
  const isLockedForChange = derived === "ordered" || derived === "received";
  // Stable order — the API's option order can shift after updates
  const sortedOptions = [...(selection.options ?? [])].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name),
  );
  const otherOptions = chosen ? sortedOptions.filter((o) => o.id !== chosen.id) : sortedOptions;
  const chosenImg = firstImage(chosen);

  const OptionRow = ({ o }: { o: SelectionOption }) => (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/70 p-2">
      <SelectionThumbnail category={selection.category} attachment={firstImage(o)} size={40} />
      <div className="flex-1 min-w-0">
        <div className="text-[11.5px] font-medium truncate">{o.name}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {[o.brand, o.totalCost != null ? formatMoneyCents(o.totalCost) : null].filter(Boolean).join(" · ")}
        </div>
      </div>
      {!isLockedForChange && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px] shrink-0"
          disabled={selectPending}
          onClick={() => onSelectOption(selection.id, o.id)}
        >
          Select
        </Button>
      )}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { onClose(); setSendOpen(false); setSendTo(""); setOthersOpen(false); } }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
        <SheetHeader className="px-4 pt-4 pb-0 border-b border-border sticky top-0 bg-background z-10">
          <div className="flex items-start justify-between gap-2 pr-6">
            <div className="min-w-0">
              <SheetTitle className="text-[15px] leading-snug truncate">{selection.name}</SheetTitle>
              <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                <SelectionStatusPill derived={derived} />
                {[selection.category, selection.room].filter(Boolean).join(" · ")}
              </div>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => onEdit(selection.id)}>
              Open
              <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
          </div>
          {/* Quick actions — quiet text links, house toolbar style */}
          <div className="-mx-1 flex items-center pt-1 pb-1.5">
            <button
              className="h-7 px-2 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover-elevate flex items-center gap-1.5"
              onClick={() => setSendOpen((v) => !v)}
              data-testid="drawer-send-client"
            >
              <Send className="w-3 h-3" /> Send to client
            </button>
            <button
              className="h-7 px-2 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover-elevate flex items-center gap-1.5"
              onClick={copyPortalLink}
            >
              <LinkIcon className="w-3 h-3" /> {linkCopied ? "Copied!" : "Copy link"}
            </button>
            <button
              className="h-7 px-2 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover-elevate flex items-center gap-1.5"
              onClick={() => window.open(`/api/selections/${selection.id}/pdf`, "_blank")}
            >
              <FileText className="w-3 h-3" /> PDF
            </button>
          </div>
          {sendOpen && (
            <form
              className="flex items-center gap-1.5 pb-2.5"
              onSubmit={(e) => { e.preventDefault(); if (sendTo.trim()) sendPortalMutation.mutate(); }}
            >
              <Input
                type="email"
                autoFocus
                required
                placeholder="client@example.com"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                className="h-7 text-xs"
              />
              <Button type="submit" size="sm" className="h-7 text-xs shrink-0" disabled={!sendTo.trim() || sendPortalMutation.isPending}>
                {sendPortalMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Send"}
              </Button>
            </form>
          )}
        </SheetHeader>

        <div className="px-4 py-3 space-y-4">
          {/* Budget */}
          <BudgetCell selection={selection} align="left" bar />

          {/* Chosen option — hero */}
          {chosen && (
            <div className="rounded-xl border border-[hsl(var(--sage))]/50 overflow-hidden bg-[hsl(var(--sage))]/5">
              <div className="h-36 bg-muted/60">
                {chosenImg ? (
                  <img
                    src={chosenImg.filePath}
                    alt={chosen.name}
                    className="w-full h-full object-cover"
                    style={{ objectPosition: `${chosenImg.thumbnailX ?? 50}% ${chosenImg.thumbnailY ?? 50}%` }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[12.5px] font-medium truncate">{chosen.name}</div>
                  <span className={cn(
                    "text-[9.5px] font-semibold shrink-0",
                    chosen.approvedAt ? "text-[hsl(var(--sage))]" : "text-primary",
                  )}>
                    {chosen.approvedAt ? "Approved" : "Client choice"}
                  </span>
                </div>
                <div className="mt-0.5 text-[10.5px] text-muted-foreground truncate">
                  {[chosen.brand, chosen.sku, chosen.totalCost != null ? formatMoneyCents(chosen.totalCost) : null]
                    .filter(Boolean).join(" · ")}
                </div>
              </div>
            </div>
          )}

          {/* Other options — collapsed under the hero; full list when no hero */}
          {otherOptions.length > 0 && (chosen ? (
            <div>
              <button
                className="flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold text-muted-foreground"
                onClick={() => setOthersOpen((v) => !v)}
                data-testid="drawer-other-options"
              >
                {othersOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Other options ({otherOptions.length})
              </button>
              {othersOpen && (
                <div className="mt-1.5 space-y-1.5">
                  {otherOptions.map((o) => <OptionRow key={o.id} o={o} />)}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                Options ({otherOptions.length})
              </div>
              {otherOptions.map((o) => <OptionRow key={o.id} o={o} />)}
            </div>
          ))}
          {(selection.options ?? []).length === 0 && (
            <div className="text-[11px] text-muted-foreground border border-dashed rounded-lg p-3 text-center">
              No options yet — open the selection to add products.
            </div>
          )}

          {/* Comments */}
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
              Comments ({comments.length})
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {comments.map((c: any) => (
                <div key={c.id} className="rounded-lg bg-muted/50 px-2.5 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold">{c.isClientComment ? `${c.createdByName} (client)` : c.createdByName}</span>
                    <span className="text-[9px] text-muted-foreground">{format(new Date(c.createdAt), "d MMM, h:mm a")}</span>
                  </div>
                  <div className="text-[11px] whitespace-pre-wrap">{c.content}</div>
                </div>
              ))}
            </div>
            <form
              className="flex items-end gap-1.5"
              onSubmit={(e) => { e.preventDefault(); if (commentText.trim()) postCommentMutation.mutate(); }}
            >
              <Textarea
                placeholder="Write a comment…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="min-h-[52px] text-xs resize-none"
              />
              <Button type="submit" size="icon" className="h-8 w-8 shrink-0" disabled={!commentText.trim() || postCommentMutation.isPending}>
                {postCommentMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </Button>
            </form>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
