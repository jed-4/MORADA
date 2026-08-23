import { useQuery } from "@tanstack/react-query";
import { useProject } from "@/contexts/ProjectContext";
import type { Estimate, Bill, Variation, ClientInvoice } from "@shared/schema";
import { computeContractMetrics, frozenContractTotalFrom, isPendingVariationStatus, type ContractMetrics } from "@shared/projectMetrics";
import { timesheetTotalExGstCents, exGstFromInc } from "@shared/money";

export interface ProjectMetric {
  id: string;
  name: string;
  description: string;
  value: number;
  formattedValue: string;
  category: "financial" | "progress" | "billing" | "costs";
  trend?: "up" | "down" | "neutral";
  trendValue?: number;
  percentage?: number;
}

export interface ProjectMetricsData extends ContractMetrics {
  // Contract & Revenue (legacy aliases — prefer the *ExGst / *IncGst variants)
  contractPrice: number;
  approvedChangeOrders: number;
  revisedContractPrice: number;
  
  // Costs
  contractCosts: number;
  totalProjectCosts: number;
  actualCosts: number;
  costToComplete: number;
  
  // Profit & Margins
  grossProfit: number;
  grossMargin: number;
  actualGrossProfit: number;
  actualGrossMargin: number;
  
  // Progress
  completionPercentage: number;
  earnedRevenue: number;
  
  // Billing
  invoicedAmount: number;
  invoicedPercentage: number;
  paidInvoices: number;
  paidInvoicesPercentage: number;
  remainingBalance: number;
  remainingToInvoice: number;
  remainingToInvoicePercentage: number;
  
  // WIP
  wip: number;
  wipAA: number;
  
  // Bills Summary (counts + inc-GST dollar amounts)
  totalBills: number;
  paidBills: number;
  pendingBills: number;
  approvedBills: number;
  overdueBills: number;
  totalBillsAmount: number;
  paidBillsIncGst: number;
  pendingBillsAmount: number;
  approvedBillsAmount: number;
  overdueBillsAmount: number;
  
  // Variations Summary
  totalVariations: number;
  approvedVariations: number;
  pendingVariations: number;
  approvedVariationValue: number;
  pendingVariationValue: number;
  totalVariationValue: number;
  activeVariations: number;
  rejectedVariations: number;
  actionRequiredVariations: number;
  invoicedVariationValue: number;
  
  // Invoices Summary
  totalInvoices: number;
  paidInvoicesCount: number;
  unpaidInvoices: number;
  overdueInvoices: number;
  // Per-status dollar amounts (Invoices Summary widget)
  draftAmount: number;
  sentAmount: number;
  partialAmount: number;
  draftInvoicesCount: number;
  sentInvoicesCount: number;
  partialInvoicesCount: number;
  nonCancelledInvoicesCount: number;
  overdueAmount: number;
  oldestOverdueDays: number;
  
  // Area Metrics (if project has area)
  pricePerArea?: number;
  costPerArea?: number;
}

interface EstimateItem {
  id: string;
  unitCostExTax: number | null;
  quantity: number | null;
  markupPercent: number | null;
  taxAmount: number | null;
  priceIncTax: number | null;
}

interface BillLineItem {
  id: string;
  quantity: number | null;
  unitCost: number | null;
  totalExTax: number | null;
  taxAmount: number | null;
  totalIncTax: number | null;
}

// variation_items.unitCostExTax is DOLLARS ex GST (doublePrecision), like estimate_items
interface VariationItemRow {
  id: string;
  variationId: string;
  quantity: number | null;
  unitCostExTax: number | null;
}

interface TimesheetRow {
  id: string;
  total: string | number | null;
}

export function useProjectMetrics() {
  const { currentProject } = useProject();
  const projectId = currentProject?.id;

  // Fetch all required data
  const { data: estimates = [], isLoading: estimatesLoading, isError: estimatesError } = useQuery<Estimate[]>({
    queryKey: ["/api/estimates", { projectId }],
    queryFn: async () => {
      if (!projectId) return [];
      const response = await fetch(`/api/estimates?projectId=${projectId}`, { credentials: "include" });
      if (!response.ok) throw new Error(`Failed to load estimates (${response.status})`);
      return response.json();
    },
    enabled: !!projectId,
  });

  // Prefer the selected estimate's items so widget metrics match the
  // contract-metrics endpoint used by the Budget page. Fall back to all
  // project estimate items only when no selected estimate is set.
  const selectedEstimateIdForItems =
    (currentProject as any)?.selectedEstimateId || null;
  const { data: estimateItems = [], isLoading: itemsLoading, isError: itemsError } = useQuery<EstimateItem[]>({
    queryKey: [
      "/api/estimates",
      "items",
      { projectId, selectedEstimateId: selectedEstimateIdForItems },
    ],
    queryFn: async () => {
      if (!projectId) return [];
      const url = selectedEstimateIdForItems
        ? `/api/estimates/${selectedEstimateIdForItems}/items`
        : `/api/projects/${projectId}/estimate-items`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error(`Failed to load estimate items (${response.status})`);
      return response.json();
    },
    enabled: !!projectId,
  });

  const { data: bills = [], isLoading: billsLoading, isError: billsError } = useQuery<Bill[]>({
    queryKey: ["/api/bills", { projectId }],
    queryFn: async () => {
      if (!projectId) return [];
      const response = await fetch(`/api/bills?projectId=${projectId}`, { credentials: "include" });
      if (!response.ok) throw new Error(`Failed to load bills (${response.status})`);
      return response.json();
    },
    enabled: !!projectId,
  });

  const { data: variations = [], isLoading: variationsLoading, isError: variationsError } = useQuery<Variation[]>({
    queryKey: ["/api/variations", { projectId }],
    queryFn: async () => {
      if (!projectId) return [];
      const response = await fetch(`/api/variations?projectId=${projectId}`, { credentials: "include" });
      if (!response.ok) throw new Error(`Failed to load variations (${response.status})`);
      return response.json();
    },
    enabled: !!projectId,
  });

  const { data: clientInvoices = [], isLoading: invoicesLoading, isError: invoicesError } = useQuery<ClientInvoice[]>({
    queryKey: ["/api/client-invoices", { projectId }],
    queryFn: async () => {
      if (!projectId) return [];
      const response = await fetch(`/api/client-invoices?projectId=${projectId}`, { credentials: "include" });
      if (!response.ok) throw new Error(`Failed to load invoices (${response.status})`);
      return response.json();
    },
    enabled: !!projectId,
  });

  const { data: invoiceVariations = [], isLoading: invoiceVariationsLoading, isError: invoiceVariationsError } = useQuery<
    Array<{ variationId: string; invoiceId: string; invoiceNumber: string | null; claimPercent: number }>
  >({
    queryKey: ["/api/invoice-variations/by-project", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const response = await fetch(`/api/invoice-variations/by-project?projectId=${projectId}`, { credentials: "include" });
      if (!response.ok) throw new Error(`Failed to load invoice variations (${response.status})`);
      return response.json();
    },
    enabled: !!projectId,
  });

  // Variation items feed change-order costs (builder cost ex GST, no markup)
  const { data: variationItems = [], isLoading: variationItemsLoading, isError: variationItemsError } = useQuery<VariationItemRow[]>({
    queryKey: ["/api/variation-items", { projectId }],
    queryFn: async () => {
      if (!projectId) return [];
      const response = await fetch(`/api/variation-items?projectId=${projectId}`, { credentials: "include" });
      if (!response.ok) throw new Error(`Failed to load variation items (${response.status})`);
      return response.json();
    },
    enabled: !!projectId,
  });

  // Approved timesheet labour is a real cost (dollars EX GST — wages carry no GST)
  const { data: approvedTimesheets = [], isLoading: timesheetsLoading, isError: timesheetsError } = useQuery<TimesheetRow[]>({
    queryKey: ["/api/timesheets", { projectId, status: "approved" }],
    queryFn: async () => {
      if (!projectId) return [];
      const response = await fetch(`/api/timesheets?projectId=${projectId}&status=approved`, { credentials: "include" });
      if (!response.ok) throw new Error(`Failed to load timesheets (${response.status})`);
      return response.json();
    },
    enabled: !!projectId,
  });

  const isLoading = estimatesLoading || itemsLoading || billsLoading || variationsLoading || invoicesLoading || invoiceVariationsLoading || variationItemsLoading || timesheetsLoading;
  const isError = estimatesError || itemsError || billsError || variationsError || invoicesError || invoiceVariationsError || variationItemsError || timesheetsError;

  // Calculate metrics
  const calculateMetrics = (): ProjectMetricsData => {
    // Default values
    const defaults: ProjectMetricsData = {
      originalContractPriceExGst: 0,
      originalContractPriceIncGst: 0,
      approvedVariationsExGst: 0,
      approvedVariationsIncGst: 0,
      revisedContractPriceExGst: 0,
      revisedContractPriceIncGst: 0,
      originalContractPriceExGstCents: 0,
      originalContractPriceIncGstCents: 0,
      approvedVariationsExGstCents: 0,
      approvedVariationsIncGstCents: 0,
      revisedContractPriceExGstCents: 0,
      revisedContractPriceIncGstCents: 0,
      contractPrice: 0,
      approvedChangeOrders: 0,
      revisedContractPrice: 0,
      contractCosts: 0,
      totalProjectCosts: 0,
      actualCosts: 0,
      costToComplete: 0,
      grossProfit: 0,
      grossMargin: 0,
      actualGrossProfit: 0,
      actualGrossMargin: 0,
      completionPercentage: 0,
      earnedRevenue: 0,
      invoicedAmount: 0,
      invoicedPercentage: 0,
      paidInvoices: 0,
      paidInvoicesPercentage: 0,
      remainingBalance: 0,
      remainingToInvoice: 0,
      remainingToInvoicePercentage: 0,
      wip: 0,
      wipAA: 0,
      totalBills: 0,
      paidBills: 0,
      pendingBills: 0,
      approvedBills: 0,
      overdueBills: 0,
      totalBillsAmount: 0,
      paidBillsIncGst: 0,
      pendingBillsAmount: 0,
      approvedBillsAmount: 0,
      overdueBillsAmount: 0,
      totalVariations: 0,
      approvedVariations: 0,
      pendingVariations: 0,
      approvedVariationValue: 0,
      pendingVariationValue: 0,
      totalVariationValue: 0,
      activeVariations: 0,
      rejectedVariations: 0,
      actionRequiredVariations: 0,
      invoicedVariationValue: 0,
      totalInvoices: 0,
      paidInvoicesCount: 0,
      unpaidInvoices: 0,
      overdueInvoices: 0,
      draftAmount: 0,
      sentAmount: 0,
      partialAmount: 0,
      draftInvoicesCount: 0,
      sentInvoicesCount: 0,
      partialInvoicesCount: 0,
      nonCancelledInvoicesCount: 0,
      overdueAmount: 0,
      oldestOverdueDays: 0,
    };

    if (!projectId) return defaults;

    // Centralised contract derivation (ex-GST + inc-GST variants).
    // priceIncTax / taxAmount on estimate items are line totals in DOLLARS (2dp);
    // variations.subtotal is ex-GST cents and variations.totalAmount is inc-GST cents.
    // computeContractMetricsCents converts the dollar amounts and applies the
    // selected estimate's project_markup_percent on top.
    const selectedEstimateId = (currentProject as any)?.selectedEstimateId;
    const selectedEstimate = selectedEstimateId
      ? (estimates as any[]).find((e) => e.id === selectedEstimateId)
      : null;
    const projectMarkupPercent =
      (selectedEstimate as any)?.projectMarkupPercent ?? 0;
    const taxRate = (selectedEstimate as any)?.taxRate ?? 10;
    const contractMetrics = computeContractMetrics(
      estimateItems.map((i) => ({
        priceIncTax: i.priceIncTax,
        taxAmount: i.taxAmount,
        unitCostExTax: (i as any).unitCostExTax,
        quantity: (i as any).quantity,
        markupPercent: (i as any).markupPercent,
      })),
      variations.map((v) => {
        const row = v as Variation & {
          subtotal?: number | null;
          totalAmount?: number | null;
          totalIncTax?: number | null;
          status?: string | null;
        };
        return {
          status: row.status ?? null,
          subtotal: row.subtotal ?? null,
          // Match server contract-metrics fallback so legacy rows that only
          // populated totalIncTax still contribute to the inc-GST total.
          totalAmount: row.totalAmount ?? row.totalIncTax ?? null,
        };
      }),
      projectMarkupPercent,
      taxRate,
      // Contracted job: the frozen sum replaces the estimate recomputation
      // above as the original contract, matching /api/projects/:id/contract-
      // metrics exactly. The columns ride along on the project row.
      frozenContractTotalFrom(currentProject as any),
    );

    // Contract Price (legacy alias — inc-GST dollars)
    const contractPrice = contractMetrics.originalContractPriceIncGst;

    // Contract Costs: Estimate values without markup.
    // estimate_items.unitCostExTax is already DOLLARS (doublePrecision), not cents.
    const contractCosts = estimateItems.reduce((sum, item) => {
      const unitCost = item.unitCostExTax || 0;
      const qty = item.quantity || 1;
      return sum + (unitCost * qty);
    }, 0);

    // Variation status buckets (for counts + pending value)
    const approvedVariationsList = variations.filter(v => v.status === 'approved' || v.status === 'released');
    const pendingVariationsList = variations.filter(v => isPendingVariationStatus(v.status));
    const rejectedVariationsList = variations.filter(v => v.status === 'rejected');
    const actionVariationsList = variations.filter(v => v.status === 'action');
    // "Active" = everything that still counts toward the contract (i.e. not rejected).
    const activeVariationsList = variations.filter(v => v.status !== 'rejected');

    const approvedChangeOrders = contractMetrics.approvedVariationsIncGst;

    // Inc-GST value in cents, preferring totalAmount (inc-GST) and falling back
    // to totalIncTax so legacy rows that only populate one field still count.
    const variationIncGstCents = (v: any) => (v?.totalAmount ?? v?.totalIncTax) || 0;

    // Was summing v.totalIncTax alone — a field variations don't have — so the
    // "pending approval" value rendered $0 no matter what was outstanding.
    const pendingVariationValue = pendingVariationsList.reduce((sum, v) => {
      return sum + variationIncGstCents(v);
    }, 0) / 100;

    // Combined value of all non-rejected variations (inc GST).
    const totalVariationValue = activeVariationsList.reduce((sum, v) => {
      return sum + variationIncGstCents(v);
    }, 0) / 100;

    // How much approved variation value has been raised on a client invoice.
    // Each invoice_variations row claims a percentage of a variation's value.
    const variationValueById = new Map<string, number>();
    for (const v of variations) {
      variationValueById.set(v.id, variationIncGstCents(v));
    }
    const invoicedVariationValue = invoiceVariations.reduce((sum, row) => {
      const value = variationValueById.get(row.variationId) || 0;
      const pct = typeof row.claimPercent === 'number' ? row.claimPercent : 100;
      return sum + (value * pct) / 100;
    }, 0) / 100;

    // Revised Contract Price (legacy alias — inc-GST dollars)
    const revisedContractPrice = contractMetrics.revisedContractPriceIncGst;

    // Change-order costs: builder cost (no markup) of approved variations,
    // ex GST dollars — variation_items.unitCostExTax is dollars like estimate_items.
    const approvedVariationIds = new Set(approvedVariationsList.map(v => v.id));
    const changeOrderCosts = variationItems.reduce((sum, item) => {
      if (!approvedVariationIds.has(item.variationId)) return sum;
      const unitCost = item.unitCostExTax || 0;
      const qty = item.quantity || 1;
      return sum + (unitCost * qty);
    }, 0);

    // Total Project Costs — ex GST (contract + approved change-order costs)
    const totalProjectCosts = contractCosts + changeOrderCosts;

    // Bills calculations
    const now = new Date();
    const paidBillsList = bills.filter(b => b.status === 'paid');
    const pendingBillsList = bills.filter(b => b.status === 'pending' || b.status === 'draft' || b.status === 'needs_review');
    const approvedBillsList = bills.filter(b => b.status === 'approved');
    const overdueBillsList = bills.filter(b => {
      if (b.status === 'paid') return false;
      if (!b.dueDate) return false;
      return new Date(b.dueDate) < now;
    });

    // Bills widget amounts — inc GST (what the supplier invoices actually say)
    const billIncGst = (b: Bill) => (b.total || 0);
    const totalBillsAmount = bills.reduce((sum, b) => sum + billIncGst(b), 0) / 100;
    const paidBillsIncGst = paidBillsList.reduce((sum, b) => sum + billIncGst(b), 0) / 100;
    const pendingBillsAmount = pendingBillsList.reduce((sum, b) => sum + billIncGst(b), 0) / 100;
    const approvedBillsAmount = approvedBillsList.reduce((sum, b) => sum + billIncGst(b), 0) / 100;
    const overdueBillsAmount = overdueBillsList.reduce((sum, b) => sum + billIncGst(b), 0) / 100;

    // Actual Costs — ex GST so they compare like-for-like with estimate costs:
    // paid bills at their ex-GST subtotal + approved timesheet labour (wages
    // carry no GST, so timesheet totals are already ex GST).
    const paidBillsExGst = paidBillsList.reduce((sum, b) => sum + (b.subtotal || 0), 0) / 100;
    const approvedLabourExGst = approvedTimesheets.reduce(
      (sum, ts) => sum + timesheetTotalExGstCents(ts), 0) / 100;
    const actualCosts = paidBillsExGst + approvedLabourExGst;

    // Cost to Complete
    const costToComplete = Math.max(0, totalProjectCosts - actualCosts);

    // Gross Profit & Margin — ex GST both sides (GST is pass-through, so
    // builder P&L compares ex-GST revenue against ex-GST costs).
    const revisedContractPriceExGst = contractMetrics.revisedContractPriceExGst;
    const grossProfit = revisedContractPriceExGst - totalProjectCosts;
    const grossMargin = revisedContractPriceExGst > 0 ? (grossProfit / revisedContractPriceExGst) * 100 : 0;

    // Client Invoices calculations
    // Invoice rows come from /api/client-invoices (raw ClientInvoice rows), so
    // money lives in totalAmount / paidAmount / balanceAmount (all in cents).
    const invTotalCents = (inv: ClientInvoice) => inv.totalAmount || 0;
    const invBalanceCents = (inv: ClientInvoice) =>
      inv.balanceAmount || ((inv.totalAmount || 0) - (inv.paidAmount || 0));

    const nonCancelledInvoices = clientInvoices.filter(inv => inv.status !== 'cancelled');
    const paidInvoicesList = nonCancelledInvoices.filter(inv => inv.status === 'paid');
    const partialInvoicesList = nonCancelledInvoices.filter(inv => inv.status === 'partial');
    const draftInvoicesList = nonCancelledInvoices.filter(inv => inv.status === 'draft');
    // "Outstanding" = sent (incl. explicitly-overdue) but not yet part/fully paid.
    const sentInvoicesList = nonCancelledInvoices.filter(inv => inv.status === 'sent' || inv.status === 'overdue');
    const unpaidInvoicesList = nonCancelledInvoices.filter(inv => inv.status !== 'paid');
    // Overdue = an issued (non-draft, non-paid) invoice past its due date.
    // Drafts are never "overdue" since they haven't been sent to the client.
    const overdueInvoicesList = nonCancelledInvoices.filter(inv => {
      if (inv.status === 'paid' || inv.status === 'draft') return false;
      if (!inv.dueDate) return false;
      return new Date(inv.dueDate) < now;
    });

    const invoicedAmount = nonCancelledInvoices.reduce((sum, inv) => sum + invTotalCents(inv), 0) / 100;
    const paidInvoicesAmount = paidInvoicesList.reduce((sum, inv) => sum + invTotalCents(inv), 0) / 100;
    const partialAmount = partialInvoicesList.reduce((sum, inv) => sum + invTotalCents(inv), 0) / 100;
    const draftAmount = draftInvoicesList.reduce((sum, inv) => sum + invTotalCents(inv), 0) / 100;
    const sentAmount = sentInvoicesList.reduce((sum, inv) => sum + invTotalCents(inv), 0) / 100;
    const overdueAmount = overdueInvoicesList.reduce((sum, inv) => sum + invBalanceCents(inv), 0) / 100;

    let oldestOverdueDays = 0;
    for (const inv of overdueInvoicesList) {
      if (!inv.dueDate) continue;
      const days = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000);
      if (days > oldestOverdueDays) oldestOverdueDays = days;
    }

    const invoicedPercentage = revisedContractPrice > 0 ? (invoicedAmount / revisedContractPrice) * 100 : 0;
    const paidInvoicesPercentage = revisedContractPrice > 0 ? (paidInvoicesAmount / revisedContractPrice) * 100 : 0;

    // Remaining Balance
    const remainingBalance = revisedContractPrice - paidInvoicesAmount;
    const remainingToInvoice = revisedContractPrice - invoicedAmount;
    const remainingToInvoicePercentage = revisedContractPrice > 0 ? (remainingToInvoice / revisedContractPrice) * 100 : 0;

    // Completion Percentage (cost-based; spend and budget are both ex GST)
    const completionPercentage = totalProjectCosts > 0 ? (actualCosts / totalProjectCosts) * 100 : 0;

    // Earned Revenue
    const earnedRevenue = (completionPercentage / 100) * revisedContractPrice;

    // WIP (Work in Progress)
    const wip = earnedRevenue - invoicedAmount;

    // Actual Gross Profit & Margin — ex GST both sides. Prefer the stored
    // gstAmount; fall back to backing GST out of the inc-GST total for legacy
    // rows that never populated it.
    const invoicedAmountExGst = nonCancelledInvoices.reduce((sum, inv) => {
      const totalCents = invTotalCents(inv);
      const exCents = (inv.gstAmount || 0) > 0
        ? totalCents - (inv.gstAmount || 0)
        : exGstFromInc(totalCents);
      return sum + exCents;
    }, 0) / 100;
    const actualGrossProfit = invoicedAmountExGst - actualCosts;
    const actualGrossMargin = invoicedAmountExGst > 0 ? (actualGrossProfit / invoicedAmountExGst) * 100 : 0;

    // WIP AA (Actual vs Allocated)
    const wipAA = actualCosts - (totalProjectCosts * (invoicedPercentage / 100));

    // Area metrics
    let pricePerArea: number | undefined;
    let costPerArea: number | undefined;
    if (currentProject?.projectArea && currentProject.projectArea > 0) {
      pricePerArea = revisedContractPrice / currentProject.projectArea;
      costPerArea = totalProjectCosts / currentProject.projectArea;
    }

    return {
      ...contractMetrics,
      contractPrice,
      approvedChangeOrders,
      revisedContractPrice,
      contractCosts,
      totalProjectCosts,
      actualCosts,
      costToComplete,
      grossProfit,
      grossMargin,
      actualGrossProfit,
      actualGrossMargin,
      completionPercentage,
      earnedRevenue,
      invoicedAmount,
      invoicedPercentage,
      paidInvoices: paidInvoicesAmount,
      paidInvoicesPercentage,
      remainingBalance,
      remainingToInvoice,
      remainingToInvoicePercentage,
      wip,
      wipAA,
      totalBills: bills.length,
      paidBills: paidBillsList.length,
      pendingBills: pendingBillsList.length,
      approvedBills: approvedBillsList.length,
      overdueBills: overdueBillsList.length,
      totalBillsAmount,
      paidBillsIncGst,
      pendingBillsAmount,
      approvedBillsAmount,
      overdueBillsAmount,
      totalVariations: variations.length,
      approvedVariations: approvedVariationsList.length,
      pendingVariations: pendingVariationsList.length,
      approvedVariationValue: approvedChangeOrders,
      pendingVariationValue,
      totalVariationValue,
      activeVariations: activeVariationsList.length,
      rejectedVariations: rejectedVariationsList.length,
      actionRequiredVariations: actionVariationsList.length,
      invoicedVariationValue,
      totalInvoices: clientInvoices.length,
      paidInvoicesCount: paidInvoicesList.length,
      unpaidInvoices: unpaidInvoicesList.length,
      overdueInvoices: overdueInvoicesList.length,
      draftAmount,
      sentAmount,
      partialAmount,
      draftInvoicesCount: draftInvoicesList.length,
      sentInvoicesCount: sentInvoicesList.length,
      partialInvoicesCount: partialInvoicesList.length,
      nonCancelledInvoicesCount: nonCancelledInvoices.length,
      overdueAmount,
      oldestOverdueDays,
      pricePerArea,
      costPerArea,
    };
  };

  const metrics = calculateMetrics();

  // Format currency
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Format percentage
  const formatPercentage = (value: number): string => {
    return `${value.toFixed(1)}%`;
  };

  // Get all metrics as array for widget display
  const getMetricsList = (): ProjectMetric[] => {
    return [
      // Financial - Contract
      { id: "contractPrice", name: "Contract Price", description: "Original agreed project price", value: metrics.contractPrice, formattedValue: formatCurrency(metrics.contractPrice), category: "financial" },
      { id: "approvedChangeOrders", name: "Approved Variations", description: "Cost of approved scope changes", value: metrics.approvedChangeOrders, formattedValue: formatCurrency(metrics.approvedChangeOrders), category: "financial" },
      { id: "revisedContractPrice", name: "Revised Contract", description: "Current total project value", value: metrics.revisedContractPrice, formattedValue: formatCurrency(metrics.revisedContractPrice), category: "financial" },
      
      // Costs
      { id: "totalProjectCosts", name: "Total Project Costs", description: "Estimated costs for entire project", value: metrics.totalProjectCosts, formattedValue: formatCurrency(metrics.totalProjectCosts), category: "costs" },
      { id: "actualCosts", name: "Actual Costs", description: "Costs incurred to date", value: metrics.actualCosts, formattedValue: formatCurrency(metrics.actualCosts), category: "costs" },
      { id: "costToComplete", name: "Cost to Complete", description: "Estimated remaining costs", value: metrics.costToComplete, formattedValue: formatCurrency(metrics.costToComplete), category: "costs" },
      
      // Profit
      { id: "grossProfit", name: "Gross Profit", description: "Expected profit before expenses", value: metrics.grossProfit, formattedValue: formatCurrency(metrics.grossProfit), category: "financial", trend: metrics.grossProfit >= 0 ? "up" : "down" },
      { id: "grossMargin", name: "Gross Margin", description: "Profit as percentage of revenue", value: metrics.grossMargin, formattedValue: formatPercentage(metrics.grossMargin), category: "financial", percentage: metrics.grossMargin },
      { id: "actualGrossProfit", name: "Actual Gross Profit", description: "Realized profit to date", value: metrics.actualGrossProfit, formattedValue: formatCurrency(metrics.actualGrossProfit), category: "financial" },
      { id: "actualGrossMargin", name: "Actual Gross Margin", description: "Current margin on billed revenue", value: metrics.actualGrossMargin, formattedValue: formatPercentage(metrics.actualGrossMargin), category: "financial", percentage: metrics.actualGrossMargin },
      
      // Progress
      { id: "completionPercentage", name: "Completion", description: "Project progress based on costs", value: metrics.completionPercentage, formattedValue: formatPercentage(metrics.completionPercentage), category: "progress", percentage: metrics.completionPercentage },
      { id: "earnedRevenue", name: "Earned Revenue", description: "Revenue recognized based on progress", value: metrics.earnedRevenue, formattedValue: formatCurrency(metrics.earnedRevenue), category: "progress" },
      { id: "wip", name: "Work in Progress", description: "Earned revenue vs billed (under/over billing)", value: metrics.wip, formattedValue: formatCurrency(metrics.wip), category: "progress", trend: metrics.wip > 0 ? "up" : metrics.wip < 0 ? "down" : "neutral" },
      
      // Billing
      { id: "invoicedAmount", name: "Invoiced Amount", description: "Total client billing", value: metrics.invoicedAmount, formattedValue: formatCurrency(metrics.invoicedAmount), category: "billing" },
      { id: "invoicedPercentage", name: "Invoiced %", description: "Proportion of contract billed", value: metrics.invoicedPercentage, formattedValue: formatPercentage(metrics.invoicedPercentage), category: "billing", percentage: metrics.invoicedPercentage },
      { id: "paidInvoices", name: "Paid Invoices", description: "Revenue collected", value: metrics.paidInvoices, formattedValue: formatCurrency(metrics.paidInvoices), category: "billing" },
      { id: "paidInvoicesPercentage", name: "Paid %", description: "Share of project value collected", value: metrics.paidInvoicesPercentage, formattedValue: formatPercentage(metrics.paidInvoicesPercentage), category: "billing", percentage: metrics.paidInvoicesPercentage },
      { id: "remainingBalance", name: "Remaining Balance", description: "Unpaid part of contract", value: metrics.remainingBalance, formattedValue: formatCurrency(metrics.remainingBalance), category: "billing" },
      { id: "remainingToInvoice", name: "Remaining to Invoice", description: "Value yet to be billed", value: metrics.remainingToInvoice, formattedValue: formatCurrency(metrics.remainingToInvoice), category: "billing" },
    ];
  };

  return {
    metrics,
    metricsList: getMetricsList(),
    isLoading,
    isError,
    formatCurrency,
    formatPercentage,
  };
}

// Metric definitions for widget configuration
export const metricDefinitions = [
  // Contract & Revenue
  { id: "contractPrice", name: "Contract Price", category: "contract", type: "currency", group: "Contract & Revenue" },
  { id: "approvedChangeOrders", name: "Approved Variations", category: "contract", type: "currency", group: "Contract & Revenue" },
  { id: "revisedContractPrice", name: "Revised Contract", category: "contract", type: "currency", group: "Contract & Revenue" },
  { id: "earnedRevenue", name: "Earned Revenue", category: "contract", type: "currency", group: "Contract & Revenue" },
  
  // Costs & Budget
  { id: "totalProjectCosts", name: "Total Project Costs", category: "costs", type: "currency", group: "Costs & Budget" },
  { id: "actualCosts", name: "Actual Costs", category: "costs", type: "currency", group: "Costs & Budget" },
  { id: "costToComplete", name: "Cost to Complete", category: "costs", type: "currency", group: "Costs & Budget" },
  
  // Profit & Margins
  { id: "grossProfit", name: "Gross Profit", category: "margins", type: "currency", group: "Profit & Margins" },
  { id: "grossMargin", name: "Gross Margin", category: "margins", type: "percentage", group: "Profit & Margins" },
  { id: "actualGrossProfit", name: "Actual Gross Profit", category: "margins", type: "currency", group: "Profit & Margins" },
  { id: "actualGrossMargin", name: "Actual Gross Margin", category: "margins", type: "percentage", group: "Profit & Margins" },
  
  // Progress
  { id: "completionPercentage", name: "Completion %", category: "progress", type: "percentage", group: "Progress" },
  { id: "wip", name: "Work in Progress (WIP)", category: "progress", type: "currency", group: "Progress" },
  
  // Invoicing & Billing
  { id: "invoicedAmount", name: "Invoiced Amount", category: "billing", type: "currency", group: "Invoicing & Billing" },
  { id: "invoicedPercentage", name: "Invoiced %", category: "billing", type: "percentage", group: "Invoicing & Billing" },
  { id: "paidInvoices", name: "Paid Invoices", category: "billing", type: "currency", group: "Invoicing & Billing" },
  { id: "paidInvoicesPercentage", name: "Paid %", category: "billing", type: "percentage", group: "Invoicing & Billing" },
  { id: "remainingBalance", name: "Remaining Balance", category: "billing", type: "currency", group: "Invoicing & Billing" },
  { id: "remainingToInvoice", name: "Remaining to Invoice", category: "billing", type: "currency", group: "Invoicing & Billing" },
  { id: "remainingToInvoicePercentage", name: "Remaining to Invoice %", category: "billing", type: "percentage", group: "Invoicing & Billing" },

  // Counts - Bills
  { id: "totalBills", name: "Total Bills", category: "counts", type: "count", group: "Bills Summary" },
  { id: "paidBills", name: "Paid Bills", category: "counts", type: "count", group: "Bills Summary" },
  { id: "pendingBills", name: "Pending Bills", category: "counts", type: "count", group: "Bills Summary" },
  { id: "overdueBills", name: "Overdue Bills", category: "counts", type: "count", group: "Bills Summary" },
  
  // Counts - Variations
  { id: "totalVariations", name: "Total Variations", category: "counts", type: "count", group: "Variations Summary" },
  { id: "approvedVariations", name: "Approved Variations", category: "counts", type: "count", group: "Variations Summary" },
  { id: "pendingVariations", name: "Pending Variations", category: "counts", type: "count", group: "Variations Summary" },
  { id: "pendingVariationValue", name: "Pending Variation Value", category: "contract", type: "currency", group: "Variations Summary" },
  { id: "totalVariationValue", name: "Total Variation Value", category: "contract", type: "currency", group: "Variations Summary" },
  { id: "invoicedVariationValue", name: "Invoiced Variation Value", category: "contract", type: "currency", group: "Variations Summary" },

  // Counts - Invoices
  { id: "totalInvoices", name: "Total Invoices", category: "counts", type: "count", group: "Invoices Summary" },
  { id: "paidInvoicesCount", name: "Paid Invoices Count", category: "counts", type: "count", group: "Invoices Summary" },
  { id: "unpaidInvoices", name: "Unpaid Invoices", category: "counts", type: "count", group: "Invoices Summary" },
  { id: "overdueInvoices", name: "Overdue Invoices", category: "counts", type: "count", group: "Invoices Summary" },
  { id: "overdueAmount", name: "Overdue Amount", category: "billing", type: "currency", group: "Invoices Summary" },
  { id: "oldestOverdueDays", name: "Oldest Overdue (Days)", category: "counts", type: "count", group: "Invoices Summary" },
] as const;

export const metricGroups = [
  "Contract & Revenue",
  "Costs & Budget", 
  "Profit & Margins",
  "Progress",
  "Invoicing & Billing",
  "Bills Summary",
  "Variations Summary",
  "Invoices Summary",
] as const;

export type MetricId = typeof metricDefinitions[number]["id"];
