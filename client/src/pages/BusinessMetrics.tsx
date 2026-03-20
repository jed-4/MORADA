import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  ShieldCheck, TrendingUp, Briefcase, BarChart3,
  AlertTriangle, CheckCircle2, Clock, Building2,
  DollarSign, Pencil, Check, X, Info, TableProperties
} from "lucide-react";
import HBCFTracker from "./HBCFTracker";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CompanySettings {
  id?: string;
  // HWI
  hwiExposureLimit?: string | null;
  hwiInsurer?: string | null;
  hwiPolicyNumber?: string | null;
  hwiExpiryDate?: string | null;
  // Builder licence
  builderLicenseNumber?: string | null;
  builderLicenseExpiry?: string | null;
  builderLicenseState?: string | null;
  // Public Liability
  publicLiabilityInsurer?: string | null;
  publicLiabilityLimit?: string | null;
  publicLiabilityExpiry?: string | null;
  publicLiabilityPolicyNumber?: string | null;
  // Contract Works
  contractWorksInsurer?: string | null;
  contractWorksLimit?: string | null;
  contractWorksExpiry?: string | null;
  contractWorksPolicyNumber?: string | null;
  // Workers Comp
  workersCompInsurer?: string | null;
  workersCompPolicyNumber?: string | null;
  workersCompExpiry?: string | null;
  // Prof Indemnity
  profIndemnityInsurer?: string | null;
  profIndemnityLimit?: string | null;
  profIndemnityExpiry?: string | null;
  // Financial
  annualRevenueTarget?: string | null;
}

interface Project {
  id: string;
  name: string;
  projectStatus: string | null;
  projectSubStatus: string | null;
  lockedContractPrice?: number | null;
  isBusiness?: boolean;
}

type TabId = "overview" | "compliance" | "hbcf" | "financial" | "pipeline";

const TABS: { id: TabId; label: string; icon: React.ComponentType<any> }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "compliance", label: "Compliance", icon: ShieldCheck },
  { id: "hbcf", label: "HBCF Limits", icon: TableProperties },
  { id: "financial", label: "Financial", icon: TrendingUp },
  { id: "pipeline", label: "Pipeline", icon: Briefcase },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(val: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(val);
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function ExpiryBadge({ dateStr }: { dateStr: string | null | undefined }) {
  const days = daysUntil(dateStr);
  if (days === null) return <Badge variant="secondary" className="text-[10px]">Not set</Badge>;
  if (days < 0) return <Badge variant="destructive" className="text-[10px]">Expired</Badge>;
  if (days <= 30) return <Badge className="text-[10px] bg-orange-500/15 text-orange-700 dark:text-orange-400 hover:bg-orange-500/20">{days}d left</Badge>;
  if (days <= 90) return <Badge className="text-[10px] bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20">{days}d left</Badge>;
  const d = new Date(dateStr!);
  return <Badge variant="secondary" className="text-[10px]">{d.toLocaleDateString("en-AU")}</Badge>;
}

// ─── Inline editable field ────────────────────────────────────────────────────

function EditableField({
  label,
  value,
  field,
  type = "text",
  placeholder,
  onSave,
  prefix,
}: {
  label: string;
  value: string | null | undefined;
  field: string;
  type?: string;
  placeholder?: string;
  onSave: (field: string, val: string | null) => void;
  prefix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const commit = () => {
    onSave(field, draft || null);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value ?? "");
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</Label>
        <div className="flex items-center gap-1">
          {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
          <Input
            autoFocus
            type={type}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
            className="h-7 text-xs"
            placeholder={placeholder}
          />
          <Button size="icon" variant="ghost" onClick={commit}><Check className="w-3 h-3 text-green-500" /></Button>
          <Button size="icon" variant="ghost" onClick={cancel}><X className="w-3 h-3 text-muted-foreground" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 group/ef">
      <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</Label>
      <button
        onClick={() => { setDraft(value ?? ""); setEditing(true); }}
        className="flex items-center gap-1 text-xs text-left hover:text-foreground text-muted-foreground transition-colors"
      >
        {prefix && <span>{prefix}</span>}
        <span>{value || <span className="italic opacity-40">Not set</span>}</span>
        <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/ef:opacity-60 transition-opacity" />
      </button>
    </div>
  );
}

// ─── HWI Progress Bar ─────────────────────────────────────────────────────────

function HWITracker({ limit, committed, onSave }: { limit: number | null; committed: number; onSave: (field: string, val: string | null) => void }) {
  const pct = limit && limit > 0 ? Math.min((committed / limit) * 100, 100) : 0;
  const available = limit ? Math.max(limit - committed, 0) : null;
  const isOver = limit ? committed > limit : false;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground">Currently committed (active projects)</p>
          <p className="text-2xl font-bold tabular-nums">{fmt(committed)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Exposure limit</p>
          <EditableField
            label=""
            value={limit ? String(limit) : ""}
            field="hwiExposureLimit"
            type="number"
            placeholder="e.g. 3000000"
            onSave={onSave}
            prefix="$"
          />
        </div>
      </div>

      {limit ? (
        <div>
          <div className="h-4 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isOver ? 'bg-destructive' : pct > 80 ? 'bg-orange-500' : 'bg-[#bba7db]'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
            <span>{pct.toFixed(1)}% used</span>
            <span>{available !== null ? `${fmt(available)} available` : ""}</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
          <Info className="w-3.5 h-3.5" />
          Set your HWI exposure limit above to see capacity
        </div>
      )}
    </div>
  );
}

// ─── Insurance Card ───────────────────────────────────────────────────────────

function InsuranceCard({
  title,
  icon: Icon,
  fields,
  onSave,
}: {
  title: string;
  icon: React.ComponentType<any>;
  fields: { label: string; field: string; value: string | null | undefined; type?: string; placeholder?: string; prefix?: string }[];
  onSave: (field: string, val: string | null) => void;
}) {
  const expiryField = fields.find(f => f.field.toLowerCase().includes("expiry"));
  const days = daysUntil(expiryField?.value);
  const statusColor = days === null ? "text-muted-foreground" : days < 0 ? "text-destructive" : days <= 30 ? "text-orange-500" : days <= 90 ? "text-yellow-500" : "text-green-500";
  const StatusIcon = days === null ? Clock : days < 0 ? AlertTriangle : days !== null && days <= 90 ? AlertTriangle : CheckCircle2;

  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          </div>
          <div className={`flex items-center gap-1 ${statusColor}`}>
            <StatusIcon className="w-3.5 h-3.5" />
            {expiryField && <ExpiryBadge dateStr={expiryField.value} />}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {fields.map(f => (
            <EditableField key={f.field} {...f} onSave={onSave} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ projects }: { projects: Project[] }) {
  const clientProjects = projects.filter(p => !p.isBusiness);

  const byStatus = (status: string) => clientProjects.filter(p => p.projectStatus === status);
  const leads = byStatus("lead");
  const preCon = byStatus("pre-construction");
  const construction = byStatus("construction");
  const postCon = byStatus("post-construction");

  const totalLocked = clientProjects
    .filter(p => p.projectStatus === "construction" && p.lockedContractPrice)
    .reduce((s, p) => s + (p.lockedContractPrice ?? 0), 0);

  const stages = [
    { label: "Lead", count: leads.length, color: "bg-blue-400" },
    { label: "Pre-Construction", count: preCon.length, color: "bg-yellow-400" },
    { label: "Construction", count: construction.length, color: "bg-[#bba7db]" },
    { label: "Post-Construction", count: postCon.length, color: "bg-green-400" },
  ];
  const total = clientProjects.length || 1;

  const kpis = [
    { label: "Total Projects", value: clientProjects.length, icon: Building2, sub: "All statuses" },
    { label: "Active (Construction)", value: construction.length, icon: CheckCircle2, sub: "Currently building" },
    { label: "In Pipeline", value: leads.length + preCon.length, icon: Briefcase, sub: "Leads & pre-con" },
    { label: "Contract Value (Active)", value: totalLocked > 0 ? fmt(totalLocked) : "—", icon: DollarSign, sub: "Locked contracts" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-2xl font-bold mt-0.5 tabular-nums">{k.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{k.sub}</p>
                </div>
                <k.icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Projects by Stage</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 flex flex-col gap-3">
          <div className="flex h-5 rounded-full overflow-hidden gap-0.5">
            {stages.map(s => (
              <div
                key={s.label}
                className={`${s.color} transition-all`}
                style={{ width: `${(s.count / total) * 100}%`, minWidth: s.count > 0 ? "4px" : "0" }}
                title={`${s.label}: ${s.count}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {stages.map(s => (
              <div key={s.label} className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <span className="text-xs font-semibold tabular-nums">{s.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Suggestions — Metrics to Add</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              "Gross margin % per project",
              "Quote win/loss rate",
              "Average project duration (weeks)",
              "Cost-to-completion variance",
              "Outstanding RFIs & RFQs count",
              "Variation count and value by project",
              "Subcontractor payment aging",
              "Client satisfaction scores",
            ].map(item => (
              <div key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 flex-shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Compliance Tab ───────────────────────────────────────────────────────────

function ComplianceTab({ settings, onSave, projects }: { settings: CompanySettings; onSave: (f: string, v: string | null) => void; projects: Project[] }) {
  const constructionProjects = projects.filter(p => !p.isBusiness && p.projectStatus === "construction");
  const committed = constructionProjects.reduce((s, p) => s + (p.lockedContractPrice ?? 0), 0);
  const hwiLimit = settings.hwiExposureLimit ? parseFloat(settings.hwiExposureLimit) : null;

  return (
    <div className="flex flex-col gap-4">
      {/* HWI */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Home Warranty Insurance (HWI / DBI)</CardTitle>
            </div>
            <ExpiryBadge dateStr={settings.hwiExpiryDate} />
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 flex flex-col gap-5">
          <HWITracker limit={hwiLimit} committed={committed} onSave={onSave} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 pt-2 border-t border-border/50">
            <EditableField label="Insurer" field="hwiInsurer" value={settings.hwiInsurer} onSave={onSave} placeholder="e.g. QBE" />
            <EditableField label="Policy Number" field="hwiPolicyNumber" value={settings.hwiPolicyNumber} onSave={onSave} />
            <EditableField label="Expiry Date" field="hwiExpiryDate" value={settings.hwiExpiryDate} type="date" onSave={onSave} />
          </div>
        </CardContent>
      </Card>

      {/* Builder Licence */}
      <InsuranceCard
        title="Builder's Licence"
        icon={Building2}
        onSave={onSave}
        fields={[
          { label: "Licence Number", field: "builderLicenseNumber", value: settings.builderLicenseNumber },
          { label: "State", field: "builderLicenseState", value: settings.builderLicenseState, placeholder: "e.g. VIC" },
          { label: "Expiry Date", field: "builderLicenseExpiry", value: settings.builderLicenseExpiry, type: "date" },
        ]}
      />

      {/* Public Liability */}
      <InsuranceCard
        title="Public Liability Insurance"
        icon={ShieldCheck}
        onSave={onSave}
        fields={[
          { label: "Insurer", field: "publicLiabilityInsurer", value: settings.publicLiabilityInsurer },
          { label: "Policy Number", field: "publicLiabilityPolicyNumber", value: settings.publicLiabilityPolicyNumber },
          { label: "Cover Limit", field: "publicLiabilityLimit", value: settings.publicLiabilityLimit ? fmt(Number(settings.publicLiabilityLimit)) : null, placeholder: "e.g. 20000000" },
          { label: "Expiry Date", field: "publicLiabilityExpiry", value: settings.publicLiabilityExpiry, type: "date" },
        ]}
      />

      {/* Contract Works */}
      <InsuranceCard
        title="Contract Works Insurance"
        icon={Briefcase}
        onSave={onSave}
        fields={[
          { label: "Insurer", field: "contractWorksInsurer", value: settings.contractWorksInsurer },
          { label: "Policy Number", field: "contractWorksPolicyNumber", value: settings.contractWorksPolicyNumber },
          { label: "Cover Limit", field: "contractWorksLimit", value: settings.contractWorksLimit ? fmt(Number(settings.contractWorksLimit)) : null, placeholder: "e.g. 5000000" },
          { label: "Expiry Date", field: "contractWorksExpiry", value: settings.contractWorksExpiry, type: "date" },
        ]}
      />

      {/* Workers Comp */}
      <InsuranceCard
        title="Workers Compensation"
        icon={ShieldCheck}
        onSave={onSave}
        fields={[
          { label: "Insurer", field: "workersCompInsurer", value: settings.workersCompInsurer },
          { label: "Policy Number", field: "workersCompPolicyNumber", value: settings.workersCompPolicyNumber },
          { label: "Expiry Date", field: "workersCompExpiry", value: settings.workersCompExpiry, type: "date" },
        ]}
      />

      {/* Professional Indemnity */}
      <InsuranceCard
        title="Professional Indemnity"
        icon={ShieldCheck}
        onSave={onSave}
        fields={[
          { label: "Insurer", field: "profIndemnityInsurer", value: settings.profIndemnityInsurer },
          { label: "Cover Limit", field: "profIndemnityLimit", value: settings.profIndemnityLimit ? fmt(Number(settings.profIndemnityLimit)) : null, placeholder: "e.g. 1000000" },
          { label: "Expiry Date", field: "profIndemnityExpiry", value: settings.profIndemnityExpiry, type: "date" },
        ]}
      />
    </div>
  );
}

// ─── Financial Tab ────────────────────────────────────────────────────────────

function FinancialTab({ settings, onSave, projects }: { settings: CompanySettings; onSave: (f: string, v: string | null) => void; projects: Project[] }) {
  const clientProjects = projects.filter(p => !p.isBusiness);
  const revenueTarget = settings.annualRevenueTarget ? parseFloat(settings.annualRevenueTarget) : null;
  const totalLocked = clientProjects
    .filter(p => p.lockedContractPrice && p.lockedContractPrice > 0)
    .reduce((s, p) => s + (p.lockedContractPrice ?? 0), 0);

  const pct = revenueTarget && revenueTarget > 0 ? Math.min((totalLocked / revenueTarget) * 100, 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm font-semibold">Annual Revenue Target</CardTitle>
            <EditableField
              label=""
              field="annualRevenueTarget"
              value={revenueTarget ? String(revenueTarget) : ""}
              type="number"
              placeholder="e.g. 5000000"
              onSave={onSave}
              prefix="$"
            />
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 flex flex-col gap-3">
          <div className="flex items-end justify-between gap-2 flex-wrap">
            <div>
              <p className="text-xs text-muted-foreground">Total locked contract value</p>
              <p className="text-2xl font-bold tabular-nums">{fmt(totalLocked)}</p>
            </div>
            {revenueTarget && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Target</p>
                <p className="text-lg font-semibold tabular-nums text-muted-foreground">{fmt(revenueTarget)}</p>
              </div>
            )}
          </div>
          {revenueTarget ? (
            <div>
              <div className="h-4 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#bba7db] rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                <span>{pct.toFixed(1)}% of target</span>
                <span>{fmt(Math.max(revenueTarget - totalLocked, 0))} to go</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
              <Info className="w-3.5 h-3.5" />
              Set an annual revenue target above to track progress
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { label: "Construction Stage", status: "construction" },
          { label: "Pre-Construction", status: "pre-construction" },
        ].map(({ label, status }) => {
          const ps = clientProjects.filter(p => p.projectStatus === status);
          const val = ps.reduce((s, p) => s + (p.lockedContractPrice ?? 0), 0);
          return (
            <Card key={status}>
              <CardContent className="pt-4 pb-4 px-4">
                <p className="text-xs text-muted-foreground">{label} — Locked Value</p>
                <p className="text-xl font-bold tabular-nums mt-0.5">{val > 0 ? fmt(val) : "—"}</p>
                <p className="text-[10px] text-muted-foreground">{ps.length} project{ps.length !== 1 ? "s" : ""}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Coming Soon</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              "Gross margin % per project",
              "Invoice payments received YTD",
              "Outstanding receivables aging",
              "Subcontractor costs vs budget",
              "Cash flow projection (13-week)",
              "Actual vs budgeted materials",
            ].map(item => (
              <div key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 flex-shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Pipeline Tab ─────────────────────────────────────────────────────────────

function PipelineTab({ projects }: { projects: Project[] }) {
  const clientProjects = projects.filter(p => !p.isBusiness);
  const leads = clientProjects.filter(p => p.projectStatus === "lead");
  const quotes = clientProjects.filter(p => p.projectStatus === "pre-construction");
  const active = clientProjects.filter(p => p.projectStatus === "construction");
  const completed = clientProjects.filter(p => p.projectStatus === "post-construction");

  const totalPipeline = leads.length + quotes.length;
  const conversionRate = totalPipeline > 0 ? ((active.length + completed.length) / (totalPipeline + active.length + completed.length) * 100) : 0;

  const pipelineStages = [
    { label: "Leads", count: leads.length, color: "bg-blue-400", desc: "New enquiries & site inspections" },
    { label: "Quoting", count: quotes.length, color: "bg-yellow-400", desc: "Estimates being prepared" },
    { label: "Won (Active)", count: active.length, color: "bg-[#bba7db]", desc: "Currently under construction" },
    { label: "Completed", count: completed.length, color: "bg-green-400", desc: "Post-construction & handover" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {pipelineStages.map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-start gap-2">
                <div className={`w-3 h-3 rounded-full ${s.color} mt-0.5 flex-shrink-0`} />
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold tabular-nums">{s.count}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.desc}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Win Rate</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 flex flex-col gap-3">
          <div className="flex items-end gap-4">
            <div>
              <p className="text-2xl font-bold tabular-nums">{conversionRate.toFixed(0)}%</p>
              <p className="text-xs text-muted-foreground">Estimated conversion rate</p>
            </div>
            <div className="text-xs text-muted-foreground">
              <p>{active.length + completed.length} won vs {totalPipeline} in pipeline/lost</p>
            </div>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-[#bba7db] rounded-full transition-all"
              style={{ width: `${conversionRate}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Coming Soon</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              "Average quote-to-award time (days)",
              "Average project contract value",
              "Lost tender tracking & reasons",
              "Lead source attribution",
              "Quote acceptance rate by type",
              "Tender margin analysis",
            ].map(item => (
              <div key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 flex-shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BusinessMetrics() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const { data: settings = {} as CompanySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: () => fetch("/api/projects", { credentials: "include" }).then(r => r.json()),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<CompanySettings>) => apiRequest("/api/company-settings", "PATCH", data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ["/api/company-settings"] });
      const prev = queryClient.getQueryData(["/api/company-settings"]);
      queryClient.setQueryData(["/api/company-settings"], (old: any) => ({ ...old, ...data }));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(["/api/company-settings"], ctx?.prev);
      toast({ title: "Save failed", variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/company-settings"] }),
  });

  const handleSave = (field: string, val: string | null) => {
    updateMutation.mutate({ [field]: val });
  };

  const renderTab = () => {
    switch (activeTab) {
      case "overview": return <OverviewTab projects={projects} />;
      case "compliance": return <ComplianceTab settings={settings} onSave={handleSave} projects={projects} />;
      case "hbcf": return null; // rendered outside scroll wrapper
      case "financial": return <FinancialTab settings={settings} onSave={handleSave} projects={projects} />;
      case "pipeline": return <PipelineTab projects={projects} />;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Inner tab bar */}
      <div className="flex items-center gap-1 px-4 border-b border-border/50 flex-shrink-0 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 h-9 px-3 text-xs font-medium border-b-2 transition-colors flex-shrink-0 ${
                isActive
                  ? "border-[#bba7db] text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {activeTab === "hbcf" ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <HBCFTracker />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4">
          {renderTab()}
        </div>
      )}
    </div>
  );
}
