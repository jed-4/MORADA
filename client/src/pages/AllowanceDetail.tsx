import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, ChevronDown, ChevronRight, CheckCircle, RotateCcw, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useState } from "react";
import { useAllowanceStatusOptions } from "@/hooks/useAllowanceStatusOptions";
import { LayoutList, Users, CalendarDays } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type EstimateItem = {
  id: string;
  estimateId: string;
  name: string;
  allowance: string;
  allowanceStatus: string;
  pcMarkupPercent: number | null;
  unitCostExTax: number;
  quantity: number;
  priceIncTax: number;
  estimateName: string;
  estimateVersion: number;
};

type AllowanceWithCosts = {
  item: EstimateItem;
  actualCost: number;
  variance: number;
};

type Bill = {
  id: string;
  billNumber: string;
  billDate: string;
  supplierId: string;
  billReference?: string;
  total: number;
};

type BillLineItem = {
  id: string;
  billId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

type Timesheet = {
  id: string;
  projectId: string;
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  description: string;
  status: string;
  total: number;
};

type User = {
  id: string;
  firstName: string;
  lastName: string;
};

type CustomLine = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

type AllocatedBill = {
  id: string;
  billId: string;
  billNumber: string;
  billDate: string;
  supplierName: string;
  supplierId: string;
  lineItemDescription: string;
  amountIncGst: number;
  amountExGst: number;
};

type AllocatedTimesheet = {
  id: string;
  timesheetId: string;
  date: string;
  userId: string;
  staffName: string;
  durationHours: number;
  hourlyRateCents: number;
  amountIncGst: number;
  amountExGst: number;
};

type AllocatedItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

type AllowanceDetailData = {
  allocatedBills: AllocatedBill[];
  allocatedTimesheets: AllocatedTimesheet[];
  allocatedItems: AllocatedItem[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCurrency = (cents: number) => {
  const dollars = cents / 100;
  const isWholeNumber = dollars % 1 === 0;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: isWholeNumber ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars);
};

const exGst = (incGstCents: number) => Math.round(incGstCents / 1.1);

const initials = (name: string) =>
  name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

const avatarColors = [
  { bg: "hsl(var(--amber-light))", text: "hsl(var(--amber))" },
  { bg: "hsl(var(--teal-light))", text: "hsl(var(--teal))" },
  { bg: "hsl(var(--sage-light))", text: "hsl(var(--sage))" },
  { bg: "hsl(var(--coral-light))", text: "hsl(var(--coral))" },
  { bg: "hsl(var(--primary) / 0.12)", text: "hsl(var(--primary))" },
];
const avatarColor = (index: number) => avatarColors[index % avatarColors.length];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({
  accentColor,
  iconBg,
  iconText,
  title,
  subtitle,
  actionLabel,
  onAction,
  children,
}: {
  accentColor: string;
  iconBg: string;
  iconText: string;
  title: string;
  subtitle: string;
  actionLabel: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative bg-card rounded-xl border border-border overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accentColor }} />
      <div className="px-5 py-4 pl-6">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: iconBg, color: accentColor }}
            >
              {iconText}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <Button size="sm" onClick={onAction} className="text-xs h-7 px-3">
            {actionLabel}
          </Button>
        </div>
        <div className="mt-3 border-t border-border" />
        {children}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AllowanceDetail() {
  const { projectId, allowanceId } = useParams<{ projectId: string; allowanceId: string }>();
  const [, setLocation] = useLocation();
  const { getStatusInfo } = useAllowanceStatusOptions();

  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isPsBillModalOpen, setIsPsBillModalOpen] = useState(false);
  const [isTimesheetModalOpen, setIsTimesheetModalOpen] = useState(false);
  const [timesheetDisplayMode, setTimesheetDisplayMode] = useState<"date" | "person" | "description">("person");
  const [expandedBills, setExpandedBills] = useState<Set<string>>(new Set());
  const [expandedPsBills, setExpandedPsBills] = useState<Set<string>>(new Set());
  const [selectedLineItems, setSelectedLineItems] = useState<Set<string>>(new Set());
  const [selectedPsLineItems, setSelectedPsLineItems] = useState<Set<string>>(new Set());
  const [selectedTimesheets, setSelectedTimesheets] = useState<Set<string>>(new Set());
  const [customLines, setCustomLines] = useState<CustomLine[]>([]);
  const [isCustomLineDialogOpen, setIsCustomLineDialogOpen] = useState(false);
  const [customLineDescription, setCustomLineDescription] = useState("");
  const [customLineQuantity, setCustomLineQuantity] = useState("1");
  const [customLineUnitPrice, setCustomLineUnitPrice] = useState("");
  const [enteredActualCost, setEnteredActualCost] = useState("");
  const [isSavingPc, setIsSavingPc] = useState(false);
  const [isSavingPs, setIsSavingPs] = useState(false);

  const [pcQuantity, setPcQuantity] = useState("1");
  const [pcUnitCostExTax, setPcUnitCostExTax] = useState("");
  const [pcUnitCostIncTax, setPcUnitCostIncTax] = useState("");
  const [pcMarkupPercent, setPcMarkupPercent] = useState("");
  const [useSimpleEntry, setUseSimpleEntry] = useState(false);

  // ── Queries ──
  const { data: allowances = [], isLoading } = useQuery<AllowanceWithCosts[]>({
    queryKey: ["/api/projects", projectId, "allowances"],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/allowances`);
      if (!response.ok) throw new Error("Failed to fetch allowances");
      return response.json();
    },
  });

  const { data: bills = [] } = useQuery<Bill[]>({
    queryKey: ["/api/projects", projectId, "bills"],
    enabled: isBillModalOpen || isPsBillModalOpen,
  });

  const { data: billLineItems = [] } = useQuery<BillLineItem[]>({
    queryKey: ["/api/projects", projectId, "bill-line-items"],
    enabled: isBillModalOpen || isPsBillModalOpen,
  });

  const { data: timesheets = [] } = useQuery<Timesheet[]>({
    queryKey: ["/api/projects", projectId, "timesheets"],
    enabled: isTimesheetModalOpen,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: allocatedDetail, refetch: refetchDetail } = useQuery<AllowanceDetailData>({
    queryKey: ["/api/projects", projectId, "allowances", allowanceId, "detail"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/allowances/${allowanceId}/detail`);
      if (!res.ok) return { allocatedBills: [], allocatedTimesheets: [], allocatedItems: [] };
      return res.json();
    },
    enabled: !!projectId && !!allowanceId,
  });

  const allocatedBills = allocatedDetail?.allocatedBills ?? [];
  const allocatedTimesheets = allocatedDetail?.allocatedTimesheets ?? [];
  const allocatedItems = allocatedDetail?.allocatedItems ?? [];

  const getUserName = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return userId.slice(0, 8) + "…";
    return `${user.firstName} ${user.lastName}`.trim() || userId.slice(0, 8);
  };

  const { toast } = useToast();

  // ── Mutations ──
  const createBillLineItemAllowanceMutation = useMutation({
    mutationFn: async ({ billLineItemId, amount }: { billLineItemId: string; amount: number }) => {
      return apiRequest("/api/bill-line-item-allowances", "POST", {
        billLineItemId,
        estimateItemId: allowanceId,
        amount,
      });
    },
  });

  const createTimesheetAllowanceMutation = useMutation({
    mutationFn: async ({ timesheetId, amount }: { timesheetId: string; amount: number }) => {
      return apiRequest("/api/timesheet-allowances", "POST", {
        timesheetId,
        estimateItemId: allowanceId,
        amount,
      });
    },
  });

  const createAllowanceItemMutation = useMutation({
    mutationFn: async (item: { description: string; quantity: number; unitPrice: number; totalPrice: number; sortOrder: number }) => {
      return apiRequest("/api/allowance-items", "POST", {
        estimateItemId: allowanceId,
        ...item,
      });
    },
  });

  const updateAllowanceStatusMutation = useMutation({
    mutationFn: async (allowanceStatus: string) => {
      return apiRequest(`/api/estimate-items/${allowanceId}/allowance-status`, "PATCH", { allowanceStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
      toast({ title: "Status updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    },
  });

  // ── Handlers ──
  const handleSavePcItem = async () => {
    if (isSavingPc) return;
    setIsSavingPc(true);
    try {
      if (useSimpleEntry && enteredActualCost) {
        const totalPrice = Math.round(parseFloat(parseFloat(enteredActualCost).toFixed(2)) * 100);
        await createAllowanceItemMutation.mutateAsync({
          description: "Actual cost entry",
          quantity: 1,
          unitPrice: totalPrice,
          totalPrice,
          sortOrder: 0,
        });
        await queryClient.refetchQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
        setEnteredActualCost("");
      } else if (!useSimpleEntry && (pcQuantity || pcUnitCostExTax)) {
        const qty = parseFloat(pcQuantity) || 0;
        const unitCost = parseFloat(parseFloat(pcUnitCostExTax || "0").toFixed(2)) || 0;
        const markup = parseFloat(pcMarkupPercent) || 0;
        const builderCostExTax = Math.round(qty * unitCost * 100);
        const markupAmount = Math.round((builderCostExTax * markup) / 100);
        const amountExTax = builderCostExTax + markupAmount;
        const taxRate = 10;
        const amountTax = Math.round((amountExTax * taxRate) / 100);
        const totalPrice = amountExTax + amountTax;
        await createAllowanceItemMutation.mutateAsync({
          description: `${qty} × $${unitCost.toFixed(2)}${markup ? ` + ${markup}% markup` : ""}`,
          quantity: qty,
          unitPrice: Math.round(unitCost * 100),
          totalPrice,
          sortOrder: 0,
        });
        await queryClient.refetchQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
        setPcQuantity("1");
        setPcUnitCostExTax("");
        setPcUnitCostIncTax("");
        setPcMarkupPercent("");
      } else if (selectedLineItems.size > 0) {
        const selectedItems = billLineItems.filter((item) => selectedLineItems.has(item.id));
        for (const item of selectedItems) {
          await createBillLineItemAllowanceMutation.mutateAsync({ billLineItemId: item.id, amount: item.total });
        }
        await queryClient.refetchQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
        setSelectedLineItems(new Set());
      }
    } catch {
      toast({ title: "Error", description: "Failed to save PC allowance. Please try again.", variant: "destructive" });
    } finally {
      setIsSavingPc(false);
    }
  };

  const handleSavePsItem = async () => {
    if (selectedPsLineItems.size === 0 && selectedTimesheets.size === 0 && customLines.length === 0) return;
    if (isSavingPs) return;
    setIsSavingPs(true);
    try {
      if (selectedPsLineItems.size > 0) {
        const selectedItems = billLineItems.filter((item) => selectedPsLineItems.has(item.id));
        for (const item of selectedItems) {
          await createBillLineItemAllowanceMutation.mutateAsync({ billLineItemId: item.id, amount: item.total });
        }
      }
      if (selectedTimesheets.size > 0) {
        const selectedItems = timesheets.filter((ts) => selectedTimesheets.has(ts.id));
        for (const timesheet of selectedItems) {
          const amountCents = Math.round(timesheet.total * 100);
          await createTimesheetAllowanceMutation.mutateAsync({ timesheetId: timesheet.id, amount: amountCents });
        }
      }
      if (customLines.length > 0) {
        for (let i = 0; i < customLines.length; i++) {
          const line = customLines[i];
          await createAllowanceItemMutation.mutateAsync({
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            totalPrice: line.total,
            sortOrder: i,
          });
        }
      }
      await queryClient.refetchQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
      setSelectedPsLineItems(new Set());
      setSelectedTimesheets(new Set());
      setCustomLines([]);
    } catch {
      toast({ title: "Error", description: "Failed to save PS allowance. Please try again.", variant: "destructive" });
    } finally {
      setIsSavingPs(false);
    }
  };

  const toggleBillExpanded = (billId: string) => {
    const s = new Set(expandedBills);
    s.has(billId) ? s.delete(billId) : s.add(billId);
    setExpandedBills(s);
  };
  const toggleLineItemSelection = (id: string) => {
    const s = new Set(selectedLineItems);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedLineItems(s);
  };
  const togglePsBillExpanded = (billId: string) => {
    const s = new Set(expandedPsBills);
    s.has(billId) ? s.delete(billId) : s.add(billId);
    setExpandedPsBills(s);
  };
  const togglePsLineItemSelection = (id: string) => {
    const s = new Set(selectedPsLineItems);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedPsLineItems(s);
  };
  const toggleTimesheetSelection = (id: string) => {
    const s = new Set(selectedTimesheets);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedTimesheets(s);
  };
  const handleAddCustomLine = () => {
    if (!customLineDescription || !customLineUnitPrice) return;
    const quantity = parseInt(customLineQuantity) || 1;
    const unitPrice = Math.round(parseFloat(customLineUnitPrice) * 100);
    const total = quantity * unitPrice;
    setCustomLines([...customLines, { id: `custom-${Date.now()}`, description: customLineDescription, quantity, unitPrice, total }]);
    setCustomLineDescription("");
    setCustomLineQuantity("1");
    setCustomLineUnitPrice("");
    setIsCustomLineDialogOpen(false);
  };
  const handleRemoveCustomLine = (id: string) => setCustomLines(customLines.filter((l) => l.id !== id));

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="h-32 bg-muted rounded" />
          <div className="h-48 bg-muted rounded" />
        </div>
      </div>
    );
  }

  const allowance = allowances.find((a) => a.item.id === allowanceId);

  if (!allowance) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <Button variant="ghost" onClick={() => setLocation(`/projects/${projectId}/allowances`)} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Allowances
        </Button>
        <EmptyState
          variant="card"
          title="Allowance Not Found"
          description="The requested allowance could not be found."
        />
      </div>
    );
  }

  const { item, actualCost, variance } = allowance;
  const statusInfo = getStatusInfo(item.allowanceStatus);
  const isPrimeCost = item.allowance === "Prime Cost";

  const estimateIncGst = item.priceIncTax;
  const estimateExGst = exGst(estimateIncGst);
  const actualIncGst = actualCost;
  const actualExGst = exGst(actualIncGst);
  const varianceIncGst = Math.abs(variance);
  const varianceExGst = exGst(varianceIncGst);
  const isOverBudget = variance > 0;
  const percentUsed = estimateIncGst > 0 ? Math.min(Math.round((actualIncGst / estimateIncGst) * 100), 100) : 0;

  const statusBgColor = statusInfo.color ? `${statusInfo.color}18` : "hsl(var(--muted))";
  const statusTextColor = statusInfo.color || "hsl(var(--muted-foreground))";

  const pendingPsBillItems = billLineItems.filter((li) => selectedPsLineItems.has(li.id));
  const pendingTimesheets = timesheets.filter((ts) => selectedTimesheets.has(ts.id));
  const hasPendingItems = pendingPsBillItems.length > 0 || pendingTimesheets.length > 0 || customLines.length > 0;

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-4 max-w-5xl mx-auto">

        {/* Back link */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation(`/projects/${projectId}/allowances`)}
          className="mb-1 -ml-2"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Allowances
        </Button>

        {/* ── HEADER CARD ─────────────────────────────────────────────────── */}
        <div className="relative bg-card rounded-xl border border-border overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />
          <div className="px-5 py-4 pl-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-semibold text-foreground truncate mb-2" data-testid="allowance-name">
                  {item.name}
                </h1>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary text-primary">
                    {isPrimeCost ? "Prime Cost" : "Provisional Sum"}
                  </span>
                  <span className="text-muted-foreground text-xs">·</span>
                  <span className="text-xs text-muted-foreground">
                    {item.estimateName} (v{item.estimateVersion})
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                <span
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{ background: statusBgColor, color: statusTextColor }}
                  data-testid="badge-status"
                >
                  ● {statusInfo.name}
                </span>
                {item.allowanceStatus !== "finalized" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={updateAllowanceStatusMutation.isPending}
                    onClick={() => updateAllowanceStatusMutation.mutate("finalized")}
                    data-testid="button-finalise-allowance"
                  >
                    {updateAllowanceStatusMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Finalise
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={updateAllowanceStatusMutation.isPending}
                    onClick={() => updateAllowanceStatusMutation.mutate("in_progress")}
                    data-testid="button-reopen-allowance"
                  >
                    {updateAllowanceStatusMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Reopen
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {isPrimeCost ? "PC" : "PS"} allowance · {item.estimateName}
              </p>
            </div>
          </div>
        </div>

        {/* ── FINANCIAL SUMMARY ───────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-border">
            <div className="p-4">
              <p className="text-[11px] font-medium text-muted-foreground mb-1">Estimate</p>
              <p className="text-2xl font-bold text-foreground" data-testid="text-estimate-price">
                {formatCurrency(estimateExGst)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">ex GST</p>
              <p className="text-[10px] text-muted-foreground">{formatCurrency(estimateIncGst)} inc GST</p>
            </div>
            <div className="p-4">
              <p className="text-[11px] font-medium text-muted-foreground mb-1">Actual Spend</p>
              <p className="text-2xl font-bold text-foreground" data-testid="text-actual-price">
                {formatCurrency(actualExGst)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">ex GST</p>
              <p className="text-[10px] text-muted-foreground">{formatCurrency(actualIncGst)} inc GST</p>
            </div>
            <div className="p-4">
              <p className="text-[11px] font-medium text-muted-foreground mb-1">Variance</p>
              <p
                className="text-2xl font-bold"
                style={{ color: isOverBudget ? "hsl(var(--coral))" : "hsl(var(--sage))" }}
                data-testid="text-variance"
              >
                {isOverBudget ? "↑" : "↓"} {formatCurrency(varianceExGst)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">ex GST</p>
              <p
                className="text-[10px] font-medium"
                style={{ color: isOverBudget ? "hsl(var(--coral))" : "hsl(var(--sage))" }}
              >
                {isOverBudget ? "Over budget" : "Under budget"}
              </p>
            </div>
          </div>
          <div className="px-4 pb-4 pt-1">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${percentUsed}%`,
                  background: isOverBudget ? "hsl(var(--coral))" : "hsl(var(--primary))",
                }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <p className="text-[10px] text-muted-foreground">{percentUsed}% used</p>
              <p
                className="text-[10px] font-medium"
                style={{ color: isOverBudget ? "hsl(var(--coral))" : "hsl(var(--sage))" }}
              >
                {formatCurrency(Math.abs(estimateExGst - actualExGst))} ex remaining
              </p>
            </div>
          </div>
        </div>

        {/* ── PS SECTIONS ─────────────────────────────────────────────────── */}
        {!isPrimeCost && (
          <>
            {/* Bills */}
            <SectionCard
              accentColor="hsl(var(--amber))"
              iconBg="hsl(var(--amber-light))"
              iconText="$"
              title="Bills"
              subtitle="Supplier invoices for this allowance"
              actionLabel="+ Add Bills"
              onAction={() => setIsPsBillModalOpen(true)}
            >
              {allocatedBills.length === 0 && pendingPsBillItems.length === 0 ? (
                <EmptyState
                  variant="inline"
                  title="No bills added yet"
                  description={"Click “+ Add Bills” to allocate supplier invoices."}
                  className="py-6"
                />
              ) : (
                <div className="pt-2">
                  <div
                    className="grid text-[9px] font-semibold text-muted-foreground uppercase tracking-wide py-2 border-b border-border gap-2"
                    style={{ gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1fr 80px" }}
                  >
                    <span>Supplier</span>
                    <span>Invoice #</span>
                    <span>Date</span>
                    <span className="text-right">Ex GST</span>
                    <span className="text-right">Inc GST</span>
                    <span>Status</span>
                  </div>
                  {allocatedBills.map((bill, idx) => (
                    <div
                      key={bill.id}
                      className="grid items-center py-2.5 border-b border-border gap-2"
                      style={{ gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1fr 80px" }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                          style={{ background: avatarColor(idx).bg, color: avatarColor(idx).text }}
                        >
                          {initials(bill.supplierName || bill.billNumber)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{bill.supplierName || "—"}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{bill.lineItemDescription}</p>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{bill.billNumber}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(bill.billDate).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}
                      </p>
                      <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(bill.amountExGst)}</p>
                      <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(bill.amountIncGst)}</p>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit"
                        style={{ background: "hsl(var(--sage-light))", color: "hsl(var(--sage))" }}
                      >
                        Saved
                      </span>
                    </div>
                  ))}
                  {pendingPsBillItems.map((li, idx) => {
                    const parentBill = bills.find((b) => b.id === li.billId);
                    const liExGst = exGst(li.total);
                    return (
                      <div
                        key={li.id}
                        className="grid items-center py-2.5 border-b border-border gap-2"
                        style={{ gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1fr 80px", background: "hsl(var(--amber-light) / 0.4)" }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                            style={{ background: "hsl(var(--amber-light))", color: "hsl(var(--amber))" }}
                          >
                            {initials(parentBill?.billReference || parentBill?.billNumber || "??")}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">
                              {parentBill?.billReference || parentBill?.billNumber || "Bill"}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">{li.description}</p>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{parentBill?.billNumber || "—"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {parentBill ? new Date(parentBill.billDate).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                        </p>
                        <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(liExGst)}</p>
                        <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(li.total)}</p>
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit"
                          style={{ background: "hsl(var(--amber-light))", color: "hsl(var(--amber))" }}
                        >
                          Pending
                        </span>
                      </div>
                    );
                  })}
                  {(allocatedBills.length > 0 || pendingPsBillItems.length > 0) && (
                    <div className="flex justify-between items-center pt-2">
                      <span
                        className="text-xs font-medium cursor-pointer"
                        style={{ color: "hsl(var(--primary))" }}
                        onClick={() => setIsPsBillModalOpen(true)}
                      >
                        + Add more
                      </span>
                      <p className="text-xs font-semibold text-foreground">
                        Subtotal:{" "}
                        {formatCurrency(
                          allocatedBills.reduce((s, b) => s + b.amountExGst, 0) +
                            pendingPsBillItems.reduce((s, li) => s + exGst(li.total), 0)
                        )}{" "}
                        ex
                      </p>
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            {/* Timesheets */}
            <SectionCard
              accentColor="hsl(var(--teal))"
              iconBg="hsl(var(--teal-light))"
              iconText="T"
              title="Timesheets"
              subtitle="Labour entries for this allowance"
              actionLabel="+ Add Timesheets"
              onAction={() => setIsTimesheetModalOpen(true)}
            >
              {allocatedTimesheets.length === 0 && pendingTimesheets.length === 0 ? (
                <EmptyState variant="inline" title="No timesheets added yet." className="py-6" />
              ) : (
                <div className="pt-2">
                  <div
                    className="grid text-[9px] font-semibold text-muted-foreground uppercase tracking-wide py-2 border-b border-border gap-2"
                    style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr" }}
                  >
                    <span>Team member</span>
                    <span>Hours</span>
                    <span>Rate</span>
                    <span className="text-right">Ex GST</span>
                    <span className="text-right">Inc GST</span>
                  </div>
                  {allocatedTimesheets.map((ts, idx) => (
                    <div
                      key={ts.id}
                      className="grid items-center py-2.5 border-b border-border gap-2"
                      style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr" }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                          style={{ background: avatarColor(idx).bg, color: avatarColor(idx).text }}
                        >
                          {initials(ts.staffName || "TM")}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-foreground">{ts.staffName || "Team member"}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(ts.date).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}
                          </p>
                        </div>
                      </div>
                      <p className="text-[11px] text-foreground">{ts.durationHours} hrs</p>
                      <p className="text-[11px] text-foreground">{formatCurrency(ts.hourlyRateCents)}/hr</p>
                      <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(ts.amountExGst)}</p>
                      <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(ts.amountIncGst)}</p>
                    </div>
                  ))}
                  {pendingTimesheets.map((ts, idx) => {
                    const totalCents = Math.round(ts.total * 100);
                    const tsExGst = exGst(totalCents);
                    const hourlyRate = ts.duration > 0 ? Math.round(totalCents / ts.duration) : 0;
                    const staffName = getUserName(ts.userId);
                    return (
                      <div
                        key={ts.id}
                        className="grid items-center py-2.5 border-b border-border gap-2"
                        style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", background: "hsl(var(--teal-light) / 0.3)" }}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                            style={{ background: "hsl(var(--teal-light))", color: "hsl(var(--teal))" }}
                          >
                            {initials(staffName)}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-foreground">{staffName}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(ts.date).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}
                            </p>
                          </div>
                        </div>
                        <p className="text-[11px] text-foreground">{ts.duration} hrs</p>
                        <p className="text-[11px] text-foreground">{formatCurrency(hourlyRate)}/hr</p>
                        <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(tsExGst)}</p>
                        <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(totalCents)}</p>
                      </div>
                    );
                  })}
                  {(allocatedTimesheets.length > 0 || pendingTimesheets.length > 0) && (
                    <div className="flex justify-end pt-2">
                      <p className="text-xs font-semibold text-foreground">
                        Subtotal:{" "}
                        {formatCurrency(
                          allocatedTimesheets.reduce((s, ts) => s + ts.amountExGst, 0) +
                            pendingTimesheets.reduce((s, ts) => s + exGst(Math.round(ts.total * 100)), 0)
                        )}{" "}
                        ex
                      </p>
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            {/* Custom Lines */}
            <SectionCard
              accentColor="hsl(var(--sage))"
              iconBg="hsl(var(--sage-light))"
              iconText="+"
              title="Custom Lines"
              subtitle="Manual line items not covered above"
              actionLabel="+ Add Line"
              onAction={() => setIsCustomLineDialogOpen(true)}
            >
              {customLines.length === 0 && allocatedItems.length === 0 ? (
                <EmptyState
                  variant="inline"
                  title="No custom lines yet"
                  description="Add a line for any cost not covered by bills or timesheets."
                  className="py-6"
                />
              ) : (
                <div className="pt-2 space-y-2">
                  {[...allocatedItems, ...customLines].map((line) => {
                    const isCustom = customLines.some((c) => c.id === line.id);
                    return (
                      <div key={line.id} className="flex items-center justify-between py-2 border-b border-border">
                        <div>
                          <p className="text-xs font-semibold text-foreground">{line.description}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {line.quantity} × {formatCurrency(line.unitPrice)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-xs font-semibold">{formatCurrency(exGst(line.total))} ex</p>
                            <p className="text-[10px] text-muted-foreground">{formatCurrency(line.total)} inc</p>
                          </div>
                          {isCustom && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleRemoveCustomLine(line.id)}
                            >
                              <Plus className="h-3 w-3 rotate-45" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            {/* Total bar */}
            <div
              className="rounded-xl px-5 py-4 flex items-center gap-4 flex-wrap"
              style={{ background: "hsl(var(--foreground))" }}
            >
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                  TOTAL ACTUAL
                </p>
                <p className="text-sm font-semibold text-white">
                  {formatCurrency(actualExGst)} ex &nbsp;/&nbsp; {formatCurrency(actualIncGst)} inc GST
                </p>
              </div>
              <p className="text-[11px] ml-2" style={{ color: "rgba(255,255,255,0.35)" }}>
                vs Estimate {formatCurrency(estimateExGst)} ex / {formatCurrency(estimateIncGst)} inc
              </p>
              <div className="ml-auto">
                <span
                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{
                    background: isOverBudget ? "hsl(var(--coral-light))" : "hsl(var(--sage-light))",
                    color: isOverBudget ? "hsl(var(--coral))" : "hsl(var(--sage))",
                  }}
                >
                  {isOverBudget ? "↑ Over budget" : "↓ Under budget"}
                </span>
              </div>
            </div>

            {/* Save / Discard pending */}
            {hasPendingItems && (
              <div className="flex justify-end gap-3 pt-1">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedPsLineItems(new Set());
                    setSelectedTimesheets(new Set());
                    setCustomLines([]);
                  }}
                >
                  Discard
                </Button>
                <Button onClick={handleSavePsItem} disabled={isSavingPs} data-testid="button-save-ps-item">
                  {isSavingPs ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            )}
          </>
        )}

        {/* ── PC SECTION ──────────────────────────────────────────────────── */}
        {isPrimeCost && (
          <div className="relative bg-card rounded-xl border border-border overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />
            <div className="px-5 py-4 pl-6">
              <p className="text-sm font-semibold text-foreground mb-1">Actual Cost</p>
              <p className="text-xs text-muted-foreground mb-4">Enter the actual cost or select from bill line items</p>

              {useSimpleEntry ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="actualCost" className="text-xs">Actual Cost (excl. markup)</Label>
                    <Input
                      id="actualCost"
                      type="number"
                      step="0.01"
                      placeholder="Enter cost"
                      value={enteredActualCost}
                      onChange={(e) => setEnteredActualCost(e.target.value)}
                      data-testid="input-actual-cost"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <Button variant="ghost" size="sm" onClick={() => setUseSimpleEntry(false)} className="text-xs" data-testid="button-show-breakdown">
                      Show pricing breakdown
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSavePcItem}
                      disabled={(!enteredActualCost && selectedLineItems.size === 0) || isSavingPc}
                      data-testid="button-save-pc-item"
                    >
                      {isSavingPc ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-semibold">Pricing Breakdown</p>
                    <Button variant="ghost" size="sm" onClick={() => setUseSimpleEntry(true)} className="text-xs" data-testid="button-hide-breakdown">
                      Use simple entry
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pcQuantity" className="text-xs">Quantity</Label>
                    <Input
                      id="pcQuantity"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="1"
                      value={pcQuantity}
                      onChange={(e) => setPcQuantity(e.target.value)}
                      data-testid="input-pc-quantity"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="pcUnitCostExTax" className="text-xs">Unit Cost (Ex Tax)</Label>
                      <Input
                        id="pcUnitCostExTax"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={pcUnitCostExTax}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPcUnitCostExTax(v);
                          if (v) {
                            const ex = Math.round(parseFloat(v) * 100);
                            setPcUnitCostIncTax((Math.round((ex * 11) / 10) / 100).toFixed(2));
                          } else setPcUnitCostIncTax("");
                        }}
                        data-testid="input-pc-unit-cost-ex-tax"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pcUnitCostIncTax" className="text-xs">Unit Cost (Inc Tax)</Label>
                      <Input
                        id="pcUnitCostIncTax"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={pcUnitCostIncTax}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPcUnitCostIncTax(v);
                          if (v) {
                            const inc = Math.round(parseFloat(v) * 100);
                            setPcUnitCostExTax((Math.round((inc * 10) / 11) / 100).toFixed(2));
                          } else setPcUnitCostExTax("");
                        }}
                        data-testid="input-pc-unit-cost-inc-tax"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pcMarkupPercent" className="text-xs">Markup % (Optional)</Label>
                    <Input
                      id="pcMarkupPercent"
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="0"
                      value={pcMarkupPercent}
                      onChange={(e) => setPcMarkupPercent(e.target.value)}
                      data-testid="input-pc-markup"
                      className="h-8 text-sm"
                    />
                  </div>
                  {(() => {
                    const qty = parseFloat(pcQuantity) || 0;
                    const unitCost = parseFloat(pcUnitCostExTax) || 0;
                    const markup = parseFloat(pcMarkupPercent) || 0;
                    const builderExCents = Math.round(qty * unitCost * 100);
                    const builderIncCents = builderExCents + Math.round((builderExCents * 10) / 100);
                    const markupCents = Math.round((builderExCents * markup) / 100);
                    const amountEx = builderExCents + markupCents;
                    const amountInc = amountEx + Math.round((amountEx * 10) / 100);
                    return (
                      <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border border-border bg-muted/30 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Builder cost ex tax</p>
                          <p className="font-semibold" data-testid="text-builder-cost-ex-tax">{formatCurrency(builderExCents)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Builder cost inc tax</p>
                          <p className="font-semibold" data-testid="text-builder-cost-inc-tax">{formatCurrency(builderIncCents)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Amount ex tax</p>
                          <p className="font-semibold" data-testid="text-amount-ex-tax">{formatCurrency(amountEx)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Amount inc tax</p>
                          <p className="font-semibold text-primary" data-testid="text-amount-inc-tax">{formatCurrency(amountInc)}</p>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleSavePcItem}
                      disabled={(!pcUnitCostExTax && selectedLineItems.size === 0) || isSavingPc}
                      data-testid="button-save-pc-item"
                    >
                      {isSavingPc ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-border">
                <Dialog open={isBillModalOpen} onOpenChange={setIsBillModalOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-select-from-bills">
                      <Plus className="h-4 w-4 mr-2" /> Select from Bills
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                      <DialogTitle>Select Bill Line Items</DialogTitle>
                      <DialogDescription>Choose bill line items to allocate to this allowance</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-auto">
                      {bills.length === 0 ? (
                        <EmptyState variant="inline" title="No bills found for this project" className="py-8" />
                      ) : (
                        <div className="space-y-2">
                          {bills.map((bill) => {
                            const lineItems = billLineItems.filter((li) => li.billId === bill.id);
                            const isExpanded = expandedBills.has(bill.id);
                            return (
                              <Card key={bill.id}>
                                <CardHeader className="cursor-pointer py-3" onClick={() => toggleBillExpanded(bill.id)}>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                      <div>
                                        <p className="font-semibold text-sm">{bill.billNumber}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {new Date(bill.billDate).toLocaleDateString("en-AU")}
                                          {bill.billReference && ` · ${bill.billReference}`}
                                        </p>
                                      </div>
                                    </div>
                                    <p className="font-semibold text-sm">{formatCurrency(bill.total)}</p>
                                  </div>
                                </CardHeader>
                                {isExpanded && lineItems.length > 0 && (
                                  <CardContent className="pt-0">
                                    <div className="space-y-1">
                                      {lineItems.map((li) => (
                                        <div key={li.id} className="flex items-center justify-between p-2 rounded border">
                                          <div className="flex items-center gap-2 flex-1">
                                            <Checkbox
                                              checked={selectedLineItems.has(li.id)}
                                              onCheckedChange={() => toggleLineItemSelection(li.id)}
                                              data-testid={`checkbox-line-item-${li.id}`}
                                            />
                                            <div>
                                              <p className="text-sm font-medium">{li.description}</p>
                                              <p className="text-xs text-muted-foreground">{li.quantity} × {formatCurrency(li.unitPrice)}</p>
                                            </div>
                                          </div>
                                          <p className="text-sm font-semibold">{formatCurrency(li.total)}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </CardContent>
                                )}
                              </Card>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end gap-2 pt-4 border-t">
                      <Button variant="outline" onClick={() => setIsBillModalOpen(false)}>Cancel</Button>
                      <Button onClick={() => setIsBillModalOpen(false)} data-testid="button-save-selections">Add Selected</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── MODALS ─────────────────────────────────────────────────────────── */}

      {/* PS Bills modal */}
      <Dialog open={isPsBillModalOpen} onOpenChange={setIsPsBillModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Bill Line Items</DialogTitle>
            <DialogDescription>Select bill line items to add to this PS allowance</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {bills.length === 0 ? (
              <EmptyState variant="inline" title="No bills found for this project" className="py-8" />
            ) : (
              <div className="space-y-2">
                {bills.map((bill) => {
                  const lineItems = billLineItems.filter((li) => li.billId === bill.id);
                  const isExpanded = expandedPsBills.has(bill.id);
                  return (
                    <Card key={bill.id}>
                      <CardHeader className="cursor-pointer py-3" onClick={() => togglePsBillExpanded(bill.id)}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <div>
                              <p className="font-semibold text-sm">{bill.billNumber}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(bill.billDate).toLocaleDateString("en-AU")}
                                {bill.billReference && ` · ${bill.billReference}`}
                              </p>
                            </div>
                          </div>
                          <p className="font-semibold text-sm">{formatCurrency(bill.total)}</p>
                        </div>
                      </CardHeader>
                      {isExpanded && lineItems.length > 0 && (
                        <CardContent className="pt-0">
                          <div className="space-y-1">
                            {lineItems.map((li) => (
                              <div key={li.id} className="flex items-center justify-between p-2 rounded border">
                                <div className="flex items-center gap-2 flex-1">
                                  <Checkbox
                                    checked={selectedPsLineItems.has(li.id)}
                                    onCheckedChange={() => togglePsLineItemSelection(li.id)}
                                    data-testid={`checkbox-ps-line-item-${li.id}`}
                                  />
                                  <div>
                                    <p className="text-sm font-medium">{li.description}</p>
                                    <p className="text-xs text-muted-foreground">{li.quantity} × {formatCurrency(li.unitPrice)}</p>
                                  </div>
                                </div>
                                <p className="text-sm font-semibold">{formatCurrency(li.total)}</p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsPsBillModalOpen(false)}>Cancel</Button>
            <Button onClick={() => setIsPsBillModalOpen(false)} data-testid="button-save-ps-bills">Add Selected</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Timesheets modal */}
      <Dialog open={isTimesheetModalOpen} onOpenChange={setIsTimesheetModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Timesheets</DialogTitle>
            <DialogDescription>
              All timesheets shown — only approved entries can be selected.
            </DialogDescription>
          </DialogHeader>

          {/* Display mode toggle */}
          <div className="flex items-center gap-1 px-1 py-1 bg-muted rounded-lg self-start">
            <button
              type="button"
              onClick={() => setTimesheetDisplayMode("date")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${timesheetDisplayMode === "date" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              <CalendarDays className="h-3 w-3" /> By Date
            </button>
            <button
              type="button"
              onClick={() => setTimesheetDisplayMode("person")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${timesheetDisplayMode === "person" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              <Users className="h-3 w-3" /> By Person
            </button>
            <button
              type="button"
              onClick={() => setTimesheetDisplayMode("description")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${timesheetDisplayMode === "description" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              <LayoutList className="h-3 w-3" /> By Description
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            {timesheets.length === 0 ? (
              <EmptyState variant="inline" title="No timesheets found for this project" className="py-8" />
            ) : (() => {
              const sortedTimesheets = [...timesheets].sort((a, b) => {
                if (timesheetDisplayMode === "date") return new Date(b.date).getTime() - new Date(a.date).getTime();
                if (timesheetDisplayMode === "person") {
                  const nameA = getUserName(a.userId);
                  const nameB = getUserName(b.userId);
                  return nameA.localeCompare(nameB) || new Date(b.date).getTime() - new Date(a.date).getTime();
                }
                return (a.description || "").localeCompare(b.description || "") || new Date(b.date).getTime() - new Date(a.date).getTime();
              });

              const groups: { key: string; label: string; entries: Timesheet[] }[] = [];
              if (timesheetDisplayMode === "person") {
                const seen = new Map<string, Timesheet[]>();
                for (const ts of sortedTimesheets) {
                  const name = getUserName(ts.userId);
                  if (!seen.has(name)) seen.set(name, []);
                  seen.get(name)!.push(ts);
                }
                seen.forEach((entries, name) => groups.push({ key: name, label: name, entries }));
              } else if (timesheetDisplayMode === "description") {
                const seen = new Map<string, Timesheet[]>();
                for (const ts of sortedTimesheets) {
                  const key = ts.description?.trim() || "(no description)";
                  if (!seen.has(key)) seen.set(key, []);
                  seen.get(key)!.push(ts);
                }
                seen.forEach((entries, key) => groups.push({ key, label: key, entries }));
              } else {
                groups.push({ key: "all", label: "", entries: sortedTimesheets });
              }

              const statusColors: Record<string, { bg: string; text: string }> = {
                approved: { bg: "hsl(var(--sage-light))", text: "hsl(var(--sage))" },
                pending: { bg: "hsl(var(--amber-light))", text: "hsl(var(--amber))" },
                rejected: { bg: "hsl(var(--coral-light))", text: "hsl(var(--coral))" },
                submitted: { bg: "hsl(var(--primary) / 0.1)", text: "hsl(var(--primary))" },
              };

              return (
                <div className="space-y-4">
                  {groups.map((group) => (
                    <div key={group.key}>
                      {group.label && (
                        <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 pb-1 pt-1">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">{group.label}</p>
                        </div>
                      )}
                      <div className="space-y-1">
                        {group.entries.map((ts) => {
                          const isApproved = ts.status === "approved";
                          const staffName = getUserName(ts.userId);
                          const statusColor = statusColors[ts.status] ?? { bg: "hsl(var(--muted))", text: "hsl(var(--muted-foreground))" };
                          const dateStr = new Date(ts.date).toLocaleDateString("en-AU", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
                          const timeStr = ts.startTime && ts.endTime ? `${ts.startTime}–${ts.endTime} · ${ts.duration}h` : ts.duration ? `${ts.duration}h` : "";
                          const groupedByPerson = timesheetDisplayMode === "person";
                          return (
                            <div
                              key={ts.id}
                              className={`flex items-center justify-between p-3 rounded-md border gap-3 ${!isApproved ? "opacity-60" : ""}`}
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <Checkbox
                                  checked={selectedTimesheets.has(ts.id)}
                                  onCheckedChange={() => isApproved && toggleTimesheetSelection(ts.id)}
                                  disabled={!isApproved}
                                  data-testid={`checkbox-timesheet-${ts.id}`}
                                />
                                {!groupedByPerson && (
                                  <div
                                    className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                                    style={{ background: avatarColor(users.findIndex((u) => u.id === ts.userId)).bg, color: avatarColor(users.findIndex((u) => u.id === ts.userId)).text }}
                                  >
                                    {initials(staffName)}
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  {groupedByPerson ? (
                                    <>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-medium">{dateStr}</p>
                                        {timeStr && <p className="text-xs text-muted-foreground">{timeStr}</p>}
                                      </div>
                                      {ts.description && (
                                        <p className="text-xs text-muted-foreground truncate mt-0.5">{ts.description}</p>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-medium">{staffName}</p>
                                        <p className="text-xs text-muted-foreground">{dateStr}</p>
                                        {timeStr && <p className="text-xs text-muted-foreground">{timeStr}</p>}
                                      </div>
                                      {ts.description && (
                                        <p className="text-xs text-muted-foreground truncate mt-0.5">{ts.description}</p>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize"
                                  style={{ background: statusColor.bg, color: statusColor.text }}
                                >
                                  {ts.status}
                                </span>
                                <p className="text-sm font-semibold w-20 text-right">{formatCurrency(Math.round(ts.total * 100))}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              {selectedTimesheets.size > 0 ? `${selectedTimesheets.size} selected · ${formatCurrency(timesheets.filter((ts) => selectedTimesheets.has(ts.id)).reduce((s, ts) => s + Math.round(ts.total * 100), 0))} inc GST` : "No entries selected"}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsTimesheetModalOpen(false)}>Cancel</Button>
              <Button onClick={() => setIsTimesheetModalOpen(false)} disabled={selectedTimesheets.size === 0} data-testid="button-save-timesheets">
                Add {selectedTimesheets.size > 0 ? `(${selectedTimesheets.size})` : ""} Selected
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom Line dialog */}
      <Dialog open={isCustomLineDialogOpen} onOpenChange={setIsCustomLineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Line</DialogTitle>
            <DialogDescription>Add a custom line item to this allowance</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs">Description</Label>
              <Input
                id="description"
                value={customLineDescription}
                onChange={(e) => setCustomLineDescription(e.target.value)}
                placeholder="Enter description"
                data-testid="input-custom-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="quantity" className="text-xs">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={customLineQuantity}
                  onChange={(e) => setCustomLineQuantity(e.target.value)}
                  placeholder="1"
                  data-testid="input-custom-quantity"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unitPrice" className="text-xs">Unit Price</Label>
                <Input
                  id="unitPrice"
                  type="number"
                  step="0.01"
                  value={customLineUnitPrice}
                  onChange={(e) => setCustomLineUnitPrice(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-custom-unit-price"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsCustomLineDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleAddCustomLine}
              disabled={!customLineDescription || !customLineUnitPrice}
              data-testid="button-save-custom-line"
            >
              Add Line
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
