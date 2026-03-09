import { useState } from "react";
import { format } from "date-fns";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle, XCircle, Pen, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { Variation, VariationItem } from "@shared/schema";

interface AttachmentItem {
  name: string;
  url: string;
  size?: number;
  type?: string;
}

interface Company {
  id: string;
  name: string;
  abn?: string | null;
  phone?: string | null;
  email?: string | null;
  logo?: string | null;
}

interface CompanySettings {
  brandColor?: string | null;
}

interface Project {
  id: string;
  name: string;
  address?: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
}

interface Bill {
  id: string;
  billNumber?: string | null;
  supplierName?: string | null;
  invoiceDate?: string | null;
  totalAmountCents?: number | null;
  totalAmount?: number | null;
}

export interface VariationPreviewProps {
  variation: Variation & {
    clientSignedName?: string | null;
    clientSignedDate?: string | Date | null;
    builderSignedName?: string | null;
    builderSignedDate?: string | Date | null;
    portalToken?: string | null;
  };
  items: VariationItem[];
  bills?: Bill[];
  company?: Company | null;
  companySettings?: CompanySettings | null;
  project?: Project | null;
  mode: "preview" | "portal";
  portalToken?: string;
  onSigned?: (data: { signerType: "client" | "builder"; name: string; action: "approve" | "reject" }) => void;
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const TYPE_LABELS: Record<string, string> = {
  material: "Materials",
  labour: "Labour",
  subcontractor: "Subcontractor",
  fee: "Fee / Overhead",
  allowance: "Allowances",
  other: "Other",
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: "#e5e7eb", text: "#374151", label: "Draft" },
  action: { bg: "#fef3c7", text: "#92400e", label: "Action Required" },
  pending: { bg: "#dbeafe", text: "#1e40af", label: "Pending Approval" },
  approved: { bg: "#d1fae5", text: "#065f46", label: "Approved" },
  rejected: { bg: "#fee2e2", text: "#991b1b", label: "Rejected" },
};

function SignatureCard({
  title,
  signedName,
  signedDate,
  mode,
  onSign,
  onReject,
  loading,
}: {
  title: string;
  signedName?: string | null;
  signedDate?: string | Date | null;
  mode: "preview" | "portal";
  onSign?: (name: string) => void;
  onReject?: (name: string, reason: string) => void;
  loading?: boolean;
}) {
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  if (mode === "preview" || (signedName && signedDate)) {
    return (
      <div className="flex-1 border border-gray-200 rounded-lg p-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</p>
        {signedName && signedDate ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-sm font-medium text-gray-800">{signedName}</span>
            </div>
            <p className="text-xs text-gray-500 ml-5.5">
              Signed {format(new Date(signedDate), "d MMMM yyyy 'at' h:mm a")}
            </p>
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            <div className="flex gap-2">
              <span className="text-xs text-gray-400">Name:</span>
              <div className="flex-1 border-b border-gray-300 h-5" />
            </div>
            <div className="flex gap-2">
              <span className="text-xs text-gray-400">Signature:</span>
              <div className="flex-1 border-b border-gray-300 h-5" />
            </div>
            <div className="flex gap-2">
              <span className="text-xs text-gray-400">Date:</span>
              <div className="flex-1 border-b border-gray-300 h-5" />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 border border-gray-200 rounded-lg p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</p>
      {showReject ? (
        <div className="space-y-2">
          <Input
            placeholder="Your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-sm"
          />
          <Textarea
            placeholder="Reason for rejection (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="text-sm"
            rows={2}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              disabled={!name.trim() || loading}
              onClick={() => onReject?.(name.trim(), reason.trim())}
            >
              Confirm Rejection
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowReject(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            placeholder="Your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              disabled={!name.trim() || loading}
              onClick={() => onSign?.(name.trim())}
            >
              <Pen className="w-3 h-3 mr-1.5" />
              Approve &amp; Sign
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive"
              onClick={() => setShowReject(true)}
            >
              <XCircle className="w-3 h-3 mr-1.5" />
              Reject
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function VariationPreviewContent({
  variation,
  items,
  bills = [],
  company,
  companySettings,
  project,
  mode,
  portalToken,
  onSigned,
}: VariationPreviewProps) {
  const { toast } = useToast();
  const primaryColor = companySettings?.brandColor || "#6d28d9";

  const costItems = items.filter((i) => (i as any).itemType !== "allowance");
  const allowanceItems = items.filter((i) => (i as any).itemType === "allowance");

  const visibleCostItems = costItems.filter((i) => (i as any).showInPdf !== false);

  const typeGroups = visibleCostItems.reduce<Record<string, VariationItem[]>>((acc, item) => {
    const type = (item as any).type || "other";
    if (!acc[type]) acc[type] = [];
    acc[type].push(item);
    return acc;
  }, {});

  const subtotalCents = variation.subtotal ?? 0;
  const gstCents = variation.gstAmount ?? 0;
  const totalCents = variation.totalAmount ?? 0;

  const statusStyle = STATUS_STYLES[variation.status ?? "draft"] ?? STATUS_STYLES.draft;

  const signMutation = useMutation({
    mutationFn: async (body: {
      signerType: "client" | "builder";
      name: string;
      action: "approve" | "reject";
      rejectionReason?: string;
    }) => {
      const res = await fetch(`/api/portal/variation/${portalToken}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Sign failed");
      return res.json();
    },
    onSuccess: (data, vars) => {
      toast({ title: vars.action === "approve" ? "Variation approved" : "Rejection submitted" });
      onSigned?.(vars);
    },
    onError: () => {
      toast({ title: "Failed to sign", variant: "destructive" });
    },
  });

  return (
    <div className="bg-white text-gray-900 font-sans" style={{ maxWidth: "900px", margin: "0 auto" }}>
      {/* Hero Band */}
      <div
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${primaryColor} 0%, ${hexToRgba(primaryColor, 0.7)} 100%)`,
          minHeight: "160px",
          padding: "28px 32px",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          {/* Left: Company */}
          <div className="flex items-center gap-4">
            {company?.logo ? (
              <img
                src={company.logo}
                alt={company.name}
                className="h-14 w-14 rounded-lg object-contain bg-white/20 p-1"
              />
            ) : (
              <div className="h-14 w-14 rounded-lg bg-white/20 flex items-center justify-center">
                <Building2 className="w-7 h-7 text-white/80" />
              </div>
            )}
            <div>
              <p className="text-white font-bold text-xl leading-tight">{company?.name || "BuildPro"}</p>
              {company?.phone && (
                <p className="text-white/80 text-sm mt-0.5">{company.phone}</p>
              )}
              {company?.email && (
                <p className="text-white/80 text-sm">{company.email}</p>
              )}
              {company?.abn && (
                <p className="text-white/60 text-xs mt-0.5">ABN {company.abn}</p>
              )}
            </div>
          </div>

          {/* Right: Status + ID + Total */}
          <div className="text-right">
            <span
              className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold mb-2"
              style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
            >
              {statusStyle.label}
            </span>
            <p className="text-white font-bold text-2xl">
              {formatCents(totalCents)}
            </p>
            <p className="text-white/70 text-sm">{variation.variationNumber}</p>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* Variation Information Grid */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Variation Details</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-gray-400">Name</p>
              <p className="text-sm font-medium text-gray-800">{variation.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Project</p>
              <p className="text-sm font-medium text-gray-800">{project?.name || "—"}</p>
            </div>
            {project?.address && (
              <div>
                <p className="text-xs text-gray-400">Site Address</p>
                <p className="text-sm font-medium text-gray-800">{project.address}</p>
              </div>
            )}
            {project?.clientName && (
              <div>
                <p className="text-xs text-gray-400">Client</p>
                <p className="text-sm font-medium text-gray-800">{project.clientName}</p>
              </div>
            )}
            {project?.clientEmail && (
              <div>
                <p className="text-xs text-gray-400">Client Email</p>
                <p className="text-sm font-medium text-gray-800">{project.clientEmail}</p>
              </div>
            )}
            {project?.clientPhone && (
              <div>
                <p className="text-xs text-gray-400">Client Phone</p>
                <p className="text-sm font-medium text-gray-800">{project.clientPhone}</p>
              </div>
            )}
            {variation.approvalDeadline && (
              <div>
                <p className="text-xs text-gray-400">Effective Until</p>
                <p className="text-sm font-medium text-gray-800">
                  {format(new Date(variation.approvalDeadline), "d MMM yyyy")}
                </p>
              </div>
            )}
            {variation.daysChanged ? (
              <div>
                <p className="text-xs text-gray-400">Schedule Impact</p>
                <p className="text-sm font-medium text-gray-800">
                  {variation.daysChanged > 0 ? "+" : ""}{variation.daysChanged} working day{Math.abs(variation.daysChanged) !== 1 ? "s" : ""}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Introduction Text */}
        {variation.introductionText && (
          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {variation.introductionText}
          </div>
        )}

        {/* Cost Lines grouped by type */}
        {Object.keys(typeGroups).length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Cost Lines</h2>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Header */}
              <div
                className="grid text-xs font-semibold text-white px-3 py-2"
                style={{
                  backgroundColor: primaryColor,
                  gridTemplateColumns: "1fr 80px 90px 70px 90px",
                }}
              >
                <span>Description</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit Cost</span>
                <span className="text-right">Markup</span>
                <span className="text-right">Amt inc. GST</span>
              </div>

              {Object.entries(typeGroups).map(([type, typeItems]) => {
                const typeTotal = typeItems.reduce((sum, item) => {
                  const exTax = (item.quantity ?? 1) * ((item.unitCostExTax ?? (item.unitPrice ?? 0) / 100));
                  const markup = exTax * ((item.markupPercent ?? 0) / 100);
                  const withMarkup = exTax + markup;
                  const incTax = (item as any).taxable !== false ? withMarkup * 1.1 : withMarkup;
                  return sum + incTax;
                }, 0);

                return (
                  <div key={type}>
                    {/* Type header row */}
                    <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {TYPE_LABELS[type] ?? type}
                      </span>
                      <span className="text-xs font-semibold text-gray-600">
                        {new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(typeTotal)}
                      </span>
                    </div>

                    {typeItems.map((item, idx) => {
                      const unitCost = item.unitCostExTax ?? (item.unitPrice ?? 0) / 100;
                      const qty = item.quantity ?? 1;
                      const exTax = qty * unitCost;
                      const markup = exTax * ((item.markupPercent ?? 0) / 100);
                      const withMarkup = exTax + markup;
                      const incTax = (item as any).taxable !== false ? withMarkup * 1.1 : withMarkup;
                      const isAlt = idx % 2 === 1;

                      return (
                        <div
                          key={item.id}
                          className="grid px-3 py-2 border-t border-gray-100 text-sm"
                          style={{
                            backgroundColor: isAlt ? "#f9fafb" : "#ffffff",
                            gridTemplateColumns: "1fr 80px 90px 70px 90px",
                          }}
                        >
                          <div className="pr-2 min-w-0">
                            {(item as any).name && <span className="block text-gray-800 font-semibold truncate">{(item as any).name}</span>}
                            {item.description && <span className="block text-gray-500 text-xs truncate">{item.description}</span>}
                            {!(item as any).name && !item.description && <span className="text-gray-400">—</span>}
                          </div>
                          <span className="text-right text-gray-600 text-xs tabular-nums">
                            {qty} {(item as any).unitType || ""}
                          </span>
                          <span className="text-right text-gray-600 text-xs tabular-nums">
                            {new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(unitCost)}
                          </span>
                          <span className="text-right text-gray-600 text-xs tabular-nums">
                            {item.markupPercent ? `${item.markupPercent}%` : "—"}
                          </span>
                          <span className="text-right text-gray-800 font-medium text-xs tabular-nums">
                            {new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(incTax)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Allowances */}
        {allowanceItems.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Allowances</h2>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {allowanceItems.map((item, idx) => {
                const amount = (item.unitPrice ?? 0) / 100;
                const isAlt = idx % 2 === 1;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-3 py-2 border-t border-gray-100 text-sm"
                    style={{ backgroundColor: isAlt ? "#f9fafb" : "#ffffff" }}
                  >
                    <span className="text-gray-800">{item.description}</span>
                    <span
                      className={`font-medium tabular-nums ${amount < 0 ? "text-red-600" : "text-gray-800"}`}
                    >
                      {amount < 0 ? "-" : ""}
                      {new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Math.abs(amount))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bills */}
        {bills.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Linked Bills</h2>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="grid text-xs font-semibold text-gray-500 px-3 py-2 bg-gray-50 border-b border-gray-200"
                style={{ gridTemplateColumns: "100px 1fr 100px 100px" }}>
                <span>Bill #</span>
                <span>Supplier</span>
                <span className="text-right">Date</span>
                <span className="text-right">Total</span>
              </div>
              {bills.map((bill, idx) => {
                const totalCents = bill.totalAmountCents ?? (bill.totalAmount ?? 0);
                const isAlt = idx % 2 === 1;
                return (
                  <div
                    key={bill.id}
                    className="grid px-3 py-2 text-sm border-t border-gray-100"
                    style={{
                      backgroundColor: isAlt ? "#f9fafb" : "#ffffff",
                      gridTemplateColumns: "100px 1fr 100px 100px",
                    }}
                  >
                    <span className="text-gray-600">{bill.billNumber || "—"}</span>
                    <span className="text-gray-800">{bill.supplierName || "—"}</span>
                    <span className="text-right text-gray-600">
                      {bill.invoiceDate ? format(new Date(bill.invoiceDate), "d MMM yy") : "—"}
                    </span>
                    <span className="text-right font-medium tabular-nums">
                      {new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(totalCents / 100)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Financial Summary */}
        <div className="flex justify-end">
          <div className="w-72 border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal (ex. GST)</span>
                <span className="font-medium tabular-nums">{formatCents(subtotalCents)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">GST (10%)</span>
                <span className="font-medium tabular-nums">{formatCents(gstCents)}</span>
              </div>
              <div
                className="flex justify-between items-center pt-2 mt-2 border-t"
                style={{ borderColor: primaryColor + "40" }}
              >
                <span className="font-bold text-base" style={{ color: primaryColor }}>Total (inc. GST)</span>
                <span className="font-bold text-xl tabular-nums" style={{ color: primaryColor }}>
                  {formatCents(totalCents)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Closing text */}
        {variation.closingText && (
          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap border-t border-gray-100 pt-6">
            {variation.closingText}
          </div>
        )}

        {/* Terms & Conditions */}
        {variation.termsAndConditions && (
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Terms &amp; Conditions</p>
            <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap">
              {variation.termsAndConditions}
            </p>
          </div>
        )}

        {/* Signatures */}
        <div className="border-t border-gray-200 pt-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Signatures</h2>
          <div className="flex gap-4">
            <SignatureCard
              title={`Legal Representative of ${company?.name || "Builder"}`}
              signedName={variation.builderSignedName}
              signedDate={variation.builderSignedDate}
              mode="preview"
            />
            <SignatureCard
              title="Client Authorisation"
              signedName={variation.clientSignedName}
              signedDate={variation.clientSignedDate}
              mode={mode}
              loading={signMutation.isPending}
              onSign={(name) =>
                signMutation.mutate({ signerType: "client", name, action: "approve" })
              }
              onReject={(name, rejectionReason) =>
                signMutation.mutate({ signerType: "client", name, action: "reject", rejectionReason })
              }
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 px-8 py-4 text-center">
        <p className="text-xs text-gray-400">Powered by BuildPro</p>
      </div>
    </div>
  );
}
