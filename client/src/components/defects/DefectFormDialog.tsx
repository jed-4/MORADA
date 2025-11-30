import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useParams } from "wouter";
import { insertDefectSchema, type Defect, type InsertDefect } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { useDefectStatusOptions } from "@/hooks/useDefectStatusOptions";
import { useDefectPriorityOptions } from "@/hooks/useDefectPriorityOptions";
import { useDefectTypeOptions } from "@/hooks/useDefectTypeOptions";
import { useDefectTradeOptions } from "@/hooks/useDefectTradeOptions";
import { Upload, X, Image as ImageIcon, Bell } from "lucide-react";
import { SetReminderDialog } from "@/components/SetReminderDialog";

interface DefectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defect?: Defect;
}

export function DefectFormDialog({ open, onOpenChange, defect }: DefectFormDialogProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Array<{ url: string; name: string; file?: File }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  
  const { statusOptions } = useDefectStatusOptions();
  const { priorityOptions } = useDefectPriorityOptions();
  const { typeOptions } = useDefectTypeOptions();
  const tradeOptions = useDefectTradeOptions();

  const getDefaultValues = (): Partial<InsertDefect> => ({
    projectId: projectId || "",
    title: "",
    description: "",
    location: "",
    status: (statusOptions[0]?.key as InsertDefect["status"]) || "open",
    priority: (priorityOptions[0]?.key as InsertDefect["priority"]) || "medium",
    type: (typeOptions[0]?.key as InsertDefect["type"]) || "builder",
    trade: "",
  });

  const form = useForm<InsertDefect>({
    resolver: zodResolver(insertDefectSchema),
    defaultValues: getDefaultValues(),
  });

  useEffect(() => {
    if (open) {
      if (defect) {
        form.reset({
          projectId: defect.projectId,
          title: defect.title,
          description: defect.description || "",
          location: defect.location || "",
          status: defect.status as InsertDefect["status"],
          priority: defect.priority as InsertDefect["priority"],
          type: defect.type as InsertDefect["type"],
          trade: defect.trade || "",
          notes: defect.notes || "",
          assignedContactId: defect.assignedContactId || undefined,
          assignedContactName: defect.assignedContactName || undefined,
          dueDate: defect.dueDate || undefined,
          dateIdentified: defect.dateIdentified || undefined,
        });
        const existingAttachments = (defect.attachments as Array<{ url: string; name: string }>) || [];
        setPhotos(existingAttachments);
      } else {
        form.reset(getDefaultValues());
        setPhotos([]);
      }
    }
  }, [open, defect, projectId, statusOptions, priorityOptions, typeOptions]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const newPhotos: Array<{ url: string; name: string; file?: File }> = [];
      
      for (const file of Array.from(files)) {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        
        newPhotos.push({
          url: dataUrl,
          name: file.name,
          file,
        });
      }
      
      setPhotos(prev => [...prev, ...newPhotos]);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to upload photos",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const createMutation = useMutation({
    mutationFn: async (data: InsertDefect) => {
      const attachments = photos.map(p => ({ url: p.url, name: p.name }));
      return apiRequest("/api/defects", "POST", { ...data, attachments });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/defects"] });
      toast({
        title: "Success",
        description: "Defect created successfully",
      });
      onOpenChange(false);
      form.reset();
      setPhotos([]);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create defect",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: InsertDefect) => {
      const attachments = photos.map(p => ({ url: p.url, name: p.name }));
      return apiRequest(`/api/defects/${defect?.id}`, "PATCH", { ...data, attachments });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/defects"] });
      toast({
        title: "Success",
        description: "Defect updated successfully",
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update defect",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertDefect) => {
    if (defect) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title">
            {defect ? "Edit Defect" : "Create Defect"}
          </DialogTitle>
          <DialogDescription>
            {defect ? "Update the details of this defect." : "Record a new defect for this project."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Brief description of the defect"
                      data-testid="input-title"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {statusOptions.map((option) => (
                          <SelectItem
                            key={option.key}
                            value={option.key}
                            data-testid={`select-item-status-${option.key}`}
                          >
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-priority">
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {priorityOptions.map((option) => (
                          <SelectItem
                            key={option.key}
                            value={option.key}
                            data-testid={`select-item-priority-${option.key}`}
                          >
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {typeOptions.map((option) => (
                          <SelectItem
                            key={option.key}
                            value={option.key}
                            data-testid={`select-item-type-${option.key}`}
                          >
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="trade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trade</FormLabel>
                    <Select 
                      onValueChange={(val) => field.onChange(val === "__none__" ? "" : val)} 
                      value={field.value || "__none__"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-trade">
                          <SelectValue placeholder="Select trade" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__" data-testid="select-item-trade-none">
                          No trade
                        </SelectItem>
                        {tradeOptions.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            data-testid={`select-item-trade-${option.value}`}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value || ""}
                      placeholder="e.g., Kitchen, Bathroom 2, Upstairs hallway"
                      data-testid="input-location"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value || ""}
                      placeholder="Detailed description of the defect"
                      rows={4}
                      data-testid="input-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Photos Section */}
            <div className="space-y-2">
              <Label>Photos</Label>
              <div className="flex flex-wrap gap-2">
                {photos.map((photo, index) => (
                  <div 
                    key={index} 
                    className="relative w-20 h-20 rounded-md overflow-hidden border bg-muted group"
                  >
                    <img 
                      src={photo.url} 
                      alt={photo.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      data-testid={`button-remove-photo-${index}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                
                {/* Upload Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-20 h-20 rounded-md border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 hover:border-muted-foreground/50 hover:bg-muted/50 transition-colors"
                  data-testid="button-upload-photo"
                >
                  {isUploading ? (
                    <span className="text-[10px] text-muted-foreground">Uploading...</span>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">Add Photo</span>
                    </>
                  )}
                </button>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className="hidden"
                  data-testid="input-photo-upload"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Upload photos of the defect to help document the issue.
              </p>
            </div>

            <DialogFooter className="gap-2">
              {defect && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowReminderDialog(true)}
                  className="mr-auto"
                  data-testid="button-set-reminder"
                >
                  <Bell className="h-4 w-4 mr-1.5" />
                  Set Reminder
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-submit">
                {isPending ? "Saving..." : defect ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>

      {/* Set Reminder Dialog */}
      <SetReminderDialog
        open={showReminderDialog}
        onOpenChange={setShowReminderDialog}
        linkedItemType="defect"
        linkedItemId={defect?.id}
        linkedItemTitle={defect?.title}
        projectId={projectId}
      />
    </Dialog>
  );
}
