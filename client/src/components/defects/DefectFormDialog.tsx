import { useEffect, useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useParams } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { useDefectPriorityOptions } from "@/hooks/useDefectPriorityOptions";
import { useDefectTypeOptions } from "@/hooks/useDefectTypeOptions";
import { useDefectTradeOptions } from "@/hooks/useDefectTradeOptions";
import { Upload, X } from "lucide-react";
import {
  DEFECT_DEFAULT_DUE_DAYS,
  DEFECT_JOB_STAGES,
  DEFECT_JOB_STAGE_LABELS,
  type DefectJobStage,
} from "@shared/defects";
import { invalidateDefectQueries } from "./defectStyles";
import { useDefectPermissions, useTeamUsers } from "./defectHooks";
import { DefectLocationPicker } from "./DefectLocationPicker";
import { OwnerSelect } from "./DefectDrawer";

interface DefectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Defaults to the route's project. */
  projectId?: string;
}

const NONE = "__none__";

type Photo = { url: string; name: string; type?: string; preview: string };

/**
 * Raise a defect. Editing happens in the drawer; this is create only.
 * Photos upload to object storage first, then the paths go with the defect.
 */
export function DefectFormDialog({ open, onOpenChange, projectId: projectIdProp }: DefectFormDialogProps) {
  const params = useParams<{ projectId: string }>();
  const projectId = projectIdProp ?? params.projectId;
  const { toast } = useToast();
  const perms = useDefectPermissions();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload();

  const { priorityOptions } = useDefectPriorityOptions();
  const { typeOptions } = useDefectTypeOptions();
  const tradeOptions = useDefectTradeOptions();
  const teamUsers = useTeamUsers();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [type, setType] = useState("builder");
  const [trade, setTrade] = useState("");
  const [jobStage, setJobStage] = useState<DefectJobStage>("construction");
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [location, setLocation] = useState<{ id: string | null; path: string | null }>({ id: null, path: null });
  const [dueDate, setDueDate] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setPriority(priorityOptions.find((o: any) => o.isDefault)?.key ?? priorityOptions[0]?.key ?? "medium");
    setType(typeOptions.find((o: any) => o.isDefault)?.key ?? typeOptions[0]?.key ?? "builder");
    setTrade("");
    setDueDate("");
    setPhotos([]);
    // Location, owner and job stage stay as they were — raising several in a
    // row on a walkthrough usually means the same room and the same person.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      const r = await uploadFile(f);
      if (r?.objectPath) {
        setPhotos((p) => [...p, { url: r.objectPath, name: f.name, type: f.type || undefined, preview: URL.createObjectURL(f) }]);
      } else {
        toast({ title: `Couldn't upload ${f.name}`, variant: "destructive" });
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/projects/${projectId}/defects`, "POST", {
        title: title.trim() || undefined,
        description: description.trim() || null,
        priority,
        type,
        trade: trade || null,
        jobStage,
        ownerUserId,
        locationId: location.id,
        ...(dueDate ? { dueDate: new Date(`${dueDate}T00:00:00`).toISOString() } : {}),
        clientRequestId: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        photos: photos.map((p) => ({ url: p.url, name: p.name, type: p.type, kind: "before" as const })),
      }),
    onSuccess: (d: any) => {
      invalidateDefectQueries(queryClient);
      toast({ title: `${d?.ref ?? "Defect"} raised` });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't create the defect",
        description: error?.payload?.details || error?.payload?.error || error?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const busy = createMutation.isPending || isUploading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title">Raise a defect</DialogTitle>
          <DialogDescription>Record a new defect for this project.</DialogDescription>
        </DialogHeader>

        {!projectId ? (
          <p className="text-sm text-muted-foreground">Open a project to raise a defect.</p>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={location.path ? `Defect at ${location.path}` : "Brief description of the defect"}
                data-testid="input-title"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Location</Label>
                <DefectLocationPicker
                  projectId={projectId}
                  value={location.id}
                  canAdd={perms.add}
                  onChange={(id, path) => setLocation({ id, path })}
                  testId="input-location"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Job stage</Label>
                <Select value={jobStage} onValueChange={(v) => setJobStage(v as DefectJobStage)}>
                  <SelectTrigger data-testid="select-job-stage"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEFECT_JOB_STAGES.map((js) => (
                      <SelectItem key={js} value={js}>{DEFECT_JOB_STAGE_LABELS[js]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Owner</Label>
                <OwnerSelect users={teamUsers} value={ownerUserId} onChange={setOwnerUserId} testId="select-owner" />
              </div>
              <div className="space-y-1.5">
                <Label>Due</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  data-testid="input-due-date"
                />
                {!dueDate && (
                  <p className="text-[11px] text-muted-foreground">
                    Defaults to {DEFECT_DEFAULT_DUE_DAYS[jobStage]} days for {DEFECT_JOB_STAGE_LABELS[jobStage].toLowerCase()}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger data-testid="select-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {priorityOptions.map((o) => <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger data-testid="select-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((o) => <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Trade</Label>
                <Select value={trade || NONE} onValueChange={(v) => setTrade(v === NONE ? "" : v)}>
                  <SelectTrigger data-testid="select-trade"><SelectValue placeholder="No trade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No trade</SelectItem>
                    {tradeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detailed description of the defect"
                rows={3}
                data-testid="input-description"
              />
            </div>

            <div className="space-y-2">
              <Label>Photos</Label>
              <div className="flex flex-wrap gap-2">
                {photos.map((photo, index) => (
                  <div key={photo.url} className="relative w-20 h-20 rounded-md overflow-hidden border bg-muted group">
                    <img src={photo.preview} alt={photo.name} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotos((p) => p.filter((_, i) => i !== index))}
                      className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      data-testid={`button-remove-photo-${index}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-20 h-20 rounded-md border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 hover:border-muted-foreground/50 hover:bg-muted/50 transition-colors"
                  data-testid="button-upload-photo"
                >
                  <Upload className="w-4 h-4 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">{isUploading ? "Uploading..." : "Add Photo"}</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => onFiles(e.target.files)}
                  className="hidden"
                  data-testid="input-photo-upload"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending} data-testid="button-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={busy} data-testid="button-submit">
                {createMutation.isPending ? "Saving..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
