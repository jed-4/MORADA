import { useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useUpload } from "@/hooks/use-upload";
import { useToast } from "@/hooks/use-toast";
import { COVER_TEMPLATES, coverTemplateOf, type CoverTemplate } from "./pdf/coverTemplates";
import type { ProposalSection } from "@shared/schema";

interface Props {
  section: ProposalSection;
  content: Record<string, any>;
  setContent: (content: Record<string, any>) => void;
  documentStyle?: "style1" | "style2";
}

/** Images a cover can carry. HEIC and friends will not render in a PDF. */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Which of the three covers this proposal uses, and the image the Photo one
 * needs.
 *
 * The descriptions are not decoration. The names alone ("Feature", "Photo")
 * do not tell a builder what they are choosing, and the cost of finding out is
 * a rebuild of the preview — so each one says what the page will look like and
 * what it asks of them.
 */
export function CoverTemplatePicker({ section, content, setContent, documentStyle }: Props) {
  const { toast } = useToast();
  const { uploadFile, isUploading } = useUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const selected: CoverTemplate = coverTemplateOf(
    { ...section, content } as ProposalSection,
    documentStyle,
  );
  const imagePath = typeof content.imagePath === "string" ? content.imagePath : null;
  const imageName = typeof content.imageName === "string" ? content.imageName : null;

  const handleFile = async (file: File) => {
    if (!ACCEPTED.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "That image will not print",
        description: "Use a JPEG, PNG or WebP — a PDF cannot embed anything else.",
      });
      return;
    }
    setBusy(true);
    try {
      const result = await uploadFile(file);
      // uploadFile resolves null when the upload fails; it has already said
      // why, so this only declines to store a path that leads nowhere.
      if (!result) return;
      setContent({ ...content, imagePath: result.objectPath, imageName: file.name });
    } finally {
      setBusy(false);
    }
  };

  const uploading = isUploading || busy;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Cover layout</Label>
        <div className="space-y-1.5">
          {COVER_TEMPLATES.map((template) => {
            const isSelected = template.value === selected;
            return (
              <button
                key={template.value}
                type="button"
                onClick={() => setContent({ ...content, template: template.value })}
                className={`w-full text-left rounded-md border p-2.5 hover-elevate active-elevate-2 ${
                  isSelected ? "border-primary ring-1 ring-primary/40" : "border-border"
                }`}
                data-testid={`button-cover-template-${template.value}`}
              >
                <p className="text-xs font-medium">{template.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {template.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {selected === "photo" && (
        <div className="space-y-2">
          <Label>Cover image</Label>
          {imagePath ? (
            <div className="flex items-center gap-2 rounded-md border p-2">
              <ImageIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <p className="text-xs truncate flex-1 min-w-0">{imageName || "Uploaded image"}</p>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 flex-shrink-0"
                onClick={() => setContent({ ...content, imagePath: undefined, imageName: undefined })}
                aria-label="Remove cover image"
                data-testid="button-remove-cover-image"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              A render, a site photo, or a finished job. It bleeds to the page edges, so use the
              largest version you have — anything under about 1600px wide will look soft in print.
            </p>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset first: picking the same file twice must still fire onChange.
              e.target.value = "";
              if (file) void handleFile(file);
            }}
            data-testid="input-cover-image"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            data-testid="button-upload-cover-image"
          >
            {uploading ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Upload className="w-3 h-3 mr-1" />
            )}
            {uploading ? "Uploading…" : imagePath ? "Replace image" : "Choose image"}
          </Button>
        </div>
      )}
    </div>
  );
}
