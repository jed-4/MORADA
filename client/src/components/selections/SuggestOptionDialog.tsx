import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface SuggestedOption {
  name: string;
  url?: string;
  description?: string;
  /** Data URL of one photo, if they added one. */
  photo?: string;
  photoName?: string;
  /** The public link has no account, so it asks who is suggesting. */
  clientName?: string;
}

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * A client suggests an option — a product they found — on a selection where
 * the builder allows it. No price: that's the builder's to add once they've
 * looked at it. Used by the logged-in client portal and the public link.
 */
export function SuggestOptionDialog({
  open,
  onOpenChange,
  onSubmit,
  submitting,
  askName = false,
  defaultName = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: SuggestedOption) => void;
  submitting: boolean;
  askName?: boolean;
  defaultName?: string;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [clientName, setClientName] = useState(defaultName);
  const [photo, setPhoto] = useState<{ dataUrl: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setUrl("");
      setDescription("");
      setPhoto(null);
      setError(null);
      setClientName(defaultName);
    }
  }, [open, defaultName]);

  const pickPhoto = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("The photo must be an image.");
    if (file.size > MAX_PHOTO_BYTES) return setError("That photo is over 10 MB.");
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setPhoto({ dataUrl: String(reader.result), name: file.name });
    reader.readAsDataURL(file);
  };

  const submit = () => {
    const trimmedUrl = url.trim();
    if (!name.trim()) return setError("Give it a name — what is it?");
    if (trimmedUrl && !/^https?:\/\//i.test(trimmedUrl)) return setError("The link must start with http:// or https://");
    if (askName && !clientName.trim()) return setError("Please add your name so your builder knows who it's from.");
    setError(null);
    onSubmit({
      name: name.trim(),
      url: trimmedUrl || undefined,
      description: description.trim() || undefined,
      photo: photo?.dataUrl,
      photoName: photo?.name,
      clientName: askName ? clientName.trim() : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="suggest-option-dialog">
        <DialogHeader>
          <DialogTitle>Suggest an option</DialogTitle>
          <DialogDescription>
            Found something you like? Add it here and your builder will take a look and price it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {askName && (
            <div className="space-y-1.5">
              <Label htmlFor="suggest-who">Your name</Label>
              <Input id="suggest-who" value={clientName} onChange={(e) => setClientName(e.target.value)} data-testid="input-suggest-who" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="suggest-name">What is it?</Label>
            <Input id="suggest-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Brushed brass basin mixer" maxLength={200} data-testid="input-suggest-name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="suggest-url">Link (optional)</Label>
            <Input id="suggest-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" data-testid="input-suggest-url" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="suggest-notes">Notes (optional)</Label>
            <Textarea id="suggest-notes" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} placeholder="Colour, size, where you saw it…" data-testid="input-suggest-notes" />
          </div>
          <div className="space-y-1.5">
            <Label>Photo (optional)</Label>
            {photo ? (
              <div className="relative w-24 h-24 rounded-md overflow-hidden border">
                <img src={photo.dataUrl} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                  onClick={() => setPhoto(null)}
                  aria-label="Remove photo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} data-testid="button-suggest-photo">
                <ImagePlus className="w-4 h-4 mr-1.5" />
                Add a photo
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }}
            />
          </div>
          {error && <p className="text-sm text-destructive" data-testid="text-suggest-error">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} data-testid="button-suggest-submit">
            {submitting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Send suggestion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
