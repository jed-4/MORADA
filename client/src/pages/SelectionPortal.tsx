import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertCircle, CheckCircle2, Package, MessageSquare, Send, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { SelectionWithOptions, SelectionOption, SelectionComment } from "@shared/schema";

interface PortalData {
  selection: SelectionWithOptions & { portalToken?: string; lockedAt?: string | null; allowance?: number | null; clientCanSeePrice?: boolean };
  clientSelection: { selectedOptionId: string; clientName?: string } | null;
  comments: SelectionComment[];
}

export default function SelectionPortal() {
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();
  const [clientName, setClientName] = useState("");
  const [commentText, setCommentText] = useState("");
  const [showComments, setShowComments] = useState(true);

  const { data, isLoading, error } = useQuery<PortalData>({
    queryKey: ["/api/portal/selections", token],
    queryFn: async () => {
      const res = await fetch(`/api/portal/selections/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load selection");
      }
      return res.json();
    },
    enabled: !!token,
  });

  const selectOptionMutation = useMutation({
    mutationFn: async (optionId: string) => {
      const res = await fetch(`/api/portal/selections/${token}/options/${optionId}/select`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: clientName.trim() || "Client" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save selection");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/selections", token] });
    },
  });

  const postCommentMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/portal/selections/${token}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText.trim(), clientName: clientName.trim() || "Client" }),
      });
      if (!res.ok) throw new Error("Failed to post comment");
      return res.json();
    },
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["/api/portal/selections", token] });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading selection...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm px-4">
          <AlertCircle className="w-10 h-10 text-destructive" />
          <h1 className="text-lg font-semibold">Link not found</h1>
          <p className="text-sm text-muted-foreground">
            This selection link is invalid or has expired. Please contact your builder for a new link.
          </p>
        </div>
      </div>
    );
  }

  const { selection, clientSelection, comments } = data;
  const isLocked = !!(selection as any).lockedAt;
  const selectedOptionId = clientSelection?.selectedOptionId;
  const allowance = (selection as any).allowance;
  const clientCanSeePrice = (selection as any).clientCanSeePrice;

  const selectedOption = selection.options.find(o => o.id === selectedOptionId);

  return (
    <div className="min-h-screen bg-muted py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Header card */}
        <div className="bg-card rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Selection Request</p>
                <h1 className="text-xl font-semibold">{selection.name}</h1>
                {selection.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{selection.description}</p>
                )}
              </div>
              {isLocked ? (
                <Badge variant="outline" className="text-xs shrink-0">Locked</Badge>
              ) : selectedOptionId ? (
                <Badge variant="outline" className="text-xs shrink-0 text-green-700 border-green-300 bg-green-50">
                  Choice submitted
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs shrink-0">Awaiting your choice</Badge>
              )}
            </div>

            {allowance && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Allowance:</span>
                <span className="text-sm font-medium">${Number(allowance).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>

          {/* Client name field */}
          {!isLocked && (
            <div className="px-6 py-4 border-b bg-muted/30">
              <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-1.5">Your name (optional)</label>
              <Input
                placeholder="e.g. John Smith"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                className="max-w-xs h-8 text-sm"
              />
            </div>
          )}
        </div>

        {/* Options */}
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wide px-1">Choose an option</p>
          {selection.options.length === 0 && (
            <div className="bg-card rounded-xl p-8 text-center">
              <Package className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">No options added yet</p>
            </div>
          )}
          {selection.options.map((option: SelectionOption & { attachments?: any[] }) => {
            const isSelected = option.id === selectedOptionId;
            const isApproved = !!(option as any).approvedAt;
            const price = (option as any).unitPrice;
            const overAllowance = allowance && price ? Number(price) > Number(allowance) : false;

            return (
              <button
                key={option.id}
                disabled={isLocked || isApproved || selectOptionMutation.isPending}
                onClick={() => !isLocked && !isApproved && selectOptionMutation.mutate(option.id)}
                className={cn(
                  "w-full text-left bg-card rounded-xl overflow-hidden border-2 transition-colors",
                  isSelected
                    ? "border-green-400 bg-green-50/50 dark:bg-green-950/20"
                    : "border-transparent hover:border-muted-foreground/20",
                  (isLocked || isApproved) && "cursor-default opacity-80"
                )}
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Selection indicator */}
                    <div className={cn(
                      "mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                      isSelected ? "border-green-500 bg-green-500" : "border-muted-foreground/30"
                    )}>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{option.name}</span>
                        {isApproved && (
                          <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">
                            Approved
                          </Badge>
                        )}
                        {isSelected && !isApproved && (
                          <Badge variant="outline" className="text-xs">Your choice</Badge>
                        )}
                      </div>

                      {option.description && (
                        <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                      )}

                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {option.supplierName && <span>Supplier: {option.supplierName}</span>}
                        {option.sku && <span>SKU: {option.sku}</span>}
                        {clientCanSeePrice && price && (
                          <span className={cn("font-medium", overAllowance ? "text-amber-600" : "")}>
                            ${Number(price).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                            {overAllowance && " (over allowance)"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Image thumbnail */}
                    {option.attachments && option.attachments.length > 0 && option.attachments[0].url && (
                      <img
                        src={option.attachments[0].url}
                        alt={option.name}
                        className="w-16 h-16 rounded-lg object-cover shrink-0"
                      />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Comments section */}
        <div className="bg-card rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => setShowComments(v => !v)}
            className="w-full px-6 py-4 flex items-center justify-between border-b hover-elevate"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Comments</span>
              {comments.length > 0 && (
                <Badge variant="secondary" className="text-xs">{comments.length}</Badge>
              )}
            </div>
            {showComments ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {showComments && (
            <div className="p-4 space-y-4">
              {comments.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No comments yet. Start the conversation.</p>
              )}

              <div className="space-y-3">
                {comments.map(comment => (
                  <div
                    key={comment.id}
                    className={cn(
                      "rounded-lg p-3 text-sm",
                      comment.isClientComment
                        ? "bg-blue-50 dark:bg-blue-950/20 ml-6"
                        : "bg-muted mr-6"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-medium text-xs">
                        {comment.isClientComment ? "You" : (comment.createdByName || "Builder")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(comment.createdAt), "d MMM, h:mm a")}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                  </div>
                ))}
              </div>

              {/* New comment input */}
              <div className="flex items-end gap-2 pt-2 border-t">
                <Textarea
                  placeholder="Write a comment..."
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey && commentText.trim()) {
                      e.preventDefault();
                      postCommentMutation.mutate();
                    }
                  }}
                  className="flex-1 min-h-[60px] text-sm resize-none"
                />
                <Button
                  size="icon"
                  onClick={() => postCommentMutation.mutate()}
                  disabled={!commentText.trim() || postCommentMutation.isPending}
                >
                  {postCommentMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground pb-4">
          Powered by BuildPro
        </p>
      </div>
    </div>
  );
}
