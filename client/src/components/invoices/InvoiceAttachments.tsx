import { useRef, useState } from "react";
import { Paperclip, Trash2, Upload, Loader2, Check } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ClientInvoiceAttachment } from "@shared/schema";

/**
 * Attachments on a client invoice.
 *
 * Self-contained on purpose: the invoice page only renders <InvoiceAttachments>,
 * so this can land without fighting the concurrent redesign of that page.
 *
 * Files go to object storage via the shared presigned-URL route (the same path
 * variations and bills use); the invoice row stores the metadata. `includeInPdf`
 * marks the few files worth appending to the rendered invoice — everything else
 * reaches the client as a link, which is the only thing that works for large or
 * non-printable files.
 */
export function InvoiceAttachments({
  invoiceId,
  attachments,
  onChange,
  readOnly = false,
}: {
  /** Null while the invoice is unsaved — uploads are held until it has an id. */
  invoiceId: string | null;
  attachments: ClientInvoiceAttachment[];
  onChange: (next: ClientInvoiceAttachment[]) => void;
  readOnly?: boolean;
}) {
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const persist = async (next: ClientInvoiceAttachment[]) => {
    onChange(next);
    if (!invoiceId) return; // unsaved invoice — the parent saves it with the form
    await apiRequest(`/api/client-invoices/${invoiceId}`, "PATCH", { attachments: next });
    queryClient.invalidateQueries({ queryKey: [`/api/client-invoices/${invoiceId}`] });
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const { uploadURL, objectPath } = await apiRequest("/api/uploads/request-url", "POST", {
        name: file.name,
        size: file.size,
        contentType: file.type,
      });
      const put = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      // A failed PUT used to be swallowed, leaving a row pointing at nothing.
      if (!put.ok) throw new Error(`Storage rejected the upload (${put.status})`);

      await persist([
        ...attachments,
        { name: file.name, url: objectPath, size: file.size, type: file.type },
      ]);
      toast({ title: "File attached", description: file.name });
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err?.message || "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const humanSize = (bytes?: number) =>
    bytes === undefined ? "" : bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  // Only a PDF or an image can be appended to the rendered invoice; anything
  // else is link-only regardless of what the checkbox would like to do.
  const canAppend = (a: ClientInvoiceAttachment) =>
    !!a.type && (a.type === "application/pdf" || a.type.startsWith("image/"));

  return (
    <div className="px-4 py-3 space-y-2" data-testid="invoice-attachments">
      {attachments.length === 0 && (
        <p className="text-table text-muted-foreground text-center py-1">No attachments</p>
      )}

      {attachments.map((a, i) => (
        <div key={`${a.url}-${i}`} className="flex items-center gap-2 text-table" data-testid={`attachment-${i}`}>
          <Paperclip className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          <a
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className="truncate flex-1 hover:underline"
            title={a.name}
          >
            {a.name}
          </a>
          <span className="text-muted-foreground tabular-nums flex-shrink-0">{humanSize(a.size)}</span>

          {canAppend(a) ? (
            <button
              type="button"
              disabled={readOnly}
              onClick={() =>
                persist(attachments.map((x, j) => (j === i ? { ...x, includeInPdf: !x.includeInPdf } : x)))
              }
              className={cn(
                "h-6 px-2 rounded-md border flex items-center gap-1 flex-shrink-0",
                a.includeInPdf ? "border-primary text-primary" : "border-input text-muted-foreground",
              )}
              title="Append this file to the invoice PDF instead of linking to it"
              data-testid={`button-include-pdf-${i}`}
            >
              {a.includeInPdf && <Check className="h-3 w-3" />}
              In PDF
            </button>
          ) : (
            <span className="text-muted-foreground/60 flex-shrink-0" title="Only PDFs and images can be appended">
              link only
            </span>
          )}

          {!readOnly && (
            <button
              type="button"
              onClick={() => persist(attachments.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-destructive flex-shrink-0"
              data-testid={`button-delete-attachment-${i}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}

      {!readOnly && (
        <>
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
            data-testid="input-attachment-file"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            className="h-7 px-2 text-table border rounded-md hover-elevate active-elevate-2 flex items-center gap-1.5"
            data-testid="button-add-attachment"
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            {uploading ? "Uploading…" : "Add attachment"}
          </button>
        </>
      )}
    </div>
  );
}

export default InvoiceAttachments;
