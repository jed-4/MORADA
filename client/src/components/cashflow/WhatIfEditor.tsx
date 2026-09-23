import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  employeeCost,
  FREQUENCIES,
  gstOfInc,
  loanRepaymentCents,
  type EmployeeParams,
  type Frequency,
  type OneOffParams,
  type VehicleParams,
  type WhatIfDefinition,
  type WhatIfLine,
  type WinJobParams,
} from "@shared/cashflow";
import { money } from "./cashflowShared";

export const TEMPLATE_LABELS: Record<WhatIfDefinition["template"], string> = {
  employee: "Employee",
  vehicle: "Vehicle or equipment",
  win_job: "Win a job",
  one_off: "One-off",
  custom: "Custom",
};

const FREQUENCY_LABELS: Record<Frequency, string> = {
  once: "Once",
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

const fieldClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35";

// ─── Field helpers ───────────────────────────────────────────────────────────

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5 min-w-0", className)}>
      <Label className="text-xs text-muted-foreground font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Money({ label, cents, onChange, hint, testId }: { label: string; cents: number; onChange: (c: number) => void; hint?: string; testId?: string }) {
  return (
    <Field label={label} hint={hint}>
      <NumericInput
        value={cents ? cents / 100 : null}
        min={0}
        placeholder="$0"
        onCommit={(v) => onChange(Math.round((v ?? 0) * 100))}
        className={fieldClass}
        data-testid={testId}
      />
    </Field>
  );
}

function Num({ label, value, onChange, integer, max, hint }: { label: string; value: number; onChange: (n: number) => void; integer?: boolean; max?: number; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <NumericInput value={value} min={0} max={max} integer={integer} onCommit={(v) => onChange(v ?? 0)} className={fieldClass} />
    </Field>
  );
}

function DateInput({ label, value, onChange, optional }: { label: string; value: string | null; onChange: (v: string | null) => void; optional?: boolean }) {
  return (
    <Field label={label} hint={optional ? "Leave empty if ongoing." : undefined}>
      <Input type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value || (optional ? null : value))} />
    </Field>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <Field label={label}>
      <Select value={value} onValueChange={(v) => { if (v) onChange(v as T); }}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="text-label font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{children}</div>
    </div>
  );
}

function Summary({ rows }: { rows: [string, string][] }) {
  return (
    <div className="rounded-lg bg-muted/60 px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
      {rows.map(([k, v]) => (
        <div key={k}>
          <p className="text-xs text-muted-foreground">{k}</p>
          <p className="text-sm font-semibold tabular-nums">{v}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Templates ───────────────────────────────────────────────────────────────

function EmployeeFields({ p, set }: { p: EmployeeParams; set: (p: EmployeeParams) => void }) {
  const u = (patch: Partial<EmployeeParams>) => set({ ...p, ...patch });
  const c = employeeCost(p);
  return (
    <>
      <Section title="Who">
        <Field label="Role"><Input value={p.role} onChange={(e) => u({ role: e.target.value })} placeholder="e.g. Site supervisor" /></Field>
        <DateInput label="Starts" value={p.startDate} onChange={(v) => v && u({ startDate: v })} />
        <DateInput label="Ends" value={p.endDate} optional onChange={(v) => u({ endDate: v })} />
      </Section>
      <Section title="Pay">
        <Choice label="Paid by" value={p.payType} options={[["salary", "Salary"], ["hourly", "Hourly"]]} onChange={(v) => u({ payType: v })} />
        {p.payType === "salary" ? (
          <Money label="Salary per year ($)" cents={p.annualSalaryCents} onChange={(c) => u({ annualSalaryCents: c })} testId="input-whatif-salary" />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Money label="Rate ($/hr)" cents={p.hourlyRateCents} onChange={(c) => u({ hourlyRateCents: c })} />
            <Num label="Hours / week" value={p.hoursPerWeek} max={100} onChange={(n) => u({ hoursPerWeek: n })} />
          </div>
        )}
        <Choice
          label="Pay cycle"
          value={p.payCycle}
          options={[["weekly", "Weekly"], ["fortnightly", "Fortnightly"], ["monthly", "Monthly"]]}
          onChange={(v) => u({ payCycle: v })}
        />
      </Section>
      <Section title="On-costs">
        <Num label="Super (%)" value={p.superPercent} max={100} onChange={(n) => u({ superPercent: n })} hint="Paid with each pay." />
        <Num label="WorkCover (%)" value={p.workcoverPercent} max={100} onChange={(n) => u({ workcoverPercent: n })} />
        <Num label="Payroll tax (%)" value={p.payrollTaxPercent} max={100} onChange={(n) => u({ payrollTaxPercent: n })} hint="0 if you're under the threshold." />
      </Section>
      <Summary
        rows={[
          ["Each pay (wages + super)", money(c.wagesPerPayCents + c.superPerPayCents)],
          ["All-in per month", money(c.totalPerMonthCents)],
          ["All-in per year", money(c.totalPerYearCents)],
        ]}
      />
    </>
  );
}

function VehicleFields({ p, set }: { p: VehicleParams; set: (p: VehicleParams) => void }) {
  const u = (patch: Partial<VehicleParams>) => set({ ...p, ...patch });
  const repayment = loanRepaymentCents(p.priceCents - Math.min(p.depositCents, p.priceCents), p.ratePercent, p.termMonths, p.balloonCents);
  return (
    <>
      <Section title="Buying it">
        <Money label="Price inc GST ($)" cents={p.priceCents} onChange={(c) => u({ priceCents: c })} testId="input-whatif-price" />
        <DateInput label="When" value={p.purchaseDate} onChange={(v) => v && u({ purchaseDate: v })} />
        <Choice label="Pay with" value={p.payWith} options={[["finance", "Finance (chattel mortgage)"], ["cash", "Cash"]]} onChange={(v) => u({ payWith: v })} />
      </Section>
      {p.payWith === "finance" && (
        <Section title="Finance">
          <Money label="Deposit ($)" cents={p.depositCents} onChange={(c) => u({ depositCents: c })} />
          <div className="grid grid-cols-2 gap-2">
            <Num label="Term (months)" value={p.termMonths} integer max={120} onChange={(n) => u({ termMonths: Math.max(1, n) })} />
            <Num label="Rate (%)" value={p.ratePercent} max={50} onChange={(n) => u({ ratePercent: n })} />
          </div>
          <Money label="Balloon ($)" cents={p.balloonCents} onChange={(c) => u({ balloonCents: c })} hint="Left owing at the end." />
        </Section>
      )}
      <Section title="Running it">
        <Money label="Rego & insurance per year ($)" cents={p.regoInsuranceYearlyCents} onChange={(c) => u({ regoInsuranceYearlyCents: c })} />
        <Money label="Fuel & servicing per month ($)" cents={p.runningMonthlyCents} onChange={(c) => u({ runningMonthlyCents: c })} />
        <Money label="Saves you per month ($)" cents={p.savingsMonthlyCents} onChange={(c) => u({ savingsMonthlyCents: c })} hint="e.g. hire you stop paying." />
      </Section>
      <Summary
        rows={[
          [p.payWith === "finance" ? "Up front (deposit)" : "Up front", money(p.payWith === "finance" ? Math.min(p.depositCents, p.priceCents) : p.priceCents)],
          ["Repayment per month", p.payWith === "finance" ? money(repayment) : "—"],
          ["GST back at next BAS", money(-gstOfInc(-p.priceCents))],
        ]}
      />
    </>
  );
}

function WinJobFields({ p, set }: { p: WinJobParams; set: (p: WinJobParams) => void }) {
  const u = (patch: Partial<WinJobParams>) => set({ ...p, ...patch });
  const weighted = (p.valueCents * p.winPercent) / 100;
  return (
    <>
      <Section title="The job">
        <Money label="Contract value inc GST ($)" cents={p.valueCents} onChange={(c) => u({ valueCents: c })} />
        <DateInput label="Starts" value={p.startDate} onChange={(v) => v && u({ startDate: v })} />
        <Num label="Runs for (months)" value={p.months} integer max={60} onChange={(n) => u({ months: Math.max(1, n) })} />
      </Section>
      <Section title="Odds and margin">
        <Num label="Win chance (%)" value={p.winPercent} max={100} onChange={(n) => u({ winPercent: n })} />
        <Num label="Margin (%)" value={p.marginPercent} max={99} onChange={(n) => u({ marginPercent: n })} />
      </Section>
      <Summary
        rows={[
          ["Claims per month", money(weighted / Math.max(1, p.months))],
          ["Costs per month", money((weighted * (1 - p.marginPercent / 100)) / Math.max(1, p.months))],
          ["Margin over the job", money(weighted * (p.marginPercent / 100))],
        ]}
      />
    </>
  );
}

function OneOffFields({ p, set }: { p: OneOffParams; set: (p: OneOffParams) => void }) {
  const u = (patch: Partial<OneOffParams>) => set({ ...p, ...patch });
  return (
    <Section title="The payment">
      <Money label="Amount inc GST ($)" cents={p.amountCents} onChange={(c) => u({ amountCents: c })} />
      <DateInput label="On" value={p.date} onChange={(v) => v && u({ date: v })} />
      <Choice label="Money" value={p.direction} options={[["out", "Going out"], ["in", "Coming in"]]} onChange={(v) => u({ direction: v })} />
      <div className="flex flex-row items-center justify-between rounded-lg border p-3 sm:col-span-1">
        <Label>Includes GST</Label>
        <Switch checked={p.hasGst} onCheckedChange={(v) => u({ hasGst: v })} />
      </div>
    </Section>
  );
}

// ─── Extra lines ─────────────────────────────────────────────────────────────

function LinesTable({ lines, onChange, defaultDate }: { lines: WhatIfLine[]; onChange: (l: WhatIfLine[]) => void; defaultDate: string }) {
  const u = (i: number, patch: Partial<WhatIfLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-label font-semibold uppercase tracking-wide text-muted-foreground">Extra costs or income — add anything</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => onChange([...lines, { name: "", direction: "out", amountCents: 0, hasGst: true, frequency: "monthly", startDate: defaultDate, endDate: null }])}
          data-testid="button-add-whatif-line"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />Add a line
        </Button>
      </div>
      {lines.length > 0 && (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="text-left font-semibold px-2 py-1.5">What</th>
                <th className="text-left font-semibold px-2 py-1.5 w-[90px]">In / out</th>
                <th className="text-right font-semibold px-2 py-1.5 w-[100px]">Amount ($)</th>
                <th className="text-left font-semibold px-2 py-1.5 w-[120px]">How often</th>
                <th className="text-left font-semibold px-2 py-1.5 w-[130px]">From</th>
                <th className="text-left font-semibold px-2 py-1.5 w-[130px]">Until</th>
                <th className="text-center font-semibold px-2 py-1.5 w-[44px]">GST</th>
                <th className="w-[36px]" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-1"><Input className="h-8 text-xs" value={l.name} placeholder="e.g. Ute finance" onChange={(e) => u(i, { name: e.target.value })} /></td>
                  <td className="px-2 py-1">
                    <Select value={l.direction} onValueChange={(v) => { if (v) u(i, { direction: v as WhatIfLine["direction"] }); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="out">Out</SelectItem><SelectItem value="in">In</SelectItem></SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1">
                    <NumericInput
                      value={l.amountCents ? l.amountCents / 100 : null}
                      min={0}
                      onCommit={(v) => u(i, { amountCents: Math.round((v ?? 0) * 100) })}
                      className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Select value={l.frequency} onValueChange={(v) => { if (v) u(i, { frequency: v as Frequency }); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{FREQUENCY_LABELS[f]}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1"><Input type="date" className="h-8 text-xs" value={l.startDate} onChange={(e) => e.target.value && u(i, { startDate: e.target.value })} /></td>
                  <td className="px-2 py-1">
                    <Input type="date" className="h-8 text-xs" value={l.endDate ?? ""} disabled={l.frequency === "once"} onChange={(e) => u(i, { endDate: e.target.value || null })} />
                  </td>
                  <td className="px-2 py-1 text-center"><Checkbox checked={l.hasGst} onCheckedChange={(v) => u(i, { hasGst: v === true })} /></td>
                  <td className="px-1 py-1">
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => onChange(lines.filter((_, j) => j !== i))} aria-label="Remove line">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function WhatIfFields({ draft, onChange, today }: { draft: WhatIfDefinition; onChange: (d: WhatIfDefinition) => void; today: string }) {
  const setParams = (params: WhatIfDefinition["params"]) => onChange({ ...draft, params });
  return (
    <div className="space-y-5">
      {draft.template === "employee" && <EmployeeFields p={draft.params as EmployeeParams} set={setParams} />}
      {draft.template === "vehicle" && <VehicleFields p={draft.params as VehicleParams} set={setParams} />}
      {draft.template === "win_job" && <WinJobFields p={draft.params as WinJobParams} set={setParams} />}
      {draft.template === "one_off" && <OneOffFields p={draft.params as OneOffParams} set={setParams} />}
      <LinesTable lines={draft.lines} onChange={(lines) => onChange({ ...draft, lines })} defaultDate={today} />
    </div>
  );
}
