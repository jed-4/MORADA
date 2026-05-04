import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, FileText, CheckCircle2, AlertCircle, XCircle, Building, Clock } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { SignaturePad, type SignatureResult } from "@/components/SignaturePad";
import type {
  Proposal,
  ProposalSection,
  ProposalItem,
  ProposalPaymentMilestone,
  ProposalAcceptance,
} from "@shared/schema";

interface SnapshotData {
  proposal: Proposal;
  sections?: ProposalSection[];
  items?: ProposalItem[];
  milestones?: ProposalPaymentMilestone[];
  acceptances?: ProposalAcceptance[];
}

interface ClientViewResponse {
  proposal: Proposal;
  snapshot: SnapshotData | null;
  source: "snapshot" | "live";
}

const SECTION_LABELS: Record<string, string> = {
  cover_page: "Cover Page",
  cover_letter: "Cover Letter",
  scope: "Scope of Work",
  estimate: "Estimate",
  summary: "Summary",
  allowances: "Allowances",
  inclusions_exclusions: "Inclusions & Exclusions",
  payment_schedule: "Payment Schedule",
  closing: "Closing",
  closing_letter: "Closing Letter",
  attachments: "Attachments",
  terms_conditions: "Terms & Conditions",
  signature: "Signature",
  custom: "Section",
};

function richTextToPlain(html: string): string {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/(p|div|h[1-6]|li)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function SectionView({
  section,
  milestones,
}: {
  section: ProposalSection;
  milestones: ProposalPaymentMilestone[];
}) {
  const content = (section.content as Record<string, unknown>) || {};
  const label = SECTION_LABELS[section.sectionType] || "Section";

  if (section.sectionType === "signature") return null;

  let body: React.ReactNode = null;

  if (section.sectionType === "payment_schedule") {
    const sorted = [...milestones].sort((a, b) => a.order - b.order);
    body = (
      <div className="space-y-1">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payment milestones defined.</p>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-3 py-2">Milestone</th>
                  <th className="text-right px-3 py-2 w-24">%</th>
                  <th className="text-right px-3 py-2 w-32">Amount</th>
                  <th className="text-left px-3 py-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="px-3 py-2">{m.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {m.percentage != null ? `${Number(m.percentage).toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {m.amountCents != null ? `$${(Number(m.amountCents) / 100).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{m.description || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  } else if (section.sectionType === "inclusions_exclusions") {
    const inc = (content.inclusionsText as string) || "";
    const exc = (content.exclusionsText as string) || "";
    body = (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="font-medium mb-1">Inclusions</h4>
          <p className="text-sm whitespace-pre-line text-muted-foreground">
            {richTextToPlain(inc) || "—"}
          </p>
        </div>
        <div>
          <h4 className="font-medium mb-1">Exclusions</h4>
          <p className="text-sm whitespace-pre-line text-muted-foreground">
            {richTextToPlain(exc) || "—"}
          </p>
        </div>
      </div>
    );
  } else {
    const html =
      (content.summaryText as string) ||
      (content.scopeText as string) ||
      (content.letterText as string) ||
      (content.closingText as string) ||
      (content.termsText as string) ||
      (content.customText as string) ||
      "";
    body = (
      <p className="text-sm whitespace-pre-line text-muted-foreground">
        {richTextToPlain(html) || (section.description ?? "—")}
      </p>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {section.name || label}
          <Badge variant="outline" className="text-xs">
            {label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

export default function ProposalPortal() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ClientViewResponse | null>(null);

  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signature, setSignature] = useState<SignatureResult | null>(null);
  const [comments, setComments] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [decision, setDecision] = useState<"accepted" | "rejected" | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/proposals/${id}/client-view`);
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          if (!cancelled) setError(j.error || "Failed to load proposal");
          return;
        }
        const j = (await res.json()) as ClientViewResponse;
        if (!cancelled) setData(j);
      } catch {
        if (!cancelled) setError("Could not connect to server");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    if (id) load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function submit(status: "accepted" | "rejected") {
    if (!data) return;
    if (!signerName.trim() || !signerEmail.trim()) {
      toast({ title: "Missing details", description: "Please enter your name and email.", variant: "destructive" });
      return;
    }
    if (status === "accepted" && !signature) {
      toast({ title: "Signature required", description: "Please sign before accepting.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/proposals/${id}/acceptances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          signedByName: signerName,
          signedByEmail: signerEmail,
          signedByRole: "client",
          signature: status === "accepted" ? signature?.data : null,
          signatureMethod: status === "accepted" ? signature?.method : null,
          comments: comments || null,
          rejectionReason: status === "rejected" ? rejectionReason || null : null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to submit");
      }
      setDecision(status);
      toast({
        title: status === "accepted" ? "Proposal accepted" : "Proposal rejected",
        description: status === "accepted" ? "Thank you for your acceptance." : "Your response has been recorded.",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Submission failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Unable to load proposal
            </CardTitle>
            <CardDescription>{error || "This proposal could not be loaded."}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const proposal = data.snapshot?.proposal || data.proposal;
  const sections = (data.snapshot?.sections || []).filter((s) => s.isEnabled !== false).sort((a, b) => a.order - b.order);
  const milestones = data.snapshot?.milestones || [];
  const existingAcceptances = data.snapshot?.acceptances || [];
  const existingDecision = existingAcceptances.find((a) => a.status === "accepted") ||
    existingAcceptances.find((a) => a.status === "rejected") ||
    null;
  const isAlreadyDecided = !!existingDecision || decision !== null;

  return (
    <div className="min-h-screen bg-muted/40 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  {proposal.name}
                </CardTitle>
                <CardDescription className="mt-1 flex items-center gap-3 flex-wrap">
                  <span>#{proposal.proposalNumber}</span>
                  {(proposal as any).version > 1 && (
                    <Badge variant="outline" className="text-xs">
                      v{(proposal as any).version}
                    </Badge>
                  )}
                  {proposal.expiryDate && (
                    <span className="inline-flex items-center gap-1 text-xs">
                      <Clock className="w-3 h-3" />
                      Valid until {format(new Date(proposal.expiryDate as any), "MMM d, yyyy")}
                    </span>
                  )}
                </CardDescription>
              </div>
              <Badge variant="secondary" className="capitalize">
                {proposal.status?.replace("_", " ")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4" />
              <span>Total: ${(Number((proposal as any).totalAmount || 0) / 100).toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>

        {sections.map((section) => (
          <SectionView key={section.id} section={section} milestones={milestones} />
        ))}

        <Card data-testid="card-portal-acceptance">
          <CardHeader>
            <CardTitle className="text-base">Acceptance</CardTitle>
            <CardDescription>
              {isAlreadyDecided
                ? "Your response has already been recorded."
                : "Sign and submit your response below."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isAlreadyDecided ? (
              <div className="flex items-center gap-2 text-sm" data-testid="text-portal-decision">
                {(decision || existingDecision?.status) === "accepted" ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>Accepted by {existingDecision?.signedByName || signerName}</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5 text-destructive" />
                    <span>Rejected by {existingDecision?.signedByName || signerName}</span>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="signer-name">Your Name</Label>
                    <Input
                      id="signer-name"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      placeholder="Full name"
                      data-testid="input-signer-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signer-email">Your Email</Label>
                    <Input
                      id="signer-email"
                      type="email"
                      value={signerEmail}
                      onChange={(e) => setSignerEmail(e.target.value)}
                      placeholder="you@example.com"
                      data-testid="input-signer-email"
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Signature</Label>
                  <SignaturePad onChange={setSignature} defaultName={signerName} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="comments">Comments (optional)</Label>
                  <Textarea
                    id="comments"
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder="Any notes for the contractor"
                    data-testid="textarea-portal-comments"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rejection">Rejection reason (only if rejecting)</Label>
                  <Textarea
                    id="rejection"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Explain why you are rejecting (optional)"
                    data-testid="textarea-rejection-reason"
                  />
                </div>
              </>
            )}
          </CardContent>
          {!isAlreadyDecided && (
            <CardFooter className="flex justify-end gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() => submit("rejected")}
                disabled={isSubmitting}
                data-testid="button-portal-reject"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Reject
              </Button>
              <Button
                onClick={() => submit("accepted")}
                disabled={isSubmitting}
                data-testid="button-portal-accept"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Accept &amp; Sign
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
