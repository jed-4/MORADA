import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { Asset, AssetComplianceItem, AssetServiceSchedule } from "@shared/schema";
import {
  ASSET_STATUSES,
  ASSET_STATUS_LABELS,
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  AU_STATES,
  COMPLIANCE_KINDS,
  COMPLIANCE_KIND_LABELS,
  HEAVY_VEHICLE_GVM_KG,
  MANUAL_EVENT_KINDS,
  ASSET_EVENT_KIND_LABELS,
  METER_TYPES,
  METER_UNIT,
  addMonthsKey,
  defaultAssetName,
  isHeavyVehicle,
  todayKey,
  type AssetStatus,
  type AssetType,
  type ComplianceKind,
  type MeterType,
} from "@shared/assets";
import { ASSIGNABLE_USERS_KEY, errorText, invalidateAssets, toCents, type AssignableUser } from "./assetsShared";

const NONE = "__none__";

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Radix Select emits onValueChange("") when it hydrates to a value outside its
 * options, which wipes the field. Every select here ignores an empty value and
 * uses NONE as the explicit "nothing" option.
 */
function PlainSelect<T extends string>({
  value,
  onChange,
  options,
  testId,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  testId?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v as T)}>
      <SelectTrigger className="h-8 text-xs" data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SaveFooter({ pending, onCancel, label = "Save" }: { pending: boolean; onCancel: () => void; label?: string }) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
      <Button type="submit" size="sm" disabled={pending} data-testid="button-save">
        {pending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
        {label}
      </Button>
    </DialogFooter>
  );
}

// ---- asset ---------------------------------------------------------------

interface AssetForm {
  assetType: AssetType;
  name: string;
  status: AssetStatus;
  make: string;
  model: string;
  year: number | null;
  rego: string;
  regoState: string;
  vin: string;
  gvmKg: number | null;
  colour: string;
  assignedUserId: string;
  meterType: MeterType;
  purchaseDate: string;
  purchaseDollars: number | null;
  financeProvider: string;
  notes: string;
}

function blankAsset(): AssetForm {
  return {
    assetType: "vehicle",
    name: "",
    status: "active",
    make: "",
    model: "",
    year: null,
    rego: "",
    regoState: "NSW",
    vin: "",
    gvmKg: null,
    colour: "",
    assignedUserId: NONE,
    meterType: "km",
    purchaseDate: "",
    purchaseDollars: null,
    financeProvider: "",
    notes: "",
  };
}

export function AssetDialog({
  open,
  asset,
  onClose,
  onCreated,
}: {
  open: boolean;
  asset: Asset | null;
  onClose: () => void;
  onCreated?: (asset: Asset) => void;
}) {
  const { toast } = useToast();
  const [f, setF] = useState<AssetForm>(blankAsset);
  const set = <K extends keyof AssetForm>(k: K, v: AssetForm[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const { data: people = [] } = useQuery<AssignableUser[]>({ queryKey: ASSIGNABLE_USERS_KEY, enabled: open });

  useEffect(() => {
    if (!open) return;
    setF(
      asset
        ? {
            assetType: asset.assetType as AssetType,
            name: asset.name,
            status: asset.status as AssetStatus,
            make: asset.make ?? "",
            model: asset.model ?? "",
            year: asset.year,
            rego: asset.rego ?? "",
            regoState: asset.regoState ?? NONE,
            vin: asset.vin ?? "",
            gvmKg: asset.gvmKg,
            colour: asset.colour ?? "",
            assignedUserId: asset.assignedUserId ?? NONE,
            meterType: asset.meterType as MeterType,
            purchaseDate: asset.purchaseDate ?? "",
            purchaseDollars: asset.purchaseCents == null ? null : asset.purchaseCents / 100,
            financeProvider: asset.financeProvider ?? "",
            notes: asset.notes ?? "",
          }
        : blankAsset(),
    );
  }, [open, asset]);

  const isRoadAsset = f.assetType === "vehicle" || f.assetType === "trailer";

  const save = useMutation({
    mutationFn: () => {
      const body = {
        assetType: f.assetType,
        name: f.name.trim() || defaultAssetName({ year: f.year, make: f.make, model: f.model, rego: f.rego }),
        status: f.status,
        make: f.make.trim() || null,
        model: f.model.trim() || null,
        year: f.year,
        rego: f.rego.trim() || null,
        regoState: f.regoState === NONE ? null : f.regoState,
        vin: f.vin.trim() || null,
        gvmKg: f.gvmKg,
        colour: f.colour.trim() || null,
        assignedUserId: f.assignedUserId === NONE ? null : f.assignedUserId,
        meterType: f.meterType,
        purchaseDate: f.purchaseDate || null,
        purchaseCents: toCents(f.purchaseDollars),
        financeProvider: f.financeProvider.trim() || null,
        notes: f.notes.trim() || null,
      };
      return asset ? apiRequest(`/api/assets/${asset.id}`, "PATCH", body) : apiRequest("/api/assets", "POST", body);
    },
    onSuccess: (row: Asset) => {
      invalidateAssets(asset?.id);
      onClose();
      if (!asset) onCreated?.(row);
    },
    onError: (err) => toast({ title: errorText(err, "Couldn't save the asset"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{asset ? "Edit asset" : "Add asset"}</DialogTitle>
          <DialogDescription>
            Rego, insurance and services are added on the asset once it's saved.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Type">
              <PlainSelect
                value={f.assetType}
                onChange={(v) => {
                  set("assetType", v);
                  if (v === "tool") set("meterType", "none");
                  if (v === "plant" && f.meterType === "km") set("meterType", "hours");
                }}
                options={ASSET_TYPES.map((t) => ({ value: t, label: ASSET_TYPE_LABELS[t] }))}
                testId="select-asset-type"
              />
            </Field>
            <Field label="Name" hint="Blank uses year, make and model" className="sm:col-span-2">
              <Input
                className="h-8 text-xs"
                value={f.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={defaultAssetName({ year: f.year, make: f.make, model: f.model, rego: f.rego })}
                data-testid="input-asset-name"
              />
            </Field>
            <Field label="Make">
              <Input className="h-8 text-xs" value={f.make} onChange={(e) => set("make", e.target.value)} placeholder="Toyota" />
            </Field>
            <Field label="Model">
              <Input className="h-8 text-xs" value={f.model} onChange={(e) => set("model", e.target.value)} placeholder="Hilux SR5" />
            </Field>
            <Field label="Year">
              <NumericInput className="h-8 text-xs" integer value={f.year} onCommit={(v) => set("year", v)} placeholder="2022" />
            </Field>
            {isRoadAsset && (
              <>
                <Field label="Rego">
                  <Input className="h-8 text-xs uppercase" value={f.rego} onChange={(e) => set("rego", e.target.value)} data-testid="input-asset-rego" />
                </Field>
                <Field label="State">
                  <PlainSelect
                    value={f.regoState}
                    onChange={(v) => set("regoState", v)}
                    options={[{ value: NONE, label: "—" }, ...AU_STATES.map((s) => ({ value: s, label: s }))]}
                  />
                </Field>
                <Field
                  label="GVM (kg)"
                  hint={isHeavyVehicle(f.gvmKg) ? "Heavy vehicle: NHVR daily checks apply" : `Over ${HEAVY_VEHICLE_GVM_KG.toLocaleString()} kg is a heavy vehicle`}
                >
                  <NumericInput className="h-8 text-xs" integer min={0} value={f.gvmKg} onCommit={(v) => set("gvmKg", v)} />
                </Field>
              </>
            )}
            <Field label={isRoadAsset ? "VIN" : "Serial number"} className="sm:col-span-2">
              <Input className="h-8 text-xs" value={f.vin} onChange={(e) => set("vin", e.target.value)} />
            </Field>
            <Field label="Colour">
              <Input className="h-8 text-xs" value={f.colour} onChange={(e) => set("colour", e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Assigned to">
              <PlainSelect
                value={f.assignedUserId}
                onChange={(v) => set("assignedUserId", v)}
                options={[{ value: NONE, label: "Nobody (pool)" }, ...people.map((p) => ({ value: p.id, label: p.displayName }))]}
                testId="select-asset-assignee"
              />
            </Field>
            <Field label="Measured in">
              <PlainSelect
                value={f.meterType}
                onChange={(v) => set("meterType", v)}
                options={METER_TYPES.map((m) => ({ value: m, label: m === "none" ? "No meter" : m === "km" ? "Kilometres" : "Engine hours" }))}
              />
            </Field>
            <Field label="Status">
              <PlainSelect
                value={f.status}
                onChange={(v) => set("status", v)}
                options={ASSET_STATUSES.map((s) => ({ value: s, label: ASSET_STATUS_LABELS[s] }))}
              />
            </Field>
            <Field label="Purchase date">
              <Input type="date" className="h-8 text-xs" value={f.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} />
            </Field>
            <Field label="Purchase price (inc GST)">
              <NumericInput className="h-8 text-xs" min={0} value={f.purchaseDollars} onCommit={(v) => set("purchaseDollars", v)} />
            </Field>
            <Field label="Finance provider">
              <Input className="h-8 text-xs" value={f.financeProvider} onChange={(e) => set("financeProvider", e.target.value)} placeholder="Owned outright" />
            </Field>
          </div>

          <Field label="Notes">
            <Textarea className="text-xs min-h-[60px]" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>

          <SaveFooter pending={save.isPending} onCancel={onClose} label={asset ? "Save" : "Add asset"} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- compliance item -----------------------------------------------------

export function ComplianceDialog({
  open,
  assetId,
  item,
  onClose,
}: {
  open: boolean;
  assetId: string;
  item: AssetComplianceItem | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [kind, setKind] = useState<ComplianceKind>("rego");
  const [label, setLabel] = useState("");
  const [provider, setProvider] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [termMonths, setTermMonths] = useState<number | null>(12);
  const [amount, setAmount] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setKind((item?.kind as ComplianceKind) ?? "rego");
    setLabel(item?.label ?? "");
    setProvider(item?.provider ?? "");
    setPolicyNumber(item?.policyNumber ?? "");
    setExpiryDate(item?.expiryDate ?? "");
    setTermMonths(item ? item.termMonths : 12);
    setAmount(item?.amountCents == null ? null : item.amountCents / 100);
    setNotes(item?.notes ?? "");
  }, [open, item]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        kind,
        label: label.trim() || null,
        provider: provider.trim() || null,
        policyNumber: policyNumber.trim() || null,
        expiryDate,
        termMonths,
        amountCents: toCents(amount),
        notes: notes.trim() || null,
      };
      return item
        ? apiRequest(`/api/assets/${assetId}/compliance/${item.id}`, "PATCH", body)
        : apiRequest(`/api/assets/${assetId}/compliance`, "POST", body);
    },
    onSuccess: () => {
      invalidateAssets(assetId);
      onClose();
    },
    onError: (err) => toast({ title: errorText(err, "Couldn't save that"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Edit due date" : "Add due date"}</DialogTitle>
          <DialogDescription>Rego, CTP, insurance, safety checks — anything with an expiry.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!expiryDate) return toast({ title: "Pick the expiry date", variant: "destructive" });
            save.mutate();
          }}
          className="flex flex-col gap-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="What">
              <PlainSelect
                value={kind}
                onChange={setKind}
                options={COMPLIANCE_KINDS.map((k) => ({ value: k, label: COMPLIANCE_KIND_LABELS[k] }))}
                testId="select-compliance-kind"
              />
            </Field>
            <Field label="Label" hint="Optional">
              <Input className="h-8 text-xs" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={COMPLIANCE_KIND_LABELS[kind]} />
            </Field>
            <Field label="Expires">
              <Input type="date" className="h-8 text-xs" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} data-testid="input-compliance-expiry" />
            </Field>
            <Field label="Term (months)" hint={termMonths && expiryDate ? `Renewing makes it ${addMonthsKey(expiryDate, termMonths)}` : undefined}>
              <NumericInput className="h-8 text-xs" integer min={1} value={termMonths} onCommit={setTermMonths} />
            </Field>
            <Field label={kind === "rego" ? "Authority" : "Provider"}>
              <Input className="h-8 text-xs" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder={kind === "insurance" ? "NRMA" : kind === "ctp" ? "Allianz" : ""} />
            </Field>
            <Field label="Policy / reference">
              <Input className="h-8 text-xs" value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} />
            </Field>
            <Field label="Last paid (inc GST)">
              <NumericInput className="h-8 text-xs" min={0} value={amount} onCommit={setAmount} />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea className="text-xs min-h-[50px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <SaveFooter pending={save.isPending} onCancel={onClose} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- service schedule ----------------------------------------------------

export function ScheduleDialog({
  open,
  asset,
  schedule,
  onClose,
}: {
  open: boolean;
  asset: Asset;
  schedule: AssetServiceSchedule | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const hasMeter = asset.meterType !== "none";
  const unit = METER_UNIT[asset.meterType as MeterType] ?? "";
  const [label, setLabel] = useState("");
  const [everyMeter, setEveryMeter] = useState<number | null>(null);
  const [everyMonths, setEveryMonths] = useState<number | null>(null);
  const [lastDoneDate, setLastDoneDate] = useState("");
  const [lastDoneMeter, setLastDoneMeter] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLabel(schedule?.label ?? "Service");
    setEveryMeter(schedule ? schedule.everyMeter : hasMeter ? (asset.meterType === "hours" ? 250 : 10000) : null);
    setEveryMonths(schedule ? schedule.everyMonths : 6);
    setLastDoneDate(schedule?.lastDoneDate ?? "");
    setLastDoneMeter(schedule?.lastDoneMeter ?? null);
  }, [open, schedule, hasMeter, asset.meterType]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        label: label.trim(),
        everyMeter: hasMeter ? everyMeter : null,
        everyMonths,
        lastDoneDate: lastDoneDate || null,
        lastDoneMeter: hasMeter ? lastDoneMeter : null,
      };
      return schedule
        ? apiRequest(`/api/assets/${asset.id}/schedules/${schedule.id}`, "PATCH", body)
        : apiRequest(`/api/assets/${asset.id}/schedules`, "POST", body);
    },
    onSuccess: () => {
      invalidateAssets(asset.id);
      onClose();
    },
    onError: (err) => toast({ title: errorText(err, "Couldn't save the schedule"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{schedule ? "Edit service schedule" : "Add service schedule"}</DialogTitle>
          <DialogDescription>
            {hasMeter ? `Falls due on ${unit} or months, whichever comes first.` : "Falls due every so many months."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim()) return toast({ title: "Name the service", variant: "destructive" });
            if (!(hasMeter && everyMeter) && !everyMonths) return toast({ title: "Give it an interval", variant: "destructive" });
            save.mutate();
          }}
          className="flex flex-col gap-3"
        >
          <Field label="Service">
            <Input className="h-8 text-xs" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Minor service" data-testid="input-schedule-label" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {hasMeter && (
              <Field label={`Every (${unit})`}>
                <NumericInput className="h-8 text-xs" integer min={1} value={everyMeter} onCommit={setEveryMeter} />
              </Field>
            )}
            <Field label="Every (months)">
              <NumericInput className="h-8 text-xs" integer min={1} value={everyMonths} onCommit={setEveryMonths} />
            </Field>
            <Field label="Last done" hint="Blank counts from the purchase date">
              <Input type="date" className="h-8 text-xs" value={lastDoneDate} onChange={(e) => setLastDoneDate(e.target.value)} />
            </Field>
            {hasMeter && (
              <Field label={`Last done at (${unit})`}>
                <NumericInput className="h-8 text-xs" integer min={0} value={lastDoneMeter} onCommit={setLastDoneMeter} />
              </Field>
            )}
          </div>
          <SaveFooter pending={save.isPending} onCancel={onClose} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- history entry -------------------------------------------------------

export type EventPreset = { kind: (typeof MANUAL_EVENT_KINDS)[number]; scheduleId?: string | null };

export function EventDialog({
  open,
  asset,
  schedules,
  preset,
  onClose,
}: {
  open: boolean;
  asset: Asset;
  schedules: AssetServiceSchedule[];
  preset: EventPreset;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const hasMeter = asset.meterType !== "none";
  const unit = METER_UNIT[asset.meterType as MeterType] ?? "";
  const [kind, setKind] = useState<EventPreset["kind"]>("service");
  const [date, setDate] = useState(todayKey());
  const [title, setTitle] = useState("");
  const [meterValue, setMeterValue] = useState<number | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [scheduleId, setScheduleId] = useState<string>(NONE);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setKind(preset.kind);
    setDate(todayKey());
    setTitle("");
    setMeterValue(null);
    setCost(null);
    setScheduleId(preset.scheduleId ?? NONE);
    setNotes("");
  }, [open, preset]);

  const save = useMutation({
    mutationFn: () =>
      apiRequest(`/api/assets/${asset.id}/events`, "POST", {
        kind,
        date,
        title: title.trim() || null,
        meter: hasMeter ? meterValue : null,
        costCents: kind === "service" || kind === "repair" ? toCents(cost) : null,
        scheduleId: kind === "service" && scheduleId !== NONE ? scheduleId : null,
        notes: notes.trim() || null,
      }),
    onSuccess: (row: { meterIgnored?: boolean }) => {
      invalidateAssets(asset.id);
      onClose();
      if (row?.meterIgnored) {
        toast({ title: "Saved — but the reading is lower than the current one, so the meter wasn't changed" });
      }
    },
    onError: (err) => toast({ title: errorText(err, "Couldn't save the entry"), variant: "destructive" }),
  });

  const showCost = kind === "service" || kind === "repair";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log {ASSET_EVENT_KIND_LABELS[kind].toLowerCase()}</DialogTitle>
          <DialogDescription>
            {kind === "service" && schedules.length > 0
              ? "Pick the schedule it completes and it'll work out the next one."
              : "Adds an entry to the asset's history."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (kind === "meter" && meterValue == null) return toast({ title: "Enter the reading", variant: "destructive" });
            save.mutate();
          }}
          className="flex flex-col gap-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <PlainSelect
                value={kind}
                onChange={setKind}
                options={MANUAL_EVENT_KINDS.filter((k) => k !== "meter" || hasMeter).map((k) => ({ value: k, label: ASSET_EVENT_KIND_LABELS[k] }))}
                testId="select-event-kind"
              />
            </Field>
            <Field label="Date">
              <Input type="date" className="h-8 text-xs" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            {kind === "service" && schedules.length > 0 && (
              <Field label="Completes schedule" className="col-span-2">
                <PlainSelect
                  value={scheduleId}
                  onChange={setScheduleId}
                  options={[{ value: NONE, label: "None — one-off" }, ...schedules.map((s) => ({ value: s.id, label: s.label }))]}
                  testId="select-event-schedule"
                />
              </Field>
            )}
            {hasMeter && (
              <Field label={`Reading (${unit})`} hint={asset.currentMeter != null ? `Currently ${asset.currentMeter.toLocaleString("en-AU")}` : undefined}>
                <NumericInput className="h-8 text-xs" integer min={0} value={meterValue} onCommit={setMeterValue} data-testid="input-event-meter" />
              </Field>
            )}
            {showCost && (
              <Field label="Cost (inc GST)">
                <NumericInput className="h-8 text-xs" min={0} value={cost} onCommit={setCost} />
              </Field>
            )}
          </div>
          {kind !== "meter" && (
            <Field label="Summary">
              <Input
                className="h-8 text-xs"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={kind === "repair" ? "Replaced front tyres" : kind === "service" ? "Ultra Tune — 60,000 km service" : ""}
              />
            </Field>
          )}
          <Field label="Notes">
            <Textarea className="text-xs min-h-[50px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <SaveFooter pending={save.isPending} onCancel={onClose} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
