import { useRef, useState } from "react";
import { FileText, Upload, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useUpload } from "@/hooks/use-upload";
import { useToast } from "@/hooks/use-toast";
import { ensurePdfWorker } from "@/lib/pdfWorker";

interface Props {
  content: Record<string, any>;
  setContent: (content: Record<string, any>) => void;
}

/**
 * Reads the page count so the document can reserve exactly that many slots.
 *
 * Must await the worker: this goes straight to pdf.js rather than through a
 * <Document>, so nothing else has registered it. See lib/pdfWorker.
 */
async function readPageCount(file: File): Promise<number> {
  await ensurePdfWorker();
  const { pdfjs } = await import("react-pdf");
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const count = doc.numPages;
  await doc.destroy();
  return count;
}

/**
 * A page designed elsewhere — Canva, InDesign, a PDF from a designer — carried
 * into the proposal as-is.
 *
 * Deliberately not re-rendered: the page keeps its own fonts, artwork and
 * page size, and nothing in the builder can reflow or reprice it. That is the
 * trade for letting a builder use a document they already have.
 */
export function ImportedPdfEditor({ content, setContent }: Props) {
  const { toast } = useToast();
  const { uploadFile, isUploading } = useUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  const fileName = typeof content.fileName === "string" ? content.fileName : null;
  const pageCount = Number(content.pageCount) || 0;
  const busy = isUploading || reading;

  const handleFile = async (file: File) => {
    if (file.type !== "application/pdf") {
      toast({ variant: "destructive", title: "PDFs only", description: "Export your design as a PDF first." });
      return;
    }
    setReading(true);
    try {
      const count = await readPageCount(file);
      const result = await uploadFile(file);
      // uploadFile resolves null when the presign or the PUT fails; it has
      // already surfaced why, so this just declines to store a broken path.
      if (!result) return;
      setContent({
        ...content,
        objectPath: result.objectPath,
        fileName: file.name,
        pageCount: count,
      });
      toast({ title: "Page imported", description: `${file.name} — ${count} page${count === 1 ? "" : "s"}.` });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not import that PDF",
        description: err instanceof Error ? err.message : "Try exporting it again.",
      });
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="space-y-2" data-testid="imported-pdf-editor">
      <Label>Imported page</Label>

      {fileName ? (
        <div className="flex items-center gap-2 rounded-md border p-2">
          <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs truncate">{fileName}</p>
            <p className="text-xs text-muted-foreground">
              {pageCount} page{pageCount === 1 ? "" : "s"} · printed exactly as designed
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 flex-shrink-0"
            onClick={() => setContent({ ...content, objectPath: undefined, fileName: undefined, pageCount: undefined })}
            aria-label="Remove imported PDF"
            data-testid="button-remove-imported-pdf"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Export from Canva as a PDF and drop it here. It prints untouched, keeping its own
          fonts and artwork, and sits wherever this section sits in the order.
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset first: picking the same file twice must still fire onChange.
          e.target.value = "";
          if (file) void handleFile(file);
        }}
        data-testid="input-imported-pdf"
      />
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        data-testid="button-upload-imported-pdf"
      >
        {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
        {busy ? "Importing…" : fileName ? "Replace PDF" : "Choose PDF"}
      </Button>
    </div>
  );
}
