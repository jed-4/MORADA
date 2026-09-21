import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCents } from "@shared/money";
import { cn } from "@/lib/utils";
import { ClientError, ClientLoading, ClientPage, ClientStatus } from "@/components/client/ClientPage";
import { selectionStatus, type ClientSelection, type ClientSelectionOption } from "./ClientSelections";

/**
 * One selection and its options.
 *
 * Read-only for now: the client can see what they're choosing between, what
 * they picked and what the builder confirmed. Choosing and commenting in the
 * app need their own endpoints (the emailed selection link has them; a
 * session-authenticated pair is the next PR), so the page points at the link
 * rather than showing buttons that do nothing.
 *
 * Prices appear only when the server sent them — that needs both the role's
 * "See prices" tick and this selection's own price setting.
 */

function OptionCard({ option, showPrice }: { option: ClientSelectionOption; showPrice: boolean }) {
  const approved = !!option.approvedAt;
  const picked = !!option.isSelectedByClient;
  return (
    <Card
      className={cn(approved && "border-[hsl(var(--sage))]", !approved && picked && "border-primary")}
      data-testid={`client-option-${option.id}`}
    >
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
      </CardContent>
    </Card>
  );
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

      <div className="grid gap-3 md:grid-cols-2">
        {options.map((option) => (
          <OptionCard key={option.id} option={option} showPrice={showPrice} />
        ))}
      </div>

      {options.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Your builder hasn't added options to choose from yet.
          </CardContent>
        </Card>
      )}

      {!confirmed && options.length > 0 && (
        <Card>
          <CardContent className="p-4 text-sm">
            <p className="font-medium">Making your choice</p>
            <p className="text-muted-foreground mt-1">
              Use the selection link your builder emailed you to pick an option or leave a comment. Choosing
              here in the portal is coming shortly.
            </p>
          </CardContent>
        </Card>
      )}
    </ClientPage>
  );
}
