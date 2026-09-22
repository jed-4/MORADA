import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, Check, ExternalLink, Image as ImageIcon, Loader2, MessageSquare } from "lucide-react";
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
import { ClientOptionDialog } from "./ClientOptionDialog";
import { ClientError, ClientLoading, ClientPage, ClientStatus } from "@/components/client/ClientPage";
import { selectionStatus, type ClientSelection, type ClientSelectionOption } from "./ClientSelections";

/**
 * One selection and its options.
 *
 * The client sees what they're choosing between, picks one, and can talk to
 * their builder about it. Choosing posts to /client-select, which runs the
 * SAME handler as the emailed selection link: the lock, clientCanChange, the
 * decision log, the builder notification and the auto-maintained
 * over-allowance variation all behave identically.
 *
 * A pick is a pick, not an approval — the builder confirms it (Jed,
 * 2026-09-17), which is why there is no approve control here.
 *
 * Prices appear only when the server sent them — that needs both the role's
 * "See prices" tick and this selection's own price setting.
 */

function OptionCard({
  option,
  showPrice,
  canChoose,
  choosing,
  onChoose,
  onOpen,
}: {
  option: ClientSelectionOption;
  showPrice: boolean;
  canChoose: boolean;
  choosing: boolean;
  onChoose: () => void;
  onOpen: () => void;
}) {
  const approved = !!option.approvedAt;
  const picked = !!option.isSelectedByClient;
  const image = firstImage(option as any);
  const photoCount = (option.attachments ?? []).filter((a) => a.fileType?.toLowerCase() === "image").length;
  return (
    <Card
      className={cn(
        "relative overflow-hidden cursor-pointer hover-elevate",
        approved && "border-[hsl(var(--sage))]",
        !approved && picked && "border-primary",
      )}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      data-testid={`client-option-${option.id}`}
    >
      {/* The photo is the point of a selection — full-bleed, not a thumbnail.
          The card is a summary: tapping it opens everything the builder
          attached (every photo, the specs, the documents, the link). */}
      {image?.filePath ? (
        <img
          src={image.filePath}
          alt=""
          loading="lazy"
          className="w-full aspect-[4/3] object-cover"
          style={{ objectPosition: `${image.thumbnailX ?? 50}% ${image.thumbnailY ?? 50}%` }}
        />
      ) : (
        <div className="w-full aspect-[4/3] bg-muted flex items-center justify-center">
          <ImageIcon className="h-6 w-6 text-muted-foreground/60" />
        </div>
      )}
      {photoCount > 1 && (
        <span className="absolute top-2 right-2 rounded-full bg-black/55 text-white text-[10px] px-2 py-0.5">
          {photoCount} photos
        </span>
      )}
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium">{option.name}</div>
            {(option.brand || option.sku) && (
              <div className="text-sm text-muted-foreground">
                {[option.brand, option.sku].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
          {approved ? (
            <ClientStatus label="Confirmed" tone="done" />
          ) : picked ? (
            <ClientStatus label="Your choice" tone="info" />
          ) : null}
        </div>

        {option.description && <p className="text-sm whitespace-pre-wrap">{option.description}</p>}

        <div className="flex items-center justify-between gap-3 pt-1">
          {option.url ? (
            <a
              href={option.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
            >
              View product <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span />
          )}
          {showPrice && option.totalCost != null && (
            <span className="tabular-nums font-medium">{formatCents(option.totalCost)}</span>
          )}
        </div>

        {canChoose && !approved && (
          <Button
            className="w-full"
            variant={picked ? "outline" : "default"}
            disabled={choosing || picked}
            onClick={(e) => { e.stopPropagation(); onChoose(); }}
            data-testid={`button-choose-${option.id}`}
          >
            {choosing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {picked ? "Chosen" : "Choose this"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

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

  const { data: selection, isLoading, isError } = useQuery<ClientSelection>({
    queryKey: [`/api/selections/${id}`],
    enabled: !!id,
  });

  const { data: fetchedOptions = [] } = useQuery<ClientSelectionOption[]>({
    queryKey: [`/api/selections/${id}/options`],
    enabled: !!id,
  });

  const { toast } = useToast();
  const { hasPermission } = useClientPortal();
  const canChoose = hasPermission(PORTAL_KEYS.selections, "edit");
  const canComment = hasPermission(PORTAL_KEYS.selections, "add");
  const [draft, setDraft] = useState("");
  const [openOptionId, setOpenOptionId] = useState<string | null>(null);

  const { data: comments = [] } = useQuery<SelectionComment[]>({
    queryKey: [`/api/selections/${id}/client-comments`],
    enabled: !!id && canComment,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/selections/${id}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/selections/${id}/options`] });
    queryClient.invalidateQueries({ queryKey: [`/api/selections/with-options?projectId=${projectId}`] });
  };

  const choose = useMutation({
    mutationFn: (optionId: string) =>
      apiRequest(`/api/selections/${id}/options/${optionId}/client-select`, "PATCH", {}),
    onSuccess: () => {
      refresh();
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
      toast({
        title: "We couldn't post that",
        description: error?.message || "Please try again.",
        variant: "destructive",
      }),
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
  const showPrice = options.some((o) => o.totalCost != null);
  const confirmed = options.find((o) => o.approvedAt);

  return (
    <ClientPage
      title={selection.name}
      description={[selection.room, selection.category].filter(Boolean).join(" · ") || undefined}
      aside={<ClientStatus label={label} tone={tone} />}
    >
      <Button variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/selections`)} className="-ml-2" data-testid="button-back-to-selections">
        <ArrowLeft className="h-4 w-4 mr-2" />
        All selections
      </Button>

      {selection.deadline && !confirmed && (
        <p className="text-sm text-muted-foreground">
          Your builder would like this chosen by {format(new Date(selection.deadline), "d MMM yyyy")}.
        </p>
      )}

      {confirmed && (
        <p className="text-sm flex items-center gap-2">
          <Check className="h-4 w-4 text-[hsl(var(--sage))]" />
          <span>
            <span className="font-medium">{confirmed.name}</span> is confirmed for this selection.
          </span>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option) => (
          <OptionCard
            key={option.id}
            option={option}
            showPrice={showPrice}
            canChoose={canChoose && !confirmed && selection.clientCanChange !== false}
            choosing={choose.isPending && choose.variables === option.id}
            onChoose={() => choose.mutate(option.id)}
            onOpen={() => setOpenOptionId(option.id)}
          />
        ))}
      </div>

      {options.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Your builder hasn't added options to choose from yet.
          </CardContent>
        </Card>
      )}

      {!confirmed && options.length > 0 && !canChoose && (
        <Card>
          <CardContent className="p-4 text-sm">
            <p className="font-medium">Making your choice</p>
            <p className="text-muted-foreground mt-1">
              Use the selection link your builder emailed you to pick an option.
            </p>
          </CardContent>
        </Card>
      )}

      <ClientOptionDialog
        option={options.find((o) => o.id === openOptionId) ?? null}
        open={!!openOptionId}
        onOpenChange={(next) => setOpenOptionId(next ? openOptionId : null)}
        showPrice={showPrice}
        canChoose={canChoose && !confirmed && selection.clientCanChange !== false}
        choosing={choose.isPending}
        onChoose={() => openOptionId && choose.mutate(openOptionId)}
      />

      {canComment && (
        <Card data-testid="client-selection-comments">
          <CardContent className="p-4 md:p-6 space-y-3">
            <h2 className="font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Questions about this selection
            </h2>

            {comments.length > 0 && (
              <div className="space-y-3">
                {comments.map((c) => (
                  <div key={c.id} className="text-sm">
                    <div className="text-muted-foreground text-xs">
                      {c.createdByName || (c.isClientComment ? "You" : "Your builder")}
                      {c.createdAt ? ` · ${format(new Date(c.createdAt), "d MMM yyyy")}` : ""}
                    </div>
                    <p className="whitespace-pre-wrap">{c.content}</p>
                  </div>
                ))}
              </div>
            )}

            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask your builder a question about this selection"
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
    </ClientPage>
  );
}
