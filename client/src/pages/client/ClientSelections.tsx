import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { Loader2, Palette } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import {
  ClientGroupHeader,
  ClientListPage,
  ClientToolbarSelect,
} from "@/components/client/ClientListPage";
import { Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { firstImage, getCategoryColour } from "@/components/selections/selectionHelpers";
import { ClientEmpty, ClientLoading, ClientPage, ClientStatus, type ClientTone } from "@/components/client/ClientPage";

/**
 * Selections as a client sees them: what they still have to choose, and what
 * has been signed off. A visual list — the thing being chosen is a tile, a tap
 * or a benchtop, so the photo is the content and a text row was the wrong
 * shape for it. Photos come from the options' own attachments, which the
 * server already sends (the builder's list draws them the same way, through
 * OptionThumbStack).
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
  attachments?: Array<{ id: string; filePath?: string | null; fileType?: string | null; thumbnailX?: number | null; thumbnailY?: number | null }>;
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


/**
 * Gallery card, deliberately the same shape as the builder's SelectionCard:
 * the photo IS the card, with the status over it and the detail underneath.
 * A client picking tiles is shopping, not reading a table.
 *
 * Builder-only furniture (quick view, the 3-dot menu, the budget bar) is left
 * out rather than disabled.
 */
function ClientSelectionCard({
  selection,
  onOpen,
}: {
  selection: ClientSelection;
  onOpen: () => void;
}) {
  const { label, tone } = selectionStatus(selection);
  const options = selection.options ?? [];
  const chosen = options.find((o) => o.approvedAt) ?? options.find((o) => o.isSelectedByClient);
  const images = (chosen ? [firstImage(chosen as any)] : options.map((o) => firstImage(o as any)))
    .filter(Boolean)
    .slice(0, 3) as Array<{ id: string; filePath?: string | null; thumbnailX?: number | null; thumbnailY?: number | null }>;

  return (
    <div
      className="group bg-card rounded-xl border border-border/80 overflow-hidden cursor-pointer hover-elevate"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      data-testid={`client-selection-${selection.id}`}
    >
      {/* Square: the app's primary image shape for selections, and the shape
          product photos are cropped to. A 4:3 band letterboxed them. */}
      <div className="relative aspect-square bg-muted/60 overflow-hidden">
        {images.length === 0 ? (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: `${getCategoryColour(selection.category)}1f` }}
          >
            <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
          </div>
        ) : images.length === 1 ? (
          <img
            src={images[0].filePath ?? ""}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
            style={{ objectPosition: `${images[0].thumbnailX ?? 50}% ${images[0].thumbnailY ?? 50}%` }}
          />
        ) : (
          <div className="grid grid-cols-3 gap-px h-full">
            {images.map((att, i) => (
              <img
                key={att.id}
                src={att.filePath ?? ""}
                alt=""
                loading="lazy"
                className={cn("w-full h-full object-cover", i === 0 && images.length === 2 && "col-span-2")}
                style={{ objectPosition: `${att.thumbnailX ?? 50}% ${att.thumbnailY ?? 50}%` }}
              />
            ))}
          </div>
        )}
        <div className="absolute top-2 left-2 z-[1]">
          <ClientStatus label={label} tone={tone} className="backdrop-blur-sm" />
        </div>
        {options.length > 0 && !chosen && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/55 text-white text-[10px] px-2 py-0.5">
            {options.length} option{options.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="p-3">
        <div className="font-medium leading-snug line-clamp-2">{selection.name}</div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          {selection.category && (
            <span className="inline-flex items-center gap-1 truncate">
              <span
                className="rounded-full shrink-0"
                style={{ width: 5, height: 5, backgroundColor: getCategoryColour(selection.category) }}
              />
              {selection.category}
            </span>
          )}
          {selection.category && selection.room && <span className="text-muted-foreground/40">·</span>}
          {selection.room && <span className="truncate">{selection.room}</span>}
        </div>
        <div className="mt-2 text-sm truncate">
          {chosen ? (
            <span className="text-foreground">{chosen.name}</span>
          ) : selection.deadline ? (
            <span className="text-muted-foreground">
              Choose by {format(new Date(selection.deadline), "d MMM yyyy")}
            </span>
          ) : (
            <span className="text-muted-foreground">Waiting on your choice</span>
          )}
        </div>
      </div>
    </div>
  );
}

type StatusFilter = "all" | "to-choose" | "sent" | "confirmed";
type GroupBy = "room" | "category" | "none";

export default function ClientSelections() {
  const { projectId } = useParams<{ projectId: string }>();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("room");

  const { data: selections = [], isLoading } = useQuery<ClientSelection[]>({
    queryKey: [`/api/selections/with-options?projectId=${projectId}`],
    enabled: !!projectId,
  });

  const statusOf = (s: ClientSelection): StatusFilter => {
    const label = selectionStatus(s).label;
    return label === "Choose an option" ? "to-choose" : label === "Your choice sent" ? "sent" : "confirmed";
  };

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matched = selections.filter((s) => {
      if (status !== "all" && statusOf(s) !== status) return false;
      if (!term) return true;
      return [s.name, s.room, s.category, ...(s.options ?? []).map((o) => o.name)]
        .some((field) => (field ?? "").toLowerCase().includes(term));
    });

    // Waiting-on-you first: the reason a client opens this page.
    const rank = (s: ClientSelection) => ({ "to-choose": 0, sent: 1, confirmed: 2, all: 3 }[statusOf(s)]);
    const ordered = [...matched].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

    if (groupBy === "none") return [["", ordered] as const];
    const by = new Map<string, ClientSelection[]>();
    for (const selection of ordered) {
      const key = (groupBy === "room" ? selection.room : selection.category) || "Everything else";
      by.set(key, [...(by.get(key) ?? []), selection]);
    }
    return Array.from(by.entries());
  }, [selections, search, status, groupBy]);

  const toChoose = selections.filter((s) => statusOf(s) === "to-choose").length;
  const shown = groups.reduce((sum, [, items]) => sum + items.length, 0);

  return (
    <ClientListPage
      title="Selections"
      chips={
        toChoose > 0
          ? [{ label: `${toChoose} to choose`, tone: "alert" as const }]
          : selections.length > 0
            ? [{ label: "All chosen" }]
            : []
      }
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search selections..."
      controls={
        <>
          <ClientToolbarSelect>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="w-[150px]" data-testid="select-selection-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All selections</SelectItem>
                <SelectItem value="to-choose">Still to choose</SelectItem>
                <SelectItem value="sent">Your choice sent</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
              </SelectContent>
            </Select>
          </ClientToolbarSelect>
          <ClientToolbarSelect>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
              <SelectTrigger className="w-[140px]" data-testid="select-selection-grouping">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="room">By room</SelectItem>
                <SelectItem value="category">By category</SelectItem>
                <SelectItem value="none">No grouping</SelectItem>
              </SelectContent>
            </Select>
          </ClientToolbarSelect>
        </>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : selections.length === 0 ? (
        <EmptyState
          icon={Palette}
          title="No selections yet"
          description="Your builder will add the items you need to choose. They'll show up here."
          variant="inline"
          className="py-16"
        />
      ) : shown === 0 ? (
        <EmptyState
          icon={Palette}
          title="Nothing matches that"
          description="Try a different search, or change the filter."
          variant="inline"
          className="py-16"
        />
      ) : (
        groups.map(([groupName, items]) => (
          <div key={groupName || "all"}>
            {groupName && (
              <ClientGroupHeader title={groupName} meta={`${items.length} item${items.length === 1 ? "" : "s"}`} />
            )}
            {/* Two across even on a phone: square photo tiles read as a
                catalogue, and one-per-row made each image enormous. */}
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4 p-4">
              {items.map((selection) => (
                <ClientSelectionCard
                  key={selection.id}
                  selection={selection}
                  onOpen={() => navigate(`/projects/${projectId}/selections/${selection.id}`)}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </ClientListPage>
  );
}
