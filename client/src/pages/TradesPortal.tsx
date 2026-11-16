import { useMemo, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronRight, ExternalLink, FileText, Image as ImageIcon, Package, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { PortalLoading, PortalError } from "@/components/portal/PortalStateBoundary";
import { CroppedImage } from "@/components/CroppedImage";
import { ImageLightbox } from "@/components/ImageLightbox";

/**
 * The site view of a project's selections: the page behind the QR code that
 * goes up on site. Public and read-only — anyone with the link can browse, so
 * the server sends no prices, no internal notes and no client-hidden options.
 */

interface SiteAttachment {
  id: string;
  fileName: string;
  fileType: string;
  mimeType?: string | null;
  filePath: string;
  thumbnailX?: number;
  thumbnailY?: number;
  thumbnailZoom?: number;
}

interface SiteOption {
  id: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  brand?: string | null;
  quantity?: number | null;
  unitType?: string | null;
  url?: string | null;
  specifications?: Record<string, unknown> | null;
  isSelectedByClient?: boolean | null;
  approvedAt?: string | null;
  attachments: SiteAttachment[];
}

interface SiteSelection {
  id: string;
  name: string;
  category?: string | null;
  room?: string | null;
  description?: string | null;
  status?: string | null;
  options: SiteOption[];
}

interface SiteViewData {
  project: { id: string; name: string; address?: string | null };
  companyName?: string | null;
  selections: SiteSelection[];
}

type GroupBy = "room" | "category";

const isImage = (a: SiteAttachment) =>
  a.fileType?.toLowerCase() === "image" || /\.(jpe?g|png|gif|webp|avif)$/i.test(a.fileName || "");
const imagesOf = (o?: SiteOption) => (o?.attachments ?? []).filter(isImage);

/** The decided option: builder-approved wins over a client pick still awaiting approval. */
function chosenOption(sel: SiteSelection): SiteOption | undefined {
  return sel.options.find((o) => o.approvedAt) ?? sel.options.find((o) => o.isSelectedByClient);
}

function decisionOf(sel: SiteSelection): { label: string; tone: "done" | "pending" | "open" } {
  if (sel.options.some((o) => o.approvedAt)) return { label: "Confirmed", tone: "done" };
  if (sel.options.some((o) => o.isSelectedByClient)) return { label: "Chosen, to be confirmed", tone: "pending" };
  return { label: "To be decided", tone: "open" };
}

function DecisionPill({ sel, className }: { sel: SiteSelection; className?: string }) {
  const { label, tone } = decisionOf(sel);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border",
        tone === "done" && "bg-status-success-bg text-status-success border-status-success/30",
        tone === "pending" && "bg-[hsl(var(--amber-light))] text-foreground border-[hsl(var(--amber))]/40",
        tone === "open" && "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      {tone === "done" && <CheckCircle2 className="w-3 h-3" />}
      {label}
    </span>
  );
}

const prettyUrl = (url: string) => {
  const trimmed = url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return trimmed.length > 48 ? `${trimmed.slice(0, 45)}…` : trimmed;
};

function SelectionTile({ sel, onOpen }: { sel: SiteSelection; onOpen: () => void }) {
  const chosen = chosenOption(sel);
  const hero = imagesOf(chosen)[0] ?? sel.options.map((o) => imagesOf(o)[0]).find(Boolean);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left bg-card rounded-xl border border-border/80 overflow-hidden hover-elevate flex flex-col"
      data-testid={`site-selection-${sel.id}`}
    >
      <div className="relative w-full aspect-square bg-muted/60 overflow-hidden">
        {hero ? (
          <CroppedImage src={hero.filePath} x={hero.thumbnailX} y={hero.thumbnailY} zoom={hero.thumbnailZoom} loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
          </div>
        )}
      </div>
      <div className="p-2.5 space-y-1 min-w-0 w-full">
        <div className="text-sm font-medium leading-tight truncate">{sel.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {chosen ? [chosen.name, chosen.brand].filter(Boolean).join(" · ") : `${sel.options.length} option${sel.options.length === 1 ? "" : "s"}`}
        </div>
        <DecisionPill sel={sel} />
      </div>
    </button>
  );
}

function OptionDetail({ option, chosen }: { option: SiteOption; chosen: boolean }) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const images = imagesOf(option);
  const documents = option.attachments.filter((a) => !isImage(a));
  const specs = Object.entries(option.specifications ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && String(v).trim() !== "",
  );
  const hero = images[Math.min(active, Math.max(images.length - 1, 0))];

  return (
    <div className={cn("rounded-lg border p-3 space-y-3", chosen ? "border-[hsl(var(--sage))]/60 bg-[hsl(var(--sage))]/5" : "border-border")}>
      <div className="flex gap-3">
        <div className="w-28 sm:w-40 shrink-0 space-y-1.5">
          {hero ? (
            <button
              type="button"
              className="block w-full aspect-square rounded-md overflow-hidden bg-muted cursor-zoom-in"
              onClick={() => setLightbox(Math.min(active, images.length - 1))}
              aria-label={`View ${option.name} photo full size`}
              data-testid={`button-site-photo-${option.id}`}
            >
              <CroppedImage src={hero.filePath} alt={option.name} x={hero.thumbnailX} y={hero.thumbnailY} zoom={hero.thumbnailZoom} />
            </button>
          ) : (
            <div className="w-full aspect-square rounded-md bg-muted flex items-center justify-center">
              <ImageIcon className="w-6 h-6 text-muted-foreground/40" />
            </div>
          )}
          {images.length > 1 && (
            <div className="grid grid-cols-4 gap-1">
              {images.slice(0, 8).map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActive(i)}
                  className={cn("aspect-square rounded overflow-hidden border-2", i === active ? "border-primary" : "border-transparent")}
                  aria-label={`Photo ${i + 1}`}
                >
                  <CroppedImage src={img.filePath} x={img.thumbnailX} y={img.thumbnailY} zoom={img.thumbnailZoom} loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start gap-2 flex-wrap">
            <span className="text-sm font-semibold leading-tight">{option.name}</span>
            {chosen && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-status-success-bg text-status-success border border-status-success/30">
                <CheckCircle2 className="w-3 h-3" />
                {option.approvedAt ? "Confirmed" : "Chosen"}
              </span>
            )}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            {option.brand && (<><dt className="text-muted-foreground">Brand</dt><dd className="min-w-0 break-words">{option.brand}</dd></>)}
            {option.sku && (<><dt className="text-muted-foreground">SKU</dt><dd className="min-w-0 break-all font-mono">{option.sku}</dd></>)}
            {option.quantity != null && (
              <><dt className="text-muted-foreground">Qty</dt><dd>{option.quantity}{option.unitType ? ` ${option.unitType}` : ""}</dd></>
            )}
            {specs.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground capitalize">{k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ")}</dt>
                <dd className="min-w-0 break-words">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {option.description && <p className="text-xs whitespace-pre-wrap text-foreground/90">{option.description}</p>}

      {(option.url || documents.length > 0) && (
        <div className="flex flex-col gap-1">
          {option.url && (
            <a
              href={option.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary underline underline-offset-2 break-all"
            >
              <ExternalLink className="w-3 h-3 shrink-0" />
              {prettyUrl(option.url)}
            </a>
          )}
          {documents.map((doc) => (
            <a
              key={doc.id}
              href={doc.filePath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary underline underline-offset-2 break-all"
            >
              <FileText className="w-3 h-3 shrink-0" />
              {doc.fileName}
            </a>
          ))}
        </div>
      )}

      <ImageLightbox
        images={images.map((img) => ({ src: img.filePath, alt: option.name }))}
        index={lightbox}
        onIndexChange={setLightbox}
      />
    </div>
  );
}

function SelectionDialog({ sel, onClose }: { sel: SiteSelection | null; onClose: () => void }) {
  if (!sel) return null;
  const chosen = chosenOption(sel);
  const others = sel.options.filter((o) => o.id !== chosen?.id);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl" data-testid="site-selection-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap pr-6">
            {sel.name}
            <DecisionPill sel={sel} />
          </DialogTitle>
          <DialogDescription>
            {[sel.room, sel.category].filter(Boolean).join(" · ") || "Selection"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {sel.description && <p className="text-sm whitespace-pre-wrap">{sel.description}</p>}
          {chosen && <OptionDetail option={chosen} chosen />}
          {!chosen && sel.options.length === 0 && (
            <p className="text-sm text-muted-foreground italic">Nothing has been put forward for this yet.</p>
          )}
          {!chosen && others.map((o) => <OptionDetail key={o.id} option={o} chosen={false} />)}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type SiteTab = "plans" | "selections";

interface SiteFile {
  id: string;
  folder: string;
  name: string;
  mimeType?: string | null;
  fileSize?: number | null;
  addedAt?: string | null;
  url: string;
}

function sizeLabel(bytes?: number | null) {
  if (bytes == null) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The builder's on-site files, grouped by folder. Big tap targets — this is
 *  read on a phone, often with gloves on. PDFs open in the phone's viewer. */
function SiteFiles({ files }: { files: SiteFile[] }) {
  const byFolder = useMemo(() => {
    const out = new Map<string, SiteFile[]>();
    for (const f of files) {
      if (!out.has(f.folder)) out.set(f.folder, []);
      out.get(f.folder)!.push(f);
    }
    return Array.from(out.entries());
  }, [files]);

  return (
    <div className="space-y-6" data-testid="site-files">
      {byFolder.map(([folder, list]) => (
        <section key={folder}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{folder}</h2>
          <div className="rounded-lg border border-border bg-card divide-y divide-border overflow-hidden">
            {list.map((f) => {
              const isImage = f.mimeType?.startsWith("image/");
              return (
                <a
                  key={f.id}
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 min-h-[56px] hover:bg-muted/40 active:bg-muted"
                  data-testid={`link-site-file-${f.id}`}
                >
                  {isImage ? (
                    <ImageIcon className="w-5 h-5 text-muted-foreground shrink-0" />
                  ) : (
                    <FileText className="w-5 h-5 text-[hsl(var(--coral))] shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        sizeLabel(f.fileSize),
                        f.addedAt ? `Added ${new Date(f.addedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}` : null,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
                </a>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function TradesPortal() {
  const { token } = useParams<{ token: string }>();
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("room");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<SiteViewData>({
    queryKey: ["/api/portal/project", token, "trades"],
    queryFn: async () => {
      const res = await fetch(`/api/portal/project/${token}/trades`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load selections");
      }
      return res.json();
    },
    enabled: !!token,
  });

  // Files switched "on site" by the builder (server/siteBoard.ts). A failure
  // here only hides the Plans tab — the selections still load.
  const { data: files = [] } = useQuery<SiteFile[]>({
    queryKey: ["/api/portal/project", token, "files"],
    queryFn: async () => {
      const res = await fetch(`/api/portal/project/${token}/files`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
  });
  const [tabChoice, setTabChoice] = useState<SiteTab | null>(null);

  const selections = data?.selections ?? [];

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (s: SiteSelection) =>
      !q ||
      [s.name, s.room, s.category, ...s.options.flatMap((o) => [o.name, o.brand, o.sku])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    const out = new Map<string, SiteSelection[]>();
    for (const s of selections.filter(matches)) {
      const key = (groupBy === "room" ? s.room : s.category) || (groupBy === "room" ? "General" : "Uncategorised");
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(s);
    }
    return Array.from(out.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [selections, search, groupBy]);

  if (isLoading) return <PortalLoading message="Loading selections…" />;

  if (error || !data) {
    return (
      <PortalError
        title="Link not found"
        description={(error as any)?.message || "This link may have been replaced or removed."}
      />
    );
  }

  const { project, companyName } = data;
  const confirmed = selections.filter((s) => s.options.some((o) => o.approvedAt)).length;
  const openSel = selections.find((s) => s.id === openId) ?? null;

  // A tab shows only when it has something in it; with neither, Selections
  // keeps its own empty state. Plans lead: they're what's checked on site.
  const tabs: SiteTab[] = [
    ...(files.length > 0 ? (["plans"] as const) : []),
    ...(selections.length > 0 || files.length === 0 ? (["selections"] as const) : []),
  ];
  const tab: SiteTab = tabChoice && tabs.includes(tabChoice) ? tabChoice : tabs[0];

  return (
    <PortalLayout
      title={project.name}
      subtitle={[companyName, project.address].filter(Boolean).join(" · ")}
      headerRight={tab === "selections" ? (
        <span className="text-xs text-muted-foreground tabular-nums shrink-0 hidden sm:inline">
          {confirmed} of {selections.length} confirmed
        </span>
      ) : undefined}
      maxWidth="max-w-4xl"
      footerNote="Always the current version. Check here before ordering, building or installing."
    >
      <div className="sticky top-0 z-10 -mx-4 -mt-6 mb-4 border-b border-border bg-background/90 backdrop-blur">
        {tabs.length > 1 && (
          <div className="px-4 pt-2 flex items-center gap-1" role="tablist">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTabChoice(t)}
                className={cn(
                  "h-8 px-3 text-sm border-b-2 -mb-px",
                  tab === t ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground",
                )}
                data-testid={`tab-site-${t}`}
              >
                {t === "plans" ? `Plans & files (${files.length})` : `Selections (${selections.length})`}
              </button>
            ))}
          </div>
        )}
        {tab === "selections" && <div className="px-4 py-2 flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search item, room, brand, SKU…"
              className="pl-8 h-8 text-sm"
              data-testid="input-site-search"
            />
          </div>
          <div className="flex items-center border rounded-md overflow-hidden h-8 text-xs shrink-0">
            {(["room", "category"] as const).map((g, i) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroupBy(g)}
                className={cn(
                  "px-2.5 h-full capitalize",
                  i > 0 && "border-l",
                  groupBy === g ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground",
                )}
                data-testid={`button-group-${g}`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>}
      </div>

      {tab === "plans" ? (
        <SiteFiles files={files} />
      ) : groups.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-sm text-muted-foreground">
            {selections.length === 0 ? "No selections have been added to this project yet." : "Nothing matches that search."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([name, sels]) => {
            const isCollapsed = !!collapsed[`${groupBy}:${name}`];
            return (
              <section key={name}>
                <button
                  type="button"
                  className="w-full flex items-center gap-1.5 mb-2 text-left"
                  onClick={() => setCollapsed((c) => ({ ...c, [`${groupBy}:${name}`]: !isCollapsed }))}
                  aria-expanded={!isCollapsed}
                >
                  {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{name}</h2>
                  <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 tabular-nums">{sels.length}</span>
                </button>
                {!isCollapsed && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {sels.map((sel) => (
                      <SelectionTile key={sel.id} sel={sel} onOpen={() => setOpenId(sel.id)} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <SelectionDialog sel={openSel} onClose={() => setOpenId(null)} />
    </PortalLayout>
  );
}
