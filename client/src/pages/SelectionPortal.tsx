import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, Package, MessageSquare, Send, ChevronDown, ChevronUp, LayoutGrid, Columns3, X, Images } from "lucide-react";
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
  quantity?: number | null;
  unitType?: string | null;
  specifications?: Record<string, any> | null;
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
  const [viewMode, setViewMode] = useState<"cards" | "compare">("cards");
  const [lightboxImage, setLightboxImage] = useState<PortalAttachment | null>(null);

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
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Choose an option</p>
            {selection.options.length > 1 && (
              <div className="flex items-center rounded-lg border bg-card p-0.5">
                <button
                  onClick={() => setViewMode("cards")}
                  className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                    viewMode === "cards" ? "bg-primary/15 text-foreground font-medium" : "text-muted-foreground")}
                >
                  <LayoutGrid className="w-3 h-3" /> Cards
                </button>
                <button
                  onClick={() => setViewMode("compare")}
                  className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                    viewMode === "compare" ? "bg-primary/15 text-foreground font-medium" : "text-muted-foreground")}
                >
                  <Columns3 className="w-3 h-3" /> Compare
                </button>
              </div>
            )}
          </div>

          {selection.options.length === 0 && (
            <div className="bg-card rounded-xl p-8 text-center">
              <Package className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">No options added yet</p>
            </div>
          )}

          {viewMode === "cards" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {selection.options.map((option) => {
                const isSelected = option.id === selectedOptionId;
                const isApproved = !!option.approvedAt;
                const price = option.clientPrice;
                const overAllowance = !!allowance && price != null && price > allowance;
                const images = (option.attachments ?? []).filter(a =>
                  a.fileType === "image" || /\.(jpe?g|png|gif|webp|avif)$/i.test(a.fileName || ""));
                const hero = images[0];
                const disabled = isLocked || isApproved || changeBlocked || selectOptionMutation.isPending;

                return (
                  <div
                    key={option.id}
                    className={cn(
                      "bg-card rounded-xl overflow-hidden border-2 transition-colors flex flex-col",
                      isSelected ? "border-sage" : "border-transparent shadow-sm",
                    )}
                  >
                    {/* Hero image */}
                    <button
                      type="button"
                      className="relative block w-full aspect-[4/3] bg-muted overflow-hidden"
                      onClick={() => hero && setLightboxImage(hero)}
                      aria-label={hero ? `View ${option.name} image` : undefined}
                    >
                      {hero ? (
                        <img
                          src={hero.filePath}
                          alt={option.name}
                          className="w-full h-full object-cover"
                          style={{ objectPosition: `${hero.thumbnailX ?? 50}% ${hero.thumbnailY ?? 50}%` }}
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-10 h-10 text-muted-foreground opacity-30" />
                        </div>
                      )}
                      {images.length > 1 && (
                        <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 text-white text-[10px] px-2 py-0.5">
                          <Images className="w-3 h-3" /> {images.length}
                        </span>
                      )}
                      {(isSelected || isApproved) && (
                        <span className={cn(
                          "absolute top-2 left-2 flex items-center gap-1 rounded-full text-[10px] font-semibold px-2 py-0.5",
                          isApproved ? "bg-sage text-white" : "bg-primary text-primary-foreground"
                        )}>
                          <CheckCircle2 className="w-3 h-3" /> {isApproved ? "Approved" : "Your choice"}
                        </span>
                      )}
                    </button>

                    {/* Body */}
                    <div className="p-3.5 flex flex-col flex-1">
                      <div className="font-medium text-sm leading-snug">{option.name}</div>
                      {(option.brand || option.sku) && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {[option.brand, option.sku].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      {option.description && (
                        <p className="mt-1.5 text-xs text-muted-foreground line-clamp-3">{option.description}</p>
                      )}
                      <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                        {clientCanSeePrice && price != null ? (
                          <div>
                            <span className="text-sm font-semibold">{formatCents(price, { alwaysShowDecimals: true })}</span>
                            <span className="ml-1 text-[10px] text-muted-foreground">inc GST</span>
                            {overAllowance && (
                              <Badge variant="outline" className="ml-1.5 text-[10px] text-status-warning border-status-warning/40 bg-status-warning/5">
                                over allowance
                              </Badge>
                            )}
                          </div>
                        ) : <span />}
                        <Button
                          size="sm"
                          variant={isSelected ? "outline" : "default"}
                          className="h-7 text-xs shrink-0"
                          disabled={disabled || isSelected}
                          onClick={() => selectOptionMutation.mutate(option.id)}
                        >
                          {selectOptionMutation.isPending && selectOptionMutation.variables === option.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : isSelected ? "Selected" : "Choose this"}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Compare view — one column per option */
            <div className="bg-card rounded-xl shadow-sm overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: `${Math.max(selection.options.length * 180, 360)}px` }}>
                <tbody>
                  <tr>
                    {selection.options.map((o) => {
                      const images = (o.attachments ?? []).filter(a =>
                        a.fileType === "image" || /\.(jpe?g|png|gif|webp|avif)$/i.test(a.fileName || ""));
                      const hero = images[0];
                      return (
                        <td key={o.id} className="p-2 align-top" style={{ width: `${100 / selection.options.length}%` }}>
                          <button
                            type="button"
                            className="block w-full aspect-[4/3] bg-muted rounded-lg overflow-hidden"
                            onClick={() => hero && setLightboxImage(hero)}
                          >
                            {hero ? (
                              <img src={hero.filePath} alt={o.name} className="w-full h-full object-cover"
                                style={{ objectPosition: `${hero.thumbnailX ?? 50}% ${hero.thumbnailY ?? 50}%` }} loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package className="w-8 h-8 text-muted-foreground opacity-30" />
                              </div>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    {selection.options.map((o) => (
                      <td key={o.id} className="px-3 pt-1 align-top">
                        <div className="font-medium text-sm leading-snug">{o.name}</div>
                        {(o.brand || o.sku) && (
                          <div className="mt-0.5 text-muted-foreground">{[o.brand, o.sku].filter(Boolean).join(" · ")}</div>
                        )}
                      </td>
                    ))}
                  </tr>
                  {clientCanSeePrice && selection.options.some(o => o.clientPrice != null) && (
                    <tr>
                      {selection.options.map((o) => {
                        const over = !!allowance && o.clientPrice != null && o.clientPrice > allowance;
                        return (
                          <td key={o.id} className="px-3 pt-2 align-top">
                            {o.clientPrice != null ? (
                              <span className={cn("font-semibold text-sm", over && "text-status-warning")}>
                                {formatCents(o.clientPrice, { alwaysShowDecimals: true })}
                                {over && <span className="block text-[10px] font-normal">over allowance</span>}
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                  <tr>
                    {selection.options.map((o) => (
                      <td key={o.id} className="px-3 pt-2 align-top text-muted-foreground">
                        {o.description || ""}
                      </td>
                    ))}
                  </tr>
                  {(() => {
                    const specKeys = Array.from(new Set(
                      selection.options.flatMap(o => Object.keys(o.specifications ?? {}))
                    )).slice(0, 10);
                    return specKeys.map(key => (
                      <tr key={key} className="border-t border-border/60">
                        {selection.options.map((o) => (
                          <td key={o.id} className="px-3 py-1.5 align-top">
                            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground/70">{key}</span>
                            {String((o.specifications ?? {})[key] ?? "—")}
                          </td>
                        ))}
                      </tr>
                    ));
                  })()}
                  <tr>
                    {selection.options.map((o) => {
                      const isSelected = o.id === selectedOptionId;
                      const disabled = isLocked || !!o.approvedAt || changeBlocked || selectOptionMutation.isPending;
                      return (
                        <td key={o.id} className="px-3 py-3 align-top">
                          <Button
                            size="sm"
                            variant={isSelected ? "outline" : "default"}
                            className="h-7 text-xs w-full"
                            disabled={disabled || isSelected}
                            onClick={() => selectOptionMutation.mutate(o.id)}
                          >
                            {isSelected ? "Selected" : "Choose this"}
                          </Button>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Image lightbox */}
        {lightboxImage && (
          <button
            type="button"
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setLightboxImage(null)}
            aria-label="Close image"
          >
            <img
              src={lightboxImage.filePath}
              alt={lightboxImage.fileName}
              className="max-w-full max-h-full rounded-lg object-contain"
            />
            <span className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white">
              <X className="w-4 h-4" />
            </span>
          </button>
        )}

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
