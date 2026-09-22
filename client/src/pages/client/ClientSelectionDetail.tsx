import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { CalendarIcon, ChevronLeft, Loader2, MapPin, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatCents } from "@shared/money";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useClientPortal } from "@/hooks/use-client-portal";
import { PORTAL_KEYS } from "@shared/clientPortalPermissions";
import { firstImage } from "@/components/selections/selectionHelpers";
import { OptionsSection, type OptionView } from "@/components/selections/OptionViews";
import { ClientError, ClientLoading, ClientPage, ClientScroll, ClientStatus } from "@/components/client/ClientPage";
import { selectionStatus, type ClientSelection, type ClientSelectionOption } from "./ClientSelections";
import { ClientOptionDialog } from "./ClientOptionDialog";

/**
 * One selection, laid out like the builder's own selection page — the same
 * summary strip (status, category, location, deadline, money on the right)
 * and the SAME OptionsSection component, so the client and the builder are
 * looking at one screen rather than two designs of it.
 *
 * What differs is only what a client can DO, which is exactly what
 * OptionsSection takes as props: no kebab, no Add Product, no Approve button.
 * Clicking a card opens the option — every photo, the specs, the documents,
 * the link — and choosing happens there. A pick is a pick, not an approval:
 * the builder confirms it (Jed, 2026-09-17).
 *
 * Prices appear only when the server sent them, which needs both the role's
 * "See prices" tick and the selection's own price setting. Otherwise
 * `totalCost` is absent and OptionsSection shows no figure rather than $0.
 */

const toOptionView = (option: ClientSelectionOption): OptionView => ({
  id: option.id,
  name: option.name,
  brand: option.brand,
  sku: option.sku,
  description: option.description,
  url: option.url,
  quantity: option.quantity,
  unitType: option.unitType,
  // The client price, already marked up server-side. unitCost/markupPercent
  // are stripped for clients, so displayCents() falls back to nothing rather
  // than to the builder's buy price.
  totalCost: option.totalCost ?? null,
  isSelectedByClient: option.isSelectedByClient,
  approvedAt: option.approvedAt,
  heroUrl: firstImage(option as any)?.filePath ?? null,
});

interface SelectionComment {
  id: string;
  content: string;
  createdByName?: string | null;
  isClientComment?: boolean | null;
  createdAt: string;
}

export default function ClientSelectionDetail() {
  const { projectId, id } = useParams<{ projectId: string; id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { hasPermission } = useClientPortal();
  const canChoose = hasPermission(PORTAL_KEYS.selections, "edit");
  const canComment = hasPermission(PORTAL_KEYS.selections, "add");
  const [draft, setDraft] = useState("");
  const [openOptionId, setOpenOptionId] = useState<string | null>(null);

  const { data: selection, isLoading, isError } = useQuery<ClientSelection>({
    queryKey: [`/api/selections/${id}`],
    enabled: !!id,
  });

  const { data: fetchedOptions = [] } = useQuery<ClientSelectionOption[]>({
    queryKey: [`/api/selections/${id}/options`],
    enabled: !!id,
  });

  const { data: comments = [] } = useQuery<SelectionComment[]>({
    queryKey: [`/api/selections/${id}/client-comments`],
    enabled: !!id && canComment,
  });

  const choose = useMutation({
    mutationFn: (optionId: string) =>
      apiRequest(`/api/selections/${id}/options/${optionId}/client-select`, "PATCH", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/selections/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/selections/${id}/options`] });
      queryClient.invalidateQueries({ queryKey: [`/api/selections/with-options?projectId=${projectId}`] });
      setOpenOptionId(null);
      toast({ title: "Choice sent", description: "Your builder has been notified." });
    },
    onError: (error: any) =>
      toast({
        title: "We couldn't save that",
        description: error?.message || "Please try again, or contact your builder.",
        variant: "destructive",
      }),
  });

  const comment = useMutation({
    mutationFn: (content: string) => apiRequest(`/api/selections/${id}/client-comments`, "POST", { content }),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: [`/api/selections/${id}/client-comments`] });
    },
    onError: (error: any) =>
      toast({ title: "We couldn't post that", description: error?.message || "Please try again.", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <ClientPage title="Selection">
        <ClientLoading label="Loading selection…" />
      </ClientPage>
    );
  }

  if (isError || !selection) {
    return (
      <ClientPage title="Selection">
        <ClientError message="This selection isn't available. Ask your builder if you think it should be." />
      </ClientPage>
    );
  }

  const options = selection.options?.length ? selection.options : fetchedOptions;
  const { label, tone } = selectionStatus({ ...selection, options });
  const confirmed = options.find((o) => o.approvedAt);
  const chosen = confirmed ?? options.find((o) => o.isSelectedByClient);
  const chosenPrice = chosen?.totalCost ?? null;
  const showMoney = options.some((o) => o.totalCost != null);
  const allowanceCents = showMoney ? ((selection as any).allowance ?? null) : null;
  const openOption = options.find((o) => o.id === openOptionId) ?? null;

  return (
    <ClientScroll>
    <div className="p-4 md:p-6 space-y-4" data-testid="client-selection-detail">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/projects/${projectId}/selections`)}
          data-testid="button-back-to-selections"
          aria-label="All selections"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">{selection.name}</h1>
      </div>

      {/* The builder's summary strip, minus what a client cannot act on. */}
      <div className="surface-panel p-3" data-testid="client-selection-details">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0 flex items-center gap-6 flex-wrap">
            <div>
              <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Status</div>
              <ClientStatus label={label} tone={tone} />
            </div>
            <div>
              <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Category</div>
              <div className="text-sm font-medium">{selection.category || "—"}</div>
            </div>
            <div>
              <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Location</div>
              <div className="text-sm font-medium flex items-center gap-1">
                <MapPin className="w-3 h-3 text-muted-foreground" />
                {selection.room || "—"}
              </div>
            </div>
            {!confirmed && (
              <div>
                <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Deadline</div>
                <div className="text-sm font-medium flex items-center gap-1">
                  <CalendarIcon className="w-3 h-3 text-muted-foreground" />
                  {selection.deadline ? format(new Date(selection.deadline), "dd/MM/yyyy") : "—"}
                </div>
              </div>
            )}
            {(selection as any).description && (
              <div className="w-full mt-2">
                <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Description</div>
                <div className="text-sm text-foreground">{(selection as any).description}</div>
              </div>
            )}
          </div>

          {/* The money column exists only when the client may see prices. */}
          {showMoney && (
            <div className="shrink-0 self-stretch border-l border-border/70 pl-5 pr-1">
              <div className="space-y-2.5 whitespace-nowrap min-w-[140px]">
                {allowanceCents != null && allowanceCents > 0 && (
                  <div>
                    <div className="text-data text-muted-foreground uppercase tracking-wide mb-0.5">Allowance</div>
                    <div className="text-sm font-semibold tabular-nums">{formatCents(allowanceCents)}</div>
                  </div>
                )}
                <div>
                  <div className="text-data text-muted-foreground uppercase tracking-wide mb-0.5">Selected</div>
                  <div className="text-sm font-semibold tabular-nums text-primary">
                    {chosenPrice != null ? formatCents(chosenPrice) : "—"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {!confirmed && canChoose && options.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Open an option to see the photos and the details, then choose the one you'd like.
        </p>
      )}

      {/* The builder's own options block. No kebab, no Add, no Approve — a
          client's one action is opening a card, which is where they choose. */}
      <OptionsSection
        options={options.map(toOptionView)}
        onOpen={(option) => setOpenOptionId(option.id)}
        chosenLabel="Your choice"
        allowanceCents={allowanceCents}
        hasDecision={!!chosen}
        emptyHint="Your builder hasn't added options to choose from yet."
        viewStorageKey="client-selection-options-view"
      />

      <ClientOptionDialog
        option={openOption}
        open={!!openOptionId}
        onOpenChange={(next) => setOpenOptionId(next ? openOptionId : null)}
        showPrice={showMoney}
        canChoose={canChoose && !confirmed && selection.clientCanChange !== false}
        choosing={choose.isPending}
        onChoose={() => openOptionId && choose.mutate(openOptionId)}
      />

      {canComment && (
        <Card data-testid="client-selection-comments">
          <CardContent className="p-4 md:p-6 space-y-3">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Comments
                {comments.length > 0 && (
                  <span className="text-data text-muted-foreground uppercase tracking-wide">
                    {comments.length}
                  </span>
                )}
              </h2>
              {/* The same thread the builder sees on their selection page —
                  worth saying, so a client knows a comment reaches someone. */}
              <p className="text-sm text-muted-foreground mt-0.5">
                Anything you post here goes to your builder on this selection.
              </p>
            </div>

            {comments.length > 0 && (
              <div className="space-y-2">
                {comments.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      "rounded-md border p-3 text-sm",
                      c.isClientComment ? "bg-primary-light/60 border-primary/20" : "bg-muted/40",
                    )}
                    data-testid={`client-comment-${c.id}`}
                  >
                    <div className="text-xs text-muted-foreground mb-1">
                      {c.createdByName || (c.isClientComment ? "You" : "Your builder")}
                      {c.createdAt ? ` · ${format(new Date(c.createdAt), "d MMM yyyy 'at' h:mm a")}` : ""}
                    </div>
                    <p className="whitespace-pre-wrap">{c.content}</p>
                  </div>
                ))}
              </div>
            )}

            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask a question or leave a note about this selection"
              rows={3}
              data-testid="input-selection-comment"
            />
            <Button
              size="sm"
              disabled={!draft.trim() || comment.isPending}
              onClick={() => comment.mutate(draft.trim())}
              data-testid="button-post-selection-comment"
            >
              {comment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
    </ClientScroll>
  );
}
