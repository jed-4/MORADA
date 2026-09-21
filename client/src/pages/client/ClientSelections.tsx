import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { Palette } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ClientEmpty, ClientLoading, ClientPage, ClientRow, ClientStatus, type ClientTone } from "@/components/client/ClientPage";

/**
 * Selections as a client sees them: what they still have to choose, and what
 * has been signed off. The builder's page is a working list with drawers,
 * bulk actions and a Product Library; none of that belongs here.
 *
 * Opening one goes to the PROJECT-scoped address. The builder list links to
 * the global /selections/:id, which the client route guard blocks — that is
 * why a client could never open a selection.
 */

export interface ClientSelectionOption {
  id: string;
  name: string;
  brand?: string | null;
  sku?: string | null;
  description?: string | null;
  url?: string | null;
  quantity?: number | null;
  unitType?: string | null;
  totalCost?: number | null;
  isSelectedByClient?: boolean | null;
  approvedAt?: string | null;
}

export interface ClientSelection {
  id: string;
  name: string;
  category?: string | null;
  room?: string | null;
  status: string;
  deadline?: string | null;
  clientCanSeePrice?: boolean | null;
  clientCanChange?: boolean | null;
  options?: ClientSelectionOption[];
}

export const selectionStatus = (s: ClientSelection): { label: string; tone: ClientTone } => {
  const options = s.options ?? [];
  if (options.some((o) => o.approvedAt) || ["approved", "ordered", "received", "completed"].includes(s.status)) {
    return { label: "Confirmed", tone: "done" };
  }
  if (options.some((o) => o.isSelectedByClient)) return { label: "Your choice sent", tone: "info" };
  return { label: "Choose an option", tone: "waiting" };
};

export default function ClientSelections() {
  const { projectId } = useParams<{ projectId: string }>();
  const [, navigate] = useLocation();

  const { data: selections = [], isLoading } = useQuery<ClientSelection[]>({
    queryKey: [`/api/selections/with-options?projectId=${projectId}`],
    enabled: !!projectId,
  });

  if (isLoading) {
    return (
      <ClientPage title="Selections">
        <ClientLoading label="Loading selections…" />
      </ClientPage>
    );
  }

  if (selections.length === 0) {
    return (
      <ClientPage title="Selections" description="Fixtures, finishes and fittings to choose for your home.">
        <ClientEmpty
          icon={Palette}
          title="No selections yet"
          description="Your builder will add the items you need to choose. They'll show up here."
        />
      </ClientPage>
    );
  }

  const toChoose = selections.filter((s) => selectionStatus(s).label === "Choose an option").length;

  return (
    <ClientPage
      title="Selections"
      description="Fixtures, finishes and fittings to choose for your home."
      aside={<div className="text-sm text-muted-foreground">{toChoose} to choose</div>}
    >
      <Card>
        <CardContent className="p-0">
          {selections.map((selection) => {
            const { label, tone } = selectionStatus(selection);
            const options = selection.options ?? [];
            const chosen = options.find((o) => o.approvedAt) ?? options.find((o) => o.isSelectedByClient);
            return (
              <ClientRow
                key={selection.id}
                title={selection.name}
                meta={[
                  selection.room,
                  selection.category,
                  chosen ? `Chosen: ${chosen.name}` : options.length ? `${options.length} option${options.length === 1 ? "" : "s"}` : null,
                  selection.deadline ? `By ${format(new Date(selection.deadline), "d MMM yyyy")}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                status={<ClientStatus label={label} tone={tone} />}
                onClick={() => navigate(`/projects/${projectId}/selections/${selection.id}`)}
              />
            );
          })}
        </CardContent>
      </Card>
    </ClientPage>
  );
}
