import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, Package, MessageSquare, Send, ChevronDown, ChevronUp } from "lucide-react";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { PortalLoading, PortalError } from "@/components/portal/PortalStateBoundary";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { formatCents } from "@shared/money";
import type { SelectionComment } from "@shared/schema";

interface PortalAttachment {
  id: string;
  fileName: string;
  fileType: string;
  filePath: string;
  thumbnailX?: number;
  thumbnailY?: number;
}

interface PortalOption {
  id: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  brand?: string | null;
  approvedAt?: string | null;
  isSelectedByClient?: boolean;
  clientPrice?: number | null; // cents inc GST; null when hidden or not costed
  attachments?: PortalAttachment[];
}

interface PortalData {
  selection: {
    id: string;
    name: string;
    description?: string | null;
    allowance?: number | null; // cents; null when price hidden
    clientCanSeePrice?: boolean;
    clientCanChange?: boolean;
    locked?: boolean;
    options: PortalOption[];
  };
  clientSelection: { id: string; optionId: string } | null;
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
    return <PortalLoading message="Loading selection…" />;
  }

  if (error || !data) {
    return (
      <PortalError
        title="Link not found"
        description="This selection link is invalid or has expired. Please contact your builder for a new link."
      />
    );
  }

  const { selection, clientSelection, comments } = data;
  const isLocked = !!selection.locked;
  const selectedOptionId = clientSelection?.optionId;
  const allowance = selection.allowance; // cents
  const clientCanSeePrice = !!selection.clientCanSeePrice;
  const changeBlocked = !!selectedOptionId && selection.clientCanChange === false;

  return (
    <PortalLayout title="Selection Request" maxWidth="max-w-2xl">
      <div className="space-y-4">

        {/* Header card */}
        <div className="bg-card rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-semibold">{selection.name}</h2>
                {selection.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{selection.description}</p>
                )}
              </div>
              {isLocked ? (
                <Badge variant="outline" className="text-xs shrink-0">Locked</Badge>
              ) : selectedOptionId ? (
                <Badge variant="outline" className="text-xs shrink-0 text-status-success border-status-success/30 bg-status-success-bg">
                  Choice submitted
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs shrink-0">Awaiting your choice</Badge>
              )}
            </div>

            {!!allowance && clientCanSeePrice && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Allowance:</span>
                <span className="text-sm font-medium">{formatCents(allowance, { alwaysShowDecimals: true })}</span>
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
          {selection.options.map((option) => {
            const isSelected = option.id === selectedOptionId;
            const isApproved = !!option.approvedAt;
            const price = option.clientPrice; // cents inc GST, null when hidden/uncosted
            const overAllowance = !!allowance && price != null && price > allowance;
            const heroImage = option.attachments?.find(a =>
              a.fileType === "image" || /\.(jpe?g|png|gif|webp|avif)$/i.test(a.fileName || "")
            );
            const disabled = isLocked || isApproved || changeBlocked || selectOptionMutation.isPending;

            return (
              <button
                key={option.id}
                disabled={disabled}
                onClick={() => !disabled && selectOptionMutation.mutate(option.id)}
                className={cn(
                  "w-full text-left bg-card rounded-xl overflow-hidden border-2 transition-colors",
                  isSelected
                    ? "border-sage bg-status-success-bg/50"
                    : "border-transparent hover:border-muted-foreground/20",
                  (isLocked || isApproved) && "cursor-default opacity-80"
                )}
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Selection indicator */}
                    <div className={cn(
                      "mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                      isSelected ? "border-sage bg-sage" : "border-muted-foreground/30"
                    )}>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{option.name}</span>
                        {isApproved && (
                          <Badge variant="outline" className="text-xs text-status-success border-status-success/30 bg-status-success-bg">
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
                        {option.brand && <span>Brand: {option.brand}</span>}
                        {option.sku && <span>SKU: {option.sku}</span>}
                        {clientCanSeePrice && price != null && (
                          <span className={cn("font-medium", overAllowance ? "text-status-warning" : "")}>
                            {formatCents(price, { alwaysShowDecimals: true })}
                            {overAllowance && " (over allowance)"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Image thumbnail */}
                    {heroImage && (
                      <img
                        src={heroImage.filePath}
                        alt={option.name}
                        className="w-16 h-16 rounded-lg object-cover shrink-0"
                        style={{ objectPosition: `${heroImage.thumbnailX ?? 50}% ${heroImage.thumbnailY ?? 50}%` }}
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
                        ? "bg-primary/10 ml-6"
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

      </div>
    </PortalLayout>
  );
}
