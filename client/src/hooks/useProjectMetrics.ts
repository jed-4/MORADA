import { useQuery } from "@tanstack/react-query";
import { useProject } from "@/contexts/ProjectContext";
import type { Estimate, Bill, Variation, ClientInvoice } from "@shared/schema";

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

export interface ProjectMetricsData {
  // Contract & Revenue
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
  
  // Bills Summary
  totalBills: number;
  paidBills: number;
  pendingBills: number;
  approvedBills: number;
  overdueBills: number;
  
  // Variations Summary
  totalVariations: number;
  approvedVariations: number;
  pendingVariations: number;
  approvedVariationValue: number;
  pendingVariationValue: number;
  
  // Invoices Summary
  totalInvoices: number;
  paidInvoicesCount: number;
  unpaidInvoices: number;
  overdueInvoices: number;
  
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

interface VariationItem {
  id: string;
  quantity: number | null;
  unitCost: number | null;
  markupPercent: number | null;
  totalExTax: number | null;
  taxAmount: number | null;
  totalIncTax: number | null;
}

interface BillLineItem {
  id: string;
  quantity: number | null;
  unitCost: number | null;
  totalExTax: number | null;
  taxAmount: number | null;
  totalIncTax: number | null;
}

export function useProjectMetrics() {
  const { currentProject } = useProject();
  const projectId = currentProject?.id;

  // Fetch all required data
  const { data: estimates = [], isLoading: estimatesLoading } = useQuery<Estimate[]>({
    queryKey: ["/api/projects", projectId, "estimates"],
    queryFn: async () => {
      if (!projectId) return [];
      const response = await fetch(`/api/estimates?projectId=${projectId}`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!projectId,
  });

  const { data: estimateItems = [], isLoading: itemsLoading } = useQuery<EstimateItem[]>({
    queryKey: ["/api/projects", projectId, "estimate-items"],
    queryFn: async () => {
      if (!projectId) return [];
      const response = await fetch(`/api/estimate-items?projectId=${projectId}`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!projectId,
  });

  const { data: bills = [], isLoading: billsLoading } = useQuery<Bill[]>({
    queryKey: ["/api/projects", projectId, "bills"],
    queryFn: async () => {
      if (!projectId) return [];
      const response = await fetch(`/api/bills?projectId=${projectId}`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!projectId,
  });

  const { data: variations = [], isLoading: variationsLoading } = useQuery<Variation[]>({
    queryKey: ["/api/projects", projectId, "variations"],
    queryFn: async () => {
      if (!projectId) return [];
      const response = await fetch(`/api/variations?projectId=${projectId}`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!projectId,
  });

  const { data: variationItems = [], isLoading: variationItemsLoading } = useQuery<VariationItem[]>({
    queryKey: ["/api/projects", projectId, "variation-items"],
    queryFn: async () => {
      if (!projectId) return [];
      const response = await fetch(`/api/variation-items?projectId=${projectId}`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!projectId,
  });

  const { data: clientInvoices = [], isLoading: invoicesLoading } = useQuery<ClientInvoice[]>({
    queryKey: ["/api/projects", projectId, "client-invoices"],
    queryFn: async () => {
      if (!projectId) return [];
      const response = await fetch(`/api/client-invoices?projectId=${projectId}`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!projectId,
  });

  const isLoading = estimatesLoading || itemsLoading || billsLoading || variationsLoading || variationItemsLoading || invoicesLoading;

  // Calculate metrics
  const calculateMetrics = (): ProjectMetricsData => {
    // Default values
    const defaults: ProjectMetricsData = {
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
      totalVariations: 0,
      approvedVariations: 0,
      pendingVariations: 0,
      approvedVariationValue: 0,
      pendingVariationValue: 0,
      totalInvoices: 0,
      paidInvoicesCount: 0,
      unpaidInvoices: 0,
      overdueInvoices: 0,
    };

    if (!projectId) return defaults;

    // Contract Price: Sum of all estimate items (including taxes)
    const contractPrice = estimateItems.reduce((sum, item) => {
      const price = item.priceIncTax || 0;
      return sum + (typeof price === 'number' ? price : 0);
    }, 0) / 100; // Convert from cents

    // Contract Costs: Estimate values without markup
    const contractCosts = estimateItems.reduce((sum, item) => {
      const unitCost = item.unitCostExTax || 0;
      const qty = item.quantity || 1;
      return sum + (unitCost * qty);
    }, 0) / 100;

    // Approved Change Orders (Variations)
    const approvedVariationsList = variations.filter(v => v.status === 'approved' || v.status === 'released');
    const pendingVariationsList = variations.filter(v => v.status === 'pending' || v.status === 'draft');
    
    const approvedChangeOrders = approvedVariationsList.reduce((sum, v) => {
      return sum + (v.totalIncTax || 0);
    }, 0) / 100;

    const pendingVariationValue = pendingVariationsList.reduce((sum, v) => {
      return sum + (v.totalIncTax || 0);
    }, 0) / 100;

    // Change order costs (without markup)
    const changeOrderCosts = variationItems.reduce((sum, item) => {
      const unitCost = item.unitCost || 0;
      const qty = item.quantity || 1;
      return sum + (unitCost * qty);
    }, 0) / 100;

    // Revised Contract Price
    const revisedContractPrice = contractPrice + approvedChangeOrders;

    // Total Project Costs
    const totalProjectCosts = contractCosts + changeOrderCosts;

    // Bills calculations
    const now = new Date();
    const paidBillsList = bills.filter(b => b.status === 'paid');
    const pendingBillsList = bills.filter(b => b.status === 'pending' || b.status === 'draft');
    const approvedBillsList = bills.filter(b => b.status === 'approved');
    const overdueBillsList = bills.filter(b => {
      if (b.status === 'paid') return false;
      if (!b.dueDate) return false;
      return new Date(b.dueDate) < now;
    });

    const paidBillsAmount = paidBillsList.reduce((sum, b) => sum + (b.totalIncTax || 0), 0) / 100;

    // Actual Costs: Paid Bills + Approved Time Logs (simplified - just bills for now)
    const actualCosts = paidBillsAmount;

    // Cost to Complete
    const costToComplete = Math.max(0, totalProjectCosts - actualCosts);

    // Gross Profit & Margin
    const grossProfit = revisedContractPrice - totalProjectCosts;
    const grossMargin = revisedContractPrice > 0 ? (grossProfit / revisedContractPrice) * 100 : 0;

    // Client Invoices calculations
    const paidInvoicesList = clientInvoices.filter(inv => inv.status === 'paid');
    const unpaidInvoicesList = clientInvoices.filter(inv => inv.status !== 'paid' && inv.status !== 'cancelled');
    const overdueInvoicesList = clientInvoices.filter(inv => {
      if (inv.status === 'paid' || inv.status === 'cancelled') return false;
      if (!inv.dueDate) return false;
      return new Date(inv.dueDate) < now;
    });

    const invoicedAmount = clientInvoices
      .filter(inv => inv.status !== 'cancelled')
      .reduce((sum, inv) => sum + (inv.totalIncTax || 0), 0) / 100;

    const paidInvoicesAmount = paidInvoicesList.reduce((sum, inv) => sum + (inv.totalIncTax || 0), 0) / 100;

    const invoicedPercentage = revisedContractPrice > 0 ? (invoicedAmount / revisedContractPrice) * 100 : 0;
    const paidInvoicesPercentage = revisedContractPrice > 0 ? (paidInvoicesAmount / revisedContractPrice) * 100 : 0;

    // Remaining Balance
    const remainingBalance = revisedContractPrice - paidInvoicesAmount;
    const remainingToInvoice = revisedContractPrice - invoicedAmount;
    const remainingToInvoicePercentage = revisedContractPrice > 0 ? (remainingToInvoice / revisedContractPrice) * 100 : 0;

    // Completion Percentage (cost-based)
    const completionPercentage = totalProjectCosts > 0 ? (actualCosts / totalProjectCosts) * 100 : 0;

    // Earned Revenue
    const earnedRevenue = (completionPercentage / 100) * revisedContractPrice;

    // WIP (Work in Progress)
    const wip = earnedRevenue - invoicedAmount;

    // Actual Gross Profit & Margin
    const actualGrossProfit = invoicedAmount - actualCosts;
    const actualGrossMargin = invoicedAmount > 0 ? (actualGrossProfit / invoicedAmount) * 100 : 0;

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
      totalVariations: variations.length,
      approvedVariations: approvedVariationsList.length,
      pendingVariations: pendingVariationsList.length,
      approvedVariationValue: approvedChangeOrders,
      pendingVariationValue,
      totalInvoices: clientInvoices.length,
      paidInvoicesCount: paidInvoicesList.length,
      unpaidInvoices: unpaidInvoicesList.length,
      overdueInvoices: overdueInvoicesList.length,
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
    formatCurrency,
    formatPercentage,
  };
}

// Metric definitions for widget configuration
export const metricDefinitions = [
  { id: "contractPrice", name: "Contract Price", category: "financial", type: "currency" },
  { id: "approvedChangeOrders", name: "Approved Variations", category: "financial", type: "currency" },
  { id: "revisedContractPrice", name: "Revised Contract", category: "financial", type: "currency" },
  { id: "totalProjectCosts", name: "Total Project Costs", category: "costs", type: "currency" },
  { id: "actualCosts", name: "Actual Costs", category: "costs", type: "currency" },
  { id: "costToComplete", name: "Cost to Complete", category: "costs", type: "currency" },
  { id: "grossProfit", name: "Gross Profit", category: "financial", type: "currency" },
  { id: "grossMargin", name: "Gross Margin", category: "financial", type: "percentage" },
  { id: "actualGrossProfit", name: "Actual Gross Profit", category: "financial", type: "currency" },
  { id: "actualGrossMargin", name: "Actual Gross Margin", category: "financial", type: "percentage" },
  { id: "completionPercentage", name: "Completion %", category: "progress", type: "percentage" },
  { id: "earnedRevenue", name: "Earned Revenue", category: "progress", type: "currency" },
  { id: "wip", name: "Work in Progress (WIP)", category: "progress", type: "currency" },
  { id: "invoicedAmount", name: "Invoiced Amount", category: "billing", type: "currency" },
  { id: "invoicedPercentage", name: "Invoiced %", category: "billing", type: "percentage" },
  { id: "paidInvoices", name: "Paid Invoices", category: "billing", type: "currency" },
  { id: "paidInvoicesPercentage", name: "Paid %", category: "billing", type: "percentage" },
  { id: "remainingBalance", name: "Remaining Balance", category: "billing", type: "currency" },
  { id: "remainingToInvoice", name: "Remaining to Invoice", category: "billing", type: "currency" },
  // Summary counts
  { id: "totalBills", name: "Total Bills", category: "summary", type: "count" },
  { id: "paidBills", name: "Paid Bills", category: "summary", type: "count" },
  { id: "pendingBills", name: "Pending Bills", category: "summary", type: "count" },
  { id: "overdueBills", name: "Overdue Bills", category: "summary", type: "count" },
  { id: "totalVariations", name: "Total Variations", category: "summary", type: "count" },
  { id: "approvedVariations", name: "Approved Variations", category: "summary", type: "count" },
  { id: "pendingVariations", name: "Pending Variations", category: "summary", type: "count" },
  { id: "totalInvoices", name: "Total Invoices", category: "summary", type: "count" },
  { id: "paidInvoicesCount", name: "Paid Invoices Count", category: "summary", type: "count" },
  { id: "unpaidInvoices", name: "Unpaid Invoices", category: "summary", type: "count" },
  { id: "overdueInvoices", name: "Overdue Invoices", category: "summary", type: "count" },
] as const;

export type MetricId = typeof metricDefinitions[number]["id"];
