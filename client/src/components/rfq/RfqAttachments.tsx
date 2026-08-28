import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, FileIcon, FileText, ImageIcon, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpload } from "@/hooks/use-upload";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Rfq } from "@shared/schema";
import { cn } from "@/lib/utils";

/**
 * RFQ attachments — plans, specs, drawings.
 *
 * The section this replaces was scenery: the Upload button's whole handler was
 * `e.stopPropagation()`, the per-file Download button had no handler at all,
 * and the empty state invited you to "drag files here" with nothing listening.
 * attachmentUrls / attachmentFileNames could never be populated from the UI.
 *
 * Uploads go through the existing server-side endpoint (POST /api/uploads/file
 * via useUpload), which streams into object storage — the same path Messages
 * and Site Diary use, so there's no new infrastructure and no CORS problem.
 */
function isImage(name: string) {
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);
}
function isPdf(name: string) {
  return /\.pdf$/i.test(name);
}

function FileTypeIcon({ name }: { name: string }) {
  if (isImage(name)) return <ImageIcon className="w-4 h-4 text-status-info flex-shrink-0" />;
  if (isPdf(name)) return <FileText className="w-4 h-4 text-coral flex-shrink-0" />;
  return <FileIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
}

export function RfqAttachments({ rfq }: { rfq: Rfq }) {
  const { toast } = useToast();
  const { uploadFile } = useUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const urls = rfq.attachmentUrls ?? [];
  const names = rfq.attachmentFileNames ?? [];

  // The two arrays are positional, so they are always written together —
  // exactly the coupling that made the supplier arrays fragile, but here the
  // list is small, ordered and only ever replaced wholesale.
  const saveMutation = useMutation({
    mutationFn: async (next: { urls: string[]; names: string[] }) =>
      apiRequest(`/api/rfqs/${rfq.id}`, "PATCH", {
        attachmentUrls: next.urls,
        attachmentFileNames: next.names,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", rfq.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs"] });
    },
    onError: (error: any) =>
      toast({ title: "Could not save attachments", description: error.message, variant: "destructive" }),
  });

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    try {
      const uploadedUrls: string[] = [];
      const uploadedNames: string[] = [];
      for (const file of list) {
        const result = await uploadFile(file);
        if (!result) {
          toast({ title: `Could not upload ${file.name}`, variant: "destructive" });
          continue;
        }
        uploadedUrls.push(result.objectPath);
        uploadedNames.push(file.name);
      }
      if (uploadedUrls.length === 0) return;
      await saveMutation.mutateAsync({
        urls: [...urls, ...uploadedUrls],
        names: [...names, ...uploadedNames],
      });
      toast({
        title: `${uploadedUrls.length} file${uploadedUrls.length === 1 ? "" : "s"} attached`,
      });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeAt = (index: number) => {
    saveMutation.mutate({
      urls: urls.filter((_, i) => i !== index),
      names: names.filter((_, i) => i !== index),
    });
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
      }}
      data-testid="rfq-attachments"
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
        data-testid="input-rfq-attachment"
      />

      {names.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={cn(
            "w-full border-2 border-dashed rounded-lg m-3 p-6 text-center text-muted-foreground text-sm transition-colors",
            isDragging ? "border-primary bg-primary/5" : "hover:border-primary/50",
          )}
          style={{ width: "calc(100% - 1.5rem)" }}
        >
          {busy ? (
            <>
              <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
              <p>Uploading…</p>
            </>
          ) : (
            <>
              <Paperclip className="w-6 h-6 mx-auto mb-2 opacity-50" />
              <p>Drag files here or click to upload</p>
              <p className="text-xs mt-1 text-muted-foreground/60">Plans, specs, drawings</p>
            </>
          )}
        </button>
      ) : (
        <div className="p-3 space-y-1.5">
          {names.map((name, i) => (
            <div
              key={`${urls[i]}-${i}`}
              className="flex items-center gap-2 p-2 rounded bg-muted/30"
              data-testid={`row-attachment-${i}`}
            >
              <FileTypeIcon name={name} />
              <span className="text-sm flex-1 truncate" title={name}>{name}</span>
              <a
                href={urls[i]}
                download={name}
                target="_blank"
                rel="noreferrer"
                className="h-6 w-6 rounded flex items-center justify-center hover-elevate"
                title="Download"
                data-testid={`link-download-attachment-${i}`}
              >
                <Download className="w-3 h-3 text-muted-foreground" />
              </a>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => removeAt(i)}
                disabled={saveMutation.isPending}
                title="Remove"
                data-testid={`button-remove-attachment-${i}`}
              >
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
            </div>
          ))}

          <Button
            size="sm"
            variant="outline"
            className="h-6 text-xs w-full"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            data-testid="button-add-more-attachments"
          >
            {busy ? (
              <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Uploading…</>
            ) : (
              <><Upload className="w-3 h-3 mr-1" />Add files</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
