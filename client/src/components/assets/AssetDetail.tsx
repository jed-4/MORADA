import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CalendarClock,
  FileText,
  Gauge,
  History,
  Loader2,
  MoreVertical,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/use-permission";
import { useUpload } from "@/hooks/use-upload";
import { apiRequest } from "@/lib/queryClient";
import type { AssetComplianceItem, AssetDetail as AssetDetailData, AssetServiceSchedule } from "@shared/schema";
import {
  ASSET_DOCUMENT_CATEGORIES,
  ASSET_DOCUMENT_CATEGORY_LABELS,
  ASSET_EVENT_KIND_LABELS,
  ASSET_STATUS_LABELS,
  ASSET_TYPE_LABELS,
  COMPLIANCE_KIND_LABELS,
  METER_UNIT,
  complianceDue,
  isHeavyVehicle,
  serviceDue,
  todayKey,
  type AssetDocumentCategory,
  type AssetEventKind,
  type AssetStatus,
  type AssetType,
  type ComplianceKind,
  type MeterType,
} from "@shared/assets";
import { AssetDialog, ComplianceDialog, EventDialog, ScheduleDialog, type EventPreset } from "./AssetDialogs";
import { PrestartDefectBanner, PrestartsSection } from "./AssetPrestarts";
import { AssetCostsSection } from "./AssetCosts";
import { AssetRechargeSection } from "./AssetRecharge";
import {
  ASSIGNABLE_USERS_KEY,
  DueChip,
  assetKey,
  errorText,
  invalidateAssets,
  meter,
  money,
  relativeDays,
  shortDate,
  type AssignableUser,
  CHIP_BUTTON,
  ICON_BUTTON,
  PRIMARY_BUTTON,
  SectionHeader,
} from "./assetsShared";

function Section({
  icon,
  title,
  description,
  action,
  children,
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <Card className="overflow-hidden min-w-0" data-testid={testId}>
      <SectionHeader icon={icon} title={title} hint={description}>{action}</SectionHeader>
      {children}
    </Card>
  );
}

function AddButton({ onClick, children, testId }: { onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={PRIMARY_BUTTON}
      data-testid={testId}
    >
      <Plus className="w-3.5 h-3.5" />
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-4 text-xs text-muted-foreground text-center">{children}</p>;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-xs font-medium truncate">{children || "—"}</div>
    </div>
  );
}

function RowMenu({ onEdit, onDelete, label }: { onEdit?: () => void; onDelete: () => void; label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={label}>
          <MoreVertical className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onEdit && (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5 mr-2" />Edit
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="text-destructive" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type PendingDelete =
  | { kind: "asset" }
  | { kind: "compliance"; id: string; label: string }
  | { kind: "schedule"; id: string; label: string }
  | { kind: "event"; id: string }
  | { kind: "document"; id: string; label: string };

export function AssetDetail({ assetId }: { assetId: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const canEdit = usePermission("business.assets", "edit");
  const canDelete = usePermission("business.assets", "delete");
  // The money (costs, job charges, purchase, finance) needs business.asset_costs;
  // the server strips it otherwise, so these parts are left out, not blank.
  const seeCosts = usePermission("business.asset_costs", "view");
  const today = todayKey();

  const { data: asset, isLoading, error } = useQuery<AssetDetailData>({ queryKey: assetKey(assetId) });
  const { data: people = [] } = useQuery<AssignableUser[]>({ queryKey: ASSIGNABLE_USERS_KEY });
  const nameOf = (id: string | null | undefined) => (id ? people.find((p) => p.id === id)?.displayName ?? "Former team member" : null);

  const [editing, setEditing] = useState(false);
  const [compliance, setCompliance] = useState<{ open: boolean; item: AssetComplianceItem | null }>({ open: false, item: null });
  const [schedule, setSchedule] = useState<{ open: boolean; schedule: AssetServiceSchedule | null }>({ open: false, schedule: null });
  const [eventPreset, setEventPreset] = useState<EventPreset | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const [docCategory, setDocCategory] = useState<AssetDocumentCategory>("rego");
  const fileInput = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload();

  const setStatus = useMutation({
    mutationFn: (status: AssetStatus) => apiRequest(`/api/assets/${assetId}`, "PATCH", { status }),
    onSuccess: () => invalidateAssets(assetId),
    onError: (err) => toast({ title: errorText(err, "Couldn't change the status"), variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (p: PendingDelete) => {
      switch (p.kind) {
        case "asset": return apiRequest(`/api/assets/${assetId}`, "DELETE");
        case "compliance": return apiRequest(`/api/assets/${assetId}/compliance/${p.id}`, "DELETE");
        case "schedule": return apiRequest(`/api/assets/${assetId}/schedules/${p.id}`, "DELETE");
        case "event": return apiRequest(`/api/assets/${assetId}/events/${p.id}`, "DELETE");
        case "document": return apiRequest(`/api/assets/${assetId}/documents/${p.id}`, "DELETE");
      }
    },
    onSuccess: (_r, p) => {
      if (p.kind === "asset") {
        invalidateAssets();
        navigate("/business/assets");
      } else {
        invalidateAssets(assetId);
      }
    },
    onError: (err) => toast({ title: errorText(err, "Couldn't delete that"), variant: "destructive" }),
  });

  const attach = useMutation({
    mutationFn: async (file: File) => {
      const uploaded = await uploadFile(file);
      if (!uploaded) throw new Error("Upload failed");
      return apiRequest(`/api/assets/${assetId}/documents`, "POST", {
        category: docCategory,
        fileName: file.name,
        fileUrl: uploaded.objectPath,
        fileType: file.type || null,
        fileSize: file.size,
      });
    },
    onSuccess: () => invalidateAssets(assetId),
    onError: (err) => toast({ title: errorText(err, "Couldn't attach the file"), variant: "destructive" }),
  });

  const scheduleRows = useMemo(
    () => (asset ? asset.serviceSchedules.map((s) => ({ s, due: serviceDue(s, asset, today) })) : []),
    [asset, today],
  );

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error || !asset) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-muted-foreground">Couldn't find that asset.</p>
        <Button size="sm" variant="outline" onClick={() => navigate("/business/assets")}>Back to the register</Button>
      </div>
    );
  }

  const unit = METER_UNIT[asset.meterType as MeterType] ?? "";
  const heavy = isHeavyVehicle(asset.gvmKg);
  const isRoad = asset.assetType === "vehicle" || asset.assetType === "trailer";
  const archived = asset.status === "archived" || asset.status === "sold";

  const deleteCopy = (() => {
    if (!pendingDelete) return { title: "", description: "" };
    switch (pendingDelete.kind) {
      case "asset": return { title: `Delete "${asset.name}"?`, description: "Its due dates, service history and document links go with it. Archive it instead to keep the history. This can't be undone." };
      case "compliance": return { title: `Delete "${pendingDelete.label}"?`, description: "This can't be undone." };
      case "schedule": return { title: `Delete the "${pendingDelete.label}" schedule?`, description: "Logged services stay in the history." };
      case "event": return { title: "Delete this history entry?", description: "The meter reading on the asset isn't wound back." };
      case "document": return { title: `Remove "${pendingDelete.label}"?`, description: "The link is removed from this asset." };
    }
  })();

  return (
    <div className="flex flex-col gap-3 p-4 max-w-6xl" data-testid="asset-detail">
      {/* Header: one line */}
      <div className="flex items-center justify-between gap-2 min-h-9">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" className={ICON_BUTTON} onClick={() => navigate("/business/assets")} aria-label="Back to the register" data-testid="button-asset-back">
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <h2 className="text-sm font-semibold truncate" data-testid="text-asset-name">{asset.name}</h2>
          {asset.rego && <Badge variant="outline" className="font-mono text-[11px] no-default-active-elevate shrink-0">{asset.rego}{asset.regoState ? ` · ${asset.regoState}` : ""}</Badge>}
          <Badge variant="secondary" className="text-[11px] no-default-active-elevate shrink-0">{ASSET_STATUS_LABELS[asset.status as AssetStatus] ?? asset.status}</Badge>
          {heavy && <Badge variant="outline" className="text-[11px] no-default-active-elevate shrink-0" title="Over 4.5t GVM — NHVR daily checks and Chain of Responsibility apply">Heavy</Badge>}
          <span className="text-xs text-muted-foreground truncate hidden md:inline">
            {ASSET_TYPE_LABELS[asset.assetType as AssetType] ?? asset.assetType}
            {[asset.year, asset.make, asset.model].filter(Boolean).length > 0 && ` · ${[asset.year, asset.make, asset.model].filter(Boolean).join(" ")}`}
          </span>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" className={CHIP_BUTTON} onClick={() => setEditing(true)} data-testid="button-edit-asset">
              <Pencil className="w-3 h-3" />Edit
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={ICON_BUTTON} aria-label="More asset actions"><MoreVertical className="w-3.5 h-3.5" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {asset.status !== "off_road" && !archived && (
                  <DropdownMenuItem onClick={() => setStatus.mutate("off_road")}>
                    <TriangleAlert className="w-3.5 h-3.5 mr-2" />Mark off road
                  </DropdownMenuItem>
                )}
                {asset.status !== "active" && (
                  <DropdownMenuItem onClick={() => setStatus.mutate("active")}>
                    <ArchiveRestore className="w-3.5 h-3.5 mr-2" />{archived ? "Restore to active" : "Back on the road"}
                  </DropdownMenuItem>
                )}
                {!archived && (
                  <DropdownMenuItem onClick={() => setStatus.mutate("archived")}>
                    <Archive className="w-3.5 h-3.5 mr-2" />Archive
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => setPendingDelete({ kind: "asset" })} data-testid="button-delete-asset">
                      <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <PrestartDefectBanner asset={asset} prestarts={asset.prestarts ?? []} canEdit={canEdit} />

      {/* Facts */}
      <Card className="px-3 py-2.5">
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-x-4 gap-y-2">
          <Fact label="Assigned to">{nameOf(asset.assignedUserId) ?? "Nobody (pool)"}</Fact>
          <Fact label={asset.meterType === "hours" ? "Engine hours" : "Odometer"}>
            {asset.meterType === "none" ? "No meter" : (
              <>
                {meter(asset.currentMeter, asset.meterType)}
                {asset.currentMeterDate && <span className="text-muted-foreground font-normal"> · {shortDate(asset.currentMeterDate)}</span>}
              </>
            )}
          </Fact>
          <Fact label={isRoad ? "VIN" : "Serial number"}><span className="font-mono">{asset.vin}</span></Fact>
          {isRoad && <Fact label="GVM">{asset.gvmKg != null ? `${asset.gvmKg.toLocaleString("en-AU")} kg` : null}</Fact>}
          <Fact label="Colour">{asset.colour}</Fact>
          <Fact label="Purchased">
            {asset.purchaseDate || asset.purchaseCents != null
              ? [shortDate(asset.purchaseDate), asset.purchaseCents != null ? money(asset.purchaseCents) : null].filter((x) => x && x !== "—").join(" · ")
              : null}
          </Fact>
          {seeCosts && <Fact label="Finance">{asset.financeProvider}</Fact>}
        </div>
        {asset.notes && <p className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground whitespace-pre-wrap">{asset.notes}</p>}
      </Card>

      <div className="grid gap-3 lg:grid-cols-2 items-start">

        {/* Due dates */}
        <Section
          icon={CalendarClock}
          title="Due dates"
          description="To-Do 30 & 7 days before each"
          testId="card-asset-compliance"
          action={canEdit && <AddButton onClick={() => setCompliance({ open: true, item: null })} testId="button-add-compliance">Add</AddButton>}
        >
          {asset.complianceItems.length === 0 ? (
            <Empty>{isRoad ? "Add the rego expiry first — then insurance and, in NSW, the green slip." : "Nothing that expires yet."}</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {asset.complianceItems.map((item) => {
                const due = complianceDue(item, today);
                const label = item.label || COMPLIANCE_KIND_LABELS[item.kind as ComplianceKind] || item.kind;
                return (
                  <li key={item.id} className="flex items-center gap-3 px-3 py-1.5" data-testid={`row-compliance-${item.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{label}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {[item.provider, item.policyNumber, item.amountCents != null ? money(item.amountCents) : null, item.termMonths ? `${item.termMonths}-month term` : null].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-xs tabular-nums">{shortDate(item.expiryDate)}</div>
                      <DueChip state={due.state}>{relativeDays(due.daysLeft)}</DueChip>
                    </div>
                    {canEdit && (
                      <RowMenu
                        label={`${label} actions`}
                        onEdit={() => setCompliance({ open: true, item })}
                        onDelete={() => setPendingDelete({ kind: "compliance", id: item.id, label })}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {/* Servicing */}
        <Section
          icon={Wrench}
          title="Servicing"
          description={asset.meterType === "none" ? "By months · To-Do when due" : `${unit} or months, whichever first · To-Do when due`}
          testId="card-asset-schedules"
          action={canEdit && (
            <div className="flex items-center gap-1.5">
              {asset.serviceSchedules.length > 0 && (
                <button type="button" className={CHIP_BUTTON} onClick={() => setEventPreset({ kind: "service" })} data-testid="button-log-service">
                  Log service
                </button>
              )}
              <AddButton onClick={() => setSchedule({ open: true, schedule: null })} testId="button-add-schedule">Schedule</AddButton>
            </div>
          )}
        >
          {scheduleRows.length === 0 ? (
            <Empty>Add the manufacturer's service interval, e.g. every 10,000 km or 6 months.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {scheduleRows.map(({ s, due }) => {
                const interval = [s.everyMeter && asset.meterType !== "none" ? `${s.everyMeter.toLocaleString("en-AU")} ${unit}` : null, s.everyMonths ? `${s.everyMonths} months` : null]
                  .filter(Boolean)
                  .join(" or ");
                const dueBits = [
                  due.dueMeter != null ? `at ${meter(due.dueMeter, asset.meterType)}` : null,
                  due.dueDate ? `by ${shortDate(due.dueDate)}` : null,
                ].filter(Boolean).join(" or ");
                return (
                  <li key={s.id} className="flex items-center gap-3 px-3 py-1.5" data-testid={`row-schedule-${s.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{s.label}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        Every {interval || "—"}
                        {s.lastDoneDate && ` · last ${shortDate(s.lastDoneDate)}`}
                        {s.lastDoneMeter != null && asset.meterType !== "none" && ` at ${meter(s.lastDoneMeter, asset.meterType)}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {due.unknown ? (
                        <span className="text-[11px] text-muted-foreground">Set last done</span>
                      ) : (
                        <>
                          <div className="text-xs tabular-nums">{dueBits}</div>
                          <DueChip state={due.state}>
                            {due.drivenBy === "meter" && due.meterLeft != null
                              ? due.meterLeft < 0
                                ? `${(-due.meterLeft).toLocaleString("en-AU")} ${unit} over`
                                : `${due.meterLeft.toLocaleString("en-AU")} ${unit} to go`
                              : relativeDays(due.daysLeft)}
                          </DueChip>
                        </>
                      )}
                    </div>
                    {canEdit && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={`${s.label} actions`}><MoreVertical className="w-3 h-3" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEventPreset({ kind: "service", scheduleId: s.id })}>
                            <Wrench className="w-3.5 h-3.5 mr-2" />Mark done
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSchedule({ open: true, schedule: s })}>
                            <Pencil className="w-3.5 h-3.5 mr-2" />Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setPendingDelete({ kind: "schedule", id: s.id, label: s.label })}>
                            <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {/* History */}
        <Section
          icon={History}
          title="History"
          description="Services, repairs, readings, drivers"
          testId="card-asset-history"
          action={canEdit && (
            <div className="flex items-center gap-1.5">
              {asset.meterType !== "none" && (
                <button type="button" className={CHIP_BUTTON} onClick={() => setEventPreset({ kind: "meter" })} data-testid="button-log-meter">
                  <Gauge className="w-3 h-3" />Reading
                </button>
              )}
              <AddButton onClick={() => setEventPreset({ kind: "repair" })} testId="button-add-event">Entry</AddButton>
            </div>
          )}
        >
          {asset.events.length === 0 ? (
            <Empty>Nothing logged yet.</Empty>
          ) : (
            <ul className="divide-y divide-border max-h-[420px] overflow-y-auto">
              {asset.events.map((e) => {
                const kindLabel = ASSET_EVENT_KIND_LABELS[e.kind as AssetEventKind] ?? e.kind;
                const headline =
                  e.kind === "assignment"
                    ? `Assigned to ${nameOf(e.relatedUserId) ?? "nobody (pool)"}`
                    : e.kind === "meter"
                      ? `Reading ${meter(e.meter, asset.meterType)}`
                      : e.title || kindLabel;
                const schedLabel = e.scheduleId ? asset.serviceSchedules.find((s) => s.id === e.scheduleId)?.label : null;
                return (
                  <li key={e.id} className="flex items-start gap-3 px-3 py-1.5" data-testid={`row-event-${e.id}`}>
                    <span className="text-[11px] text-muted-foreground tabular-nums w-16 shrink-0 pt-0.5">{shortDate(e.date)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium">{headline}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {[
                          e.kind !== "assignment" && e.kind !== "meter" ? kindLabel : null,
                          schedLabel ? `completes ${schedLabel}` : null,
                          e.kind !== "meter" && e.meter != null ? meter(e.meter, asset.meterType) : null,
                          e.costCents != null ? money(e.costCents) : null,
                        ].filter(Boolean).join(" · ")}
                      </div>
                      {e.notes && <p className="text-[11px] text-muted-foreground whitespace-pre-wrap mt-0.5">{e.notes}</p>}
                    </div>
                    {canEdit && e.kind !== "assignment" && e.kind !== "status" && e.kind !== "prestart" && (
                      <RowMenu label="Entry actions" onDelete={() => setPendingDelete({ kind: "event", id: e.id })} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <PrestartsSection asset={asset} prestarts={asset.prestarts ?? []} />

        {seeCosts && <AssetCostsSection asset={asset} canEdit={canEdit} />}
        {seeCosts && <AssetRechargeSection asset={asset} canEdit={canEdit} />}

        {/* Documents */}
        <Section
          icon={FileText}
          title="Documents"
          description="Rego, certificates, service book"
          testId="card-asset-documents"
          action={canEdit && (
            <div className="flex items-center gap-1.5">
              <Select value={docCategory} onValueChange={(v) => v && setDocCategory(v as AssetDocumentCategory)}>
                <SelectTrigger className="h-6 w-[110px] text-xs border-border/50 px-2" aria-label="Document type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSET_DOCUMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">{ASSET_DOCUMENT_CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) attach.mutate(file);
                  e.target.value = "";
                }}
                data-testid="input-asset-document"
              />
              <button type="button" className={PRIMARY_BUTTON} disabled={isUploading || attach.isPending} onClick={() => fileInput.current?.click()} data-testid="button-attach-document">
                {isUploading || attach.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                Attach
              </button>
            </div>
          )}
        >
          {asset.documents.length === 0 ? (
            <Empty>No documents yet.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {asset.documents.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-3 py-1.5" data-testid={`row-document-${d.id}`}>
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <a href={d.fileUrl} target="_blank" rel="noreferrer" className="flex-1 min-w-0 text-xs font-medium truncate hover:underline">
                    {d.fileName}
                  </a>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {ASSET_DOCUMENT_CATEGORY_LABELS[d.category as AssetDocumentCategory] ?? d.category}
                  </span>
                  {canEdit && <RowMenu label={`${d.fileName} actions`} onDelete={() => setPendingDelete({ kind: "document", id: d.id, label: d.fileName })} />}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <AssetDialog open={editing} asset={asset} onClose={() => setEditing(false)} />
      <ComplianceDialog open={compliance.open} assetId={asset.id} item={compliance.item} onClose={() => setCompliance({ open: false, item: null })} />
      <ScheduleDialog open={schedule.open} asset={asset} schedule={schedule.schedule} onClose={() => setSchedule({ open: false, schedule: null })} />
      <EventDialog
        open={!!eventPreset}
        asset={asset}
        schedules={asset.serviceSchedules}
        preset={eventPreset ?? { kind: "repair" }}
        onClose={() => setEventPreset(null)}
      />
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={deleteCopy.title}
        description={deleteCopy.description}
        confirmLabel="Delete"
        destructive
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete)}
      />
    </div>
  );
}
