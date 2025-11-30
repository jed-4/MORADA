import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileText,
  CalendarIcon,
  CheckCircle2,
  AlertCircle,
  Building,
  Clock,
  Download,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { format, isPast } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface RFQItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  notes?: string;
}

interface PortalRFQData {
  rfq: {
    id: string;
    rfqNumber: string;
    title: string;
    description?: string;
    scope?: string;
    dueDate?: string;
    attachmentUrls?: string[];
    attachmentFileNames?: string[];
  };
  items: RFQItem[];
  supplierEmail: string;
  alreadySubmitted: boolean;
}

export default function RFQPortal() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalData, setPortalData] = useState<PortalRFQData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const [supplierName, setSupplierName] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [leadTime, setLeadTime] = useState("");
  const [validUntil, setValidUntil] = useState<Date | undefined>();
  const [notes, setNotes] = useState("");

  useEffect(() => {
    async function loadPortalData() {
      try {
        const response = await fetch(`/api/portal/rfq/${token}`);
        if (!response.ok) {
          const data = await response.json();
          setError(data.error || "Failed to load quote request");
          return;
        }
        const data = await response.json();
        setPortalData(data);
        setSupplierEmail(data.supplierEmail || "");
        if (data.alreadySubmitted) {
          setIsSubmitted(true);
        }
      } catch (err) {
        setError("Failed to connect to server");
      } finally {
        setIsLoading(false);
      }
    }

    if (token) {
      loadPortalData();
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!totalAmount || parseFloat(totalAmount) <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid quote amount",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/portal/rfq/${token}/submit-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierName,
          supplierEmail,
          totalAmount: parseFloat(totalAmount),
          leadTime,
          validUntil: validUntil?.toISOString(),
          notes,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit quote");
      }

      setIsSubmitted(true);
      toast({
        title: "Quote Submitted",
        description: "Your quote has been received successfully",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to submit quote",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading quote request...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <CardTitle>Error</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!portalData) {
    return null;
  }

  const { rfq, items } = portalData;
  const isDueDatePassed = rfq.dueDate && isPast(new Date(rfq.dueDate));

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-6 w-6" />
              <CardTitle>Quote Submitted</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Thank you for submitting your quote for <strong>{rfq.title}</strong> (RFQ #{rfq.rfqNumber}). 
              The builder will review your submission and contact you if they have any questions.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardDescription className="text-sm font-medium text-muted-foreground mb-1">
                  Request for Quote
                </CardDescription>
                <CardTitle className="text-2xl">{rfq.title}</CardTitle>
              </div>
              <Badge variant="outline" className="text-sm">
                RFQ #{rfq.rfqNumber}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {rfq.dueDate && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className={`text-sm ${isDueDatePassed ? "text-destructive" : ""}`}>
                  Due: {format(new Date(rfq.dueDate), "MMMM d, yyyy")}
                  {isDueDatePassed && " (Overdue)"}
                </span>
              </div>
            )}

            {rfq.description && (
              <div>
                <h3 className="font-medium text-sm mb-2">Description</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{rfq.description}</p>
              </div>
            )}

            {rfq.scope && (
              <div>
                <h3 className="font-medium text-sm mb-2">Scope of Work</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{rfq.scope}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {items.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Items to Quote</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[50px]">#</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[100px] text-right">Quantity</TableHead>
                      <TableHead className="w-[100px]">Unit</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="font-medium">{item.description}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell>{item.unit}</TableCell>
                        <TableCell className="text-muted-foreground">{item.notes || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {rfq.attachmentUrls && rfq.attachmentUrls.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Attachments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {rfq.attachmentUrls.map((url, index) => (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg border hover-elevate active-elevate-2"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm flex-1">
                      {rfq.attachmentFileNames?.[index] || `Attachment ${index + 1}`}
                    </span>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Submit Your Quote</CardTitle>
            <CardDescription>
              Fill in the details below to submit your quote for this request.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="supplierName">Your Name / Company</Label>
                  <Input
                    id="supplierName"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Enter your name or company"
                    data-testid="input-supplier-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supplierEmail">Email Address</Label>
                  <Input
                    id="supplierEmail"
                    type="email"
                    value={supplierEmail}
                    onChange={(e) => setSupplierEmail(e.target.value)}
                    placeholder="Enter your email"
                    data-testid="input-supplier-email"
                  />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="totalAmount">Quote Amount (AUD) *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="totalAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value)}
                      placeholder="0.00"
                      className="pl-7"
                      required
                      data-testid="input-total-amount"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="leadTime">Lead Time</Label>
                  <Input
                    id="leadTime"
                    value={leadTime}
                    onChange={(e) => setLeadTime(e.target.value)}
                    placeholder="e.g., 2-3 weeks"
                    data-testid="input-lead-time"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Quote Valid Until (Optional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full md:w-[280px] justify-start text-left font-normal"
                      data-testid="button-valid-until"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {validUntil ? format(validUntil, "PPP") : <span className="text-muted-foreground">Select date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={validUntil}
                      onSelect={setValidUntil}
                      disabled={(date) => date < new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional information, inclusions, exclusions, or terms..."
                  className="min-h-[100px]"
                  data-testid="textarea-notes"
                />
              </div>
            </CardContent>
            <CardFooter className="border-t pt-6">
              <Button
                type="submit"
                className="w-full md:w-auto"
                disabled={isSubmitting || !totalAmount}
                data-testid="button-submit-quote"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Quote"
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
