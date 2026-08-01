import { useState } from "react";
import { format } from "date-fns";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle, XCircle, Pen, Building2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { Variation, VariationItem } from "@shared/schema";
import {
  buildVariationDocumentModel,
  variationStatusPresentation,
  type VariationDocAttachment,
} from "./variationDocumentModel";

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
  /** On-charged labour total in ex-GST cents (aggregated server-side — raw timesheets never reach the portal). */
  labourTotalCents?: number | null;
  /** Inc-GST value of lines hidden from the client, rendered as one row so the visible breakdown reconciles. */
  notItemisedIncCents?: number;
  attachments?: VariationDocAttachment[];
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

// Type labels, status wording and the document model all come from
// variationDocumentModel so this page and the PDF can't drift apart.

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
      <div className="flex-1 border border-border rounded-lg p-5">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{title}</p>
        {signedName && signedDate ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-status-success" />
              <span className="text-sm font-medium text-foreground">{signedName}</span>
            </div>
            <p className="text-xs text-muted ml-5.5">
              Signed {format(new Date(signedDate), "d MMMM yyyy 'at' h:mm a")}
            </p>
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            <div className="flex gap-2">
              <span className="text-xs text-muted">Name:</span>
              <div className="flex-1 border-b border-border h-5" />
            </div>
            <div className="flex gap-2">
              <span className="text-xs text-muted">Signature:</span>
              <div className="flex-1 border-b border-border h-5" />
            </div>
            <div className="flex gap-2">
              <span className="text-xs text-muted">Date:</span>
              <div className="flex-1 border-b border-border h-5" />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 border border-border rounded-lg p-5">
      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{title}</p>
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
              className="flex-1 bg-sage hover:bg-sage/90 text-white"
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
  labourTotalCents = 0,
  notItemisedIncCents,
  attachments = [],
  company,
  companySettings,
  project,
  mode,
  portalToken,
  onSigned,
}: VariationPreviewProps) {
  const { toast } = useToast();
  const primaryColor = companySettings?.brandColor || "#6d28d9";

  // Shared with the PDF so both documents group, label and total identically.
  const docModel = buildVariationDocumentModel({
    variation,
    items,
    bills,
    labourExCents: labourTotalCents ?? 0,
    notItemisedIncCents,
  });

  const subtotalCents = docModel.subtotalCents;
  const gstCents = docModel.gstCents;
  const totalCents = docModel.totalCents;

  const statusStyle = variationStatusPresentation(variation.status);

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
      if (!res.ok) {
        // Surface the server's guard messages (already signed / finalised /
        // deadline passed) instead of a generic failure.
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Sign failed");
      }
      return res.json();
    },
    onSuccess: (data, vars) => {
      toast({ title: vars.action === "approve" ? "Variation approved" : "Rejection submitted" });
      onSigned?.(vars);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to sign", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="bg-white text-foreground font-sans" style={{ maxWidth: "900px", margin: "0 auto" }}>
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
              <p className="text-white font-bold text-xl leading-tight">{company?.name || "Morada"}</p>
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
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Variation Details</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted">Name</p>
              <p className="text-sm font-medium text-foreground">{variation.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Project</p>
              <p className="text-sm font-medium text-foreground">{project?.name || "—"}</p>
            </div>
            {project?.address && (
              <div>
                <p className="text-xs text-muted">Site Address</p>
                <p className="text-sm font-medium text-foreground">{project.address}</p>
              </div>
            )}
            {project?.clientName && (
              <div>
                <p className="text-xs text-muted">Client</p>
                <p className="text-sm font-medium text-foreground">{project.clientName}</p>
              </div>
            )}
            {project?.clientEmail && (
              <div>
                <p className="text-xs text-muted">Client Email</p>
                <p className="text-sm font-medium text-foreground">{project.clientEmail}</p>
              </div>
            )}
            {project?.clientPhone && (
              <div>
                <p className="text-xs text-muted">Client Phone</p>
                <p className="text-sm font-medium text-foreground">{project.clientPhone}</p>
              </div>
            )}
            {variation.approvalDeadline && (
              <div>
                <p className="text-xs text-muted">Effective Until</p>
                <p className="text-sm font-medium text-foreground">
                  {format(new Date(variation.approvalDeadline), "d MMM yyyy")}
                </p>
              </div>
            )}
            {variation.daysChanged ? (
              <div>
                <p className="text-xs text-muted">Schedule Impact</p>
                <p className="text-sm font-medium text-foreground">
                  {variation.daysChanged > 0 ? "+" : ""}{variation.daysChanged} working day{Math.abs(variation.daysChanged) !== 1 ? "s" : ""}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Introduction Text */}
        {variation.introductionText && (
          <div className="text-sm text-secondary leading-relaxed whitespace-pre-wrap">
            {variation.introductionText}
          </div>
        )}

        {/* Cost Lines grouped by type */}
        {docModel.costGroups.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Cost Lines</h2>
            <div className="border border-border rounded-lg overflow-hidden">
              {/* Header */}
              <div
                className="grid text-xs font-semibold text-white px-3 py-2"
                style={{
                  backgroundColor: primaryColor,
                  gridTemplateColumns: "1fr 80px 100px 100px",
                }}
              >
                <span>Description</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit Price</span>
                <span className="text-right">Amt inc. GST</span>
              </div>

              {docModel.costGroups.map((group) => (
                <div key={group.type}>
                  {/* Type header row */}
                  <div className="px-3 py-1.5 bg-muted border-t border-border flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                      {group.label}
                    </span>
                    <span className="text-xs font-semibold text-secondary">
                      {formatCents(group.totalIncCents)}
                    </span>
                  </div>

                  {group.lines.map((line, idx) => (
                    <div
                      key={line.id}
                      className="grid px-3 py-2 border-t border-border text-sm"
                      style={{
                        backgroundColor: idx % 2 === 1 ? "#f9fafb" : "#ffffff",
                        gridTemplateColumns: "1fr 80px 100px 100px",
                      }}
                    >
                      <div className="pr-2 min-w-0">
                        {line.name && <span className="block text-foreground font-semibold truncate">{line.name}</span>}
                        {line.description && <span className="block text-muted text-xs truncate">{line.description}</span>}
                        {!line.name && !line.description && <span className="text-muted">—</span>}
                      </div>
                      <span className="text-right text-secondary text-xs tabular-nums">
                        {line.quantity} {line.unitType || ""}
                      </span>
                      <span className="text-right text-secondary text-xs tabular-nums">
                        {formatCents(line.unitPriceExCents)}
                      </span>
                      <span className="text-right text-foreground font-medium text-xs tabular-nums">
                        {formatCents(line.amountIncCents)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}

              {/* Value the builder chose not to itemise — shown so the rows
                  above still add up to the Total below. */}
              {docModel.notItemisedIncCents !== 0 && (
                <div className="grid px-3 py-2 border-t border-border text-sm bg-white"
                  style={{ gridTemplateColumns: "1fr 100px" }}>
                  <span className="text-foreground">Additional works (not itemised)</span>
                  <span className="text-right text-foreground font-medium text-xs tabular-nums">
                    {formatCents(docModel.notItemisedIncCents)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Allowances */}
        {docModel.allowanceLines.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Allowances</h2>
            <div className="border border-border rounded-lg overflow-hidden">
              {docModel.allowanceLines.map((line, idx) => (
                <div
                  key={line.id}
                  className="flex items-center justify-between px-3 py-2 border-t border-border text-sm"
                  style={{ backgroundColor: idx % 2 === 1 ? "#f9fafb" : "#ffffff" }}
                >
                  <span className="text-foreground">{line.description}</span>
                  <span
                    className={`font-medium tabular-nums ${line.amountIncCents < 0 ? "text-status-danger" : "text-foreground"}`}
                  >
                    {formatCents(line.amountIncCents)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bills */}
        {docModel.bills.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Linked Bills</h2>
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="grid text-xs font-semibold text-muted px-3 py-2 bg-muted border-b border-border"
                style={{ gridTemplateColumns: "100px 1fr 100px 100px" }}>
                <span>Bill #</span>
                <span>Supplier</span>
                <span className="text-right">Date</span>
                <span className="text-right">Total</span>
              </div>
              {docModel.bills.map((bill, idx) => (
                <div
                  key={bill.id}
                  className="grid px-3 py-2 text-sm border-t border-border"
                  style={{
                    backgroundColor: idx % 2 === 1 ? "#f9fafb" : "#ffffff",
                    gridTemplateColumns: "100px 1fr 100px 100px",
                  }}
                >
                  <span className="text-secondary">{bill.billNumber || "—"}</span>
                  <span className="text-foreground">{bill.supplierName || "—"}</span>
                  <span className="text-right text-secondary">
                    {bill.invoiceDate ? format(new Date(bill.invoiceDate), "d MMM yy") : "—"}
                  </span>
                  <span className="text-right font-medium tabular-nums">
                    {formatCents(bill.totalIncCents)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* On-charged site labour (aggregated; individual timesheets stay private) */}
        {docModel.labourIncCents > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Site Labour</h2>
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-foreground">Labour</span>
                <span className="font-medium tabular-nums">{formatCents(docModel.labourIncCents)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Attachments — downloadable through the token-scoped portal route */}
        {attachments.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Attachments</h2>
            <div className="border border-border rounded-lg overflow-hidden">
              {attachments.map((att, idx) => (
                <div
                  key={att.index}
                  className="flex items-center justify-between px-3 py-2 border-t border-border text-sm"
                  style={{ backgroundColor: idx % 2 === 1 ? "#f9fafb" : "#ffffff" }}
                >
                  <span className="text-foreground truncate pr-3">{att.name}</span>
                  {portalToken ? (
                    <a
                      href={`/api/portal/variation/${portalToken}/attachments/${att.index}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs font-medium flex-shrink-0"
                      style={{ color: primaryColor }}
                      data-testid={`link-attachment-${att.index}`}
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </a>
                  ) : (
                    <span className="text-xs text-muted flex-shrink-0">Attached</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Why it was rejected — captured at rejection but never shown before */}
        {variation.status === "rejected" && variation.rejectionReason && (
          <div className="border border-status-danger/30 bg-status-danger/5 rounded-lg p-4">
            <p className="text-xs font-semibold text-status-danger uppercase tracking-wide mb-1">Reason for rejection</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{variation.rejectionReason}</p>
          </div>
        )}

        {/* Financial Summary */}
        <div className="flex justify-end">
          <div className="w-72 border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Subtotal (ex. GST)</span>
                <span className="font-medium tabular-nums">{formatCents(subtotalCents)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">GST (10%)</span>
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
          <div className="text-sm text-secondary leading-relaxed whitespace-pre-wrap border-t border-border pt-6">
            {variation.closingText}
          </div>
        )}

        {/* Terms & Conditions */}
        {variation.termsAndConditions && (
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Terms &amp; Conditions</p>
            <p className="text-xs text-muted leading-relaxed whitespace-pre-wrap">
              {variation.termsAndConditions}
            </p>
          </div>
        )}

        {/* Signatures */}
        <div className="border-t border-border pt-6">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Signatures</h2>
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
      <div className="border-t border-border px-8 py-4 text-center">
        <p className="text-xs text-muted">Powered by Morada</p>
      </div>
    </div>
  );
}
