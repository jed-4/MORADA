import { useState } from "react";
import { Check, Download, ExternalLink, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCents } from "@shared/money";
import { cn } from "@/lib/utils";
import { ClientStatus } from "@/components/client/ClientPage";
import type { ClientSelectionOption } from "./ClientSelections";

/**
 * Everything the builder attached to one option, for a client deciding
 * between them: every photo (not just the first), the full description, the
 * spec table, downloadable spec sheets and the product link.
 *
 * The card can only carry a thumbnail and a line of text, which is fine for
 * scanning and useless for choosing — this is where the actual decision is
 * made, so Choose this lives here too.
 *
 * The server already sends all of it (options carry their attachments and
 * `specifications`); nothing new is fetched.
 */

type Attachment = NonNullable<ClientSelectionOption["attachments"]>[number] & {
  fileName?: string | null;
};

const isImage = (a: Attachment) => a.fileType?.toLowerCase() === "image";

export function ClientOptionDialog({
  option,
  open,
  onOpenChange,
  showPrice,
  canChoose,
  choosing,
  onChoose,
}: {
  option: ClientSelectionOption | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showPrice: boolean;
  canChoose: boolean;
  choosing: boolean;
  onChoose: () => void;
}) {
  const [activeImage, setActiveImage] = useState(0);
  if (!option) return null;

  const attachments = (option.attachments ?? []) as Attachment[];
  const images = attachments.filter(isImage);
  const documents = attachments.filter((a) => !isImage(a));
  const specs = Object.entries((option as any).specifications ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && String(v).trim() !== "",
  ) as Array<[string, unknown]>;
  const approved = !!option.approvedAt;
  const picked = !!option.isSelectedByClient;
  const hero = images[Math.min(activeImage, Math.max(images.length - 1, 0))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" data-testid="client-option-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {option.name}
            {approved ? (
              <ClientStatus label="Confirmed" tone="done" />
            ) : picked ? (
              <ClientStatus label="Your choice" tone="info" />
            ) : null}
          </DialogTitle>
          {(option.brand || option.sku) && (
            <DialogDescription>{[option.brand, option.sku].filter(Boolean).join(" · ")}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {images.length > 0 ? (
            <div className="space-y-2">
              {/* Capped, not a fixed ratio: at 4/3 the photo alone filled a
                  laptop-height dialog and pushed the specs, documents and the
                  Choose button below the fold. */}
              <img
                src={hero?.filePath ?? ""}
                alt=""
                className="w-full rounded-md border object-cover bg-muted max-h-[42vh]"
                style={{ objectPosition: `${hero?.thumbnailX ?? 50}% ${hero?.thumbnailY ?? 50}%` }}
              />
              {images.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {images.map((image, i) => (
                    <button
                      key={image.id}
                      onClick={() => setActiveImage(i)}
                      className={cn(
                        "h-14 w-14 rounded-md overflow-hidden border-2",
                        i === activeImage ? "border-primary" : "border-transparent",
                      )}
                      aria-label={`Photo ${i + 1}`}
                      data-testid={`button-option-photo-${i}`}
                    >
                      <img src={image.filePath ?? ""} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="w-full rounded-md border bg-muted h-40 flex items-center justify-center">
              <ImageIcon className="h-7 w-7 text-muted-foreground/50" />
            </div>
          )}

          {option.description && <p className="text-sm whitespace-pre-wrap">{option.description}</p>}

          {specs.length > 0 && (
            <div className="rounded-md border divide-y">
              {specs.map(([key, value]) => (
                <div key={key} className="flex justify-between gap-4 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{key}</span>
                  <span className="text-right">{String(value)}</span>
                </div>
              ))}
            </div>
          )}

          {documents.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Documents</p>
              {documents.map((doc) => (
                <a
                  key={doc.id}
                  href={doc.filePath ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                  data-testid={`link-option-doc-${doc.id}`}
                >
                  <Download className="h-3.5 w-3.5" />
                  {doc.fileName || "Specification"}
                </a>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {option.url ? (
              <a
                href={option.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
              >
                View on the supplier's site <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <span />
            )}
            {showPrice && option.totalCost != null && (
              <span className="text-base font-semibold tabular-nums">{formatCents(option.totalCost)}</span>
            )}
          </div>

          {canChoose && !approved && (
            <Button
              className="w-full"
              variant={picked ? "outline" : "default"}
              disabled={choosing || picked}
              onClick={onChoose}
              data-testid="button-choose-in-dialog"
            >
              {choosing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {picked ? <><Check className="h-4 w-4 mr-2" />Chosen</> : "Choose this"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
