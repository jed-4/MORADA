import { useState, useImperativeHandle, forwardRef, useRef, useEffect } from "react";
import { format } from "date-fns";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, FileText, MoreVertical, Pencil, Trash2, FormInput, FileSpreadsheet, GripVertical, X, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { NoteTemplate, NoteTemplateField } from "@shared/schema";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableFieldRowProps {
  field: Partial<NoteTemplateField>;
  fieldId: string;
  onEdit: () => void;
  onRemove: () => void;
}

function SortableFieldRow({ field, fieldId, onEdit, onRemove }: SortableFieldRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: fieldId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 150ms cubic-bezier(0.25, 0.1, 0.25, 1)',
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 bg-muted/50 rounded-md ${isDragging ? 'shadow-lg bg-background' : ''}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
        data-testid={`drag-handle-field-${fieldId}`}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate">{field.label || 'Untitled'}</span>
        <Badge variant="outline" className="ml-2 h-5 text-[10px] no-default-hover-elevate no-default-active-elevate">
          {FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}
        </Badge>
        {field.required && (
          <Badge variant="secondary" className="ml-1 h-5 text-[10px]">
            Required
          </Badge>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={onEdit}
        data-testid={`button-edit-field-${fieldId}`}
      >
        <Pencil className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-destructive"
        onClick={onRemove}
        data-testid={`button-remove-field-${fieldId}`}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

export interface NoteTemplatesLibraryHandle {
  openNewTemplateDialog: () => void;
}

interface NoteTemplatesLibraryProps {
  searchQuery?: string;
}

const FIELD_TYPES = [
  { value: "text", label: "Text (Single Line)" },
  { value: "textarea", label: "Text (Multi-line)" },
  { value: "select", label: "Dropdown" },
  { value: "date", label: "Date" },
  { value: "checkbox", label: "Checkbox" },
  { value: "number", label: "Number" },
] as const;

interface FieldWithId extends Partial<NoteTemplateField> {
  _tempId: string;
}

export const NoteTemplatesLibrary = forwardRef<NoteTemplatesLibraryHandle, NoteTemplatesLibraryProps>(
  ({ searchQuery = "" }, ref) => {
    const { toast } = useToast();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<NoteTemplate | null>(null);
    const [templateName, setTemplateName] = useState("");
    const [templateDescription, setTemplateDescription] = useState("");
    const [isFormBased, setIsFormBased] = useState(true);
    const [templateFields, setTemplateFields] = useState<FieldWithId[]>([]);
    const [isFieldDialogOpen, setIsFieldDialogOpen] = useState(false);
    const [editingField, setEditingField] = useState<Partial<NoteTemplateField> | null>(null);
    const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(null);
    const [isLoadingFields, setIsLoadingFields] = useState(false);
    const fieldIdCounter = useRef(0);
    
    const generateFieldId = () => {
      fieldIdCounter.current += 1;
      return `field-${Date.now()}-${fieldIdCounter.current}`;
    };

    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: {
          distance: 5,
        },
      }),
      useSensor(KeyboardSensor, {
        coordinateGetter: sortableKeyboardCoordinates,
      })
    );

    const handleFieldDragEnd = (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = templateFields.findIndex((f) => f._tempId === active.id);
        const newIndex = templateFields.findIndex((f) => f._tempId === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          setTemplateFields(arrayMove(templateFields, oldIndex, newIndex));
        }
      }
    };

    const { data: templates = [], isLoading } = useQuery<NoteTemplate[]>({
      queryKey: ["/api/note-templates"],
    });

    const filteredTemplates = templates.filter(template =>
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (template.description?.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const createTemplateMutation = useMutation({
      mutationFn: async (data: any) => {
        return apiRequest("/api/note-templates", "POST", data);
      },
      onSuccess: async (template: NoteTemplate) => {
        if (isFormBased && templateFields.length > 0) {
          for (let i = 0; i < templateFields.length; i++) {
            const field = templateFields[i];
            await apiRequest(`/api/note-templates/${template.id}/fields`, "POST", {
              ...field,
              order: i,
            });
          }
        }
        queryClient.invalidateQueries({ queryKey: ["/api/note-templates"] });
        toast({ title: "Template created successfully" });
        resetForm();
      },
      onError: () => {
        toast({ title: "Failed to create template", variant: "destructive" });
      },
    });

    const updateTemplateMutation = useMutation({
      mutationFn: async ({ id, data }: { id: string; data: any }) => {
        return apiRequest(`/api/note-templates/${id}`, "PATCH", data);
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/note-templates"] });
        toast({ title: "Template updated successfully" });
        resetForm();
      },
      onError: () => {
        toast({ title: "Failed to update template", variant: "destructive" });
      },
    });

    const deleteTemplateMutation = useMutation({
      mutationFn: async (id: string) => {
        return apiRequest(`/api/note-templates/${id}`, "DELETE");
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/note-templates"] });
        toast({ title: "Template deleted successfully" });
      },
      onError: () => {
        toast({ title: "Failed to delete template", variant: "destructive" });
      },
    });

    const duplicateTemplateMutation = useMutation({
      mutationFn: async (template: NoteTemplate) => {
        const newTemplate = await apiRequest("/api/note-templates", "POST", {
          name: `${template.name} (Copy)`,
          description: template.description,
          isFormBased: template.isFormBased,
          defaultTitle: template.defaultTitle,
          contentHtml: template.contentHtml,
          contentText: template.contentText,
          defaultCustomFields: template.defaultCustomFields,
        });
        if (template.isFormBased) {
          const fieldsResponse = await fetch(`/api/note-templates/${template.id}/fields`, {
            credentials: "include",
          });
          if (fieldsResponse.ok) {
            const fields = await fieldsResponse.json();
            for (const field of fields) {
              await apiRequest(`/api/note-templates/${newTemplate.id}/fields`, "POST", {
                key: field.key,
                label: field.label,
                type: field.type,
                description: field.description,
                placeholder: field.placeholder,
                required: field.required,
                order: field.order,
                options: field.options,
                defaultValue: field.defaultValue,
              });
            }
          }
        }
        return newTemplate;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/note-templates"] });
        toast({ title: "Template duplicated successfully" });
      },
      onError: () => {
        toast({ title: "Failed to duplicate template", variant: "destructive" });
      },
    });

    const resetForm = () => {
      setIsDialogOpen(false);
      setEditingTemplate(null);
      setTemplateName("");
      setTemplateDescription("");
      setIsFormBased(true);
      setTemplateFields([]);
      setIsLoadingFields(false);
    };

    const openNewTemplateDialog = () => {
      resetForm();
      setIsDialogOpen(true);
    };

    const openEditDialog = async (template: NoteTemplate) => {
      setEditingTemplate(template);
      setTemplateName(template.name);
      setTemplateDescription(template.description || "");
      setIsFormBased(template.isFormBased);
      setTemplateFields([]);
      setIsDialogOpen(true);
      
      if (template.isFormBased) {
        setIsLoadingFields(true);
        try {
          const response = await fetch(`/api/note-templates/${template.id}/fields`, {
            credentials: "include",
          });
          if (response.ok) {
            const fields = await response.json();
            const sortedFields = [...fields].sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
            const fieldsWithIds: FieldWithId[] = sortedFields.map((field: any, idx: number) => ({
              ...field,
              _tempId: `existing-${field.id || idx}`,
            }));
            setTemplateFields(fieldsWithIds);
          }
        } catch (error) {
          console.error("Failed to load template fields:", error);
          toast({ title: "Failed to load template fields", variant: "destructive" });
        } finally {
          setIsLoadingFields(false);
        }
      }
    };

    const handleSubmit = async () => {
      if (!templateName.trim()) {
        toast({ title: "Template name is required", variant: "destructive" });
        return;
      }

      const data = {
        name: templateName.trim(),
        description: templateDescription.trim() || undefined,
        isFormBased,
      };

      if (editingTemplate) {
        await apiRequest(`/api/note-templates/${editingTemplate.id}`, "PATCH", data);
        
        if (isFormBased) {
          const existingResponse = await fetch(`/api/note-templates/${editingTemplate.id}/fields`, {
            credentials: "include",
          });
          const existingFields = existingResponse.ok ? await existingResponse.json() : [];
          
          for (const existingField of existingFields) {
            await apiRequest(`/api/note-templates/${editingTemplate.id}/fields/${existingField.id}`, "DELETE");
          }
          
          for (let i = 0; i < templateFields.length; i++) {
            const field = templateFields[i];
            await apiRequest(`/api/note-templates/${editingTemplate.id}/fields`, "POST", {
              key: field.key,
              label: field.label,
              type: field.type,
              description: field.description,
              placeholder: field.placeholder,
              required: field.required,
              order: i,
              options: field.options,
              defaultValue: field.defaultValue,
            });
          }
        }
        
        queryClient.invalidateQueries({ queryKey: ["/api/note-templates"] });
        toast({ title: "Template updated successfully" });
        resetForm();
      } else {
        createTemplateMutation.mutate(data);
      }
    };

    const addField = () => {
      setEditingField({
        key: "",
        label: "",
        type: "text",
        description: "",
        placeholder: "",
        required: false,
        options: [],
      });
      setEditingFieldIndex(null);
      setIsFieldDialogOpen(true);
    };

    const editField = (field: Partial<NoteTemplateField>, index: number) => {
      setEditingField({ ...field });
      setEditingFieldIndex(index);
      setIsFieldDialogOpen(true);
    };

    const saveField = () => {
      if (!editingField?.label?.trim()) {
        toast({ title: "Field label is required", variant: "destructive" });
        return;
      }

      const key = editingField.key || editingField.label.toLowerCase().replace(/\s+/g, "_");

      if (editingFieldIndex !== null) {
        const newFields = [...templateFields];
        newFields[editingFieldIndex] = { 
          ...editingField, 
          key,
          _tempId: templateFields[editingFieldIndex]._tempId 
        };
        setTemplateFields(newFields);
      } else {
        const fieldData: FieldWithId = { 
          ...editingField, 
          key, 
          _tempId: generateFieldId() 
        };
        setTemplateFields([...templateFields, fieldData]);
      }

      setIsFieldDialogOpen(false);
      setEditingField(null);
      setEditingFieldIndex(null);
    };

    const removeField = (index: number) => {
      setTemplateFields(templateFields.filter((_, i) => i !== index));
    };

    useImperativeHandle(ref, () => ({
      openNewTemplateDialog,
    }));

    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Loading templates...
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col">
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {filteredTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">No note templates yet</h3>
                <p className="text-sm text-muted-foreground/70 mb-4">
                  Create templates to standardize your notes
                </p>
                <Button
                  size="sm"
                  className="bg-[#bba7db] text-white hover:bg-[#bba7db]/90"
                  onClick={openNewTemplateDialog}
                  data-testid="button-create-first-template"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Create Template
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTemplates.map((template) => (
                  <div 
                    key={template.id} 
                    className="group border rounded-md p-2 bg-card hover-elevate transition-all cursor-pointer"
                    onClick={() => openEditDialog(template)}
                    data-testid={`card-template-${template.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm mb-1 line-clamp-1">
                          {template.name}
                        </h3>
                        {template.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {template.description}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {template.isFormBased ? (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                            <FormInput className="h-3 w-3 mr-0.5" />
                            Form
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                            <FileSpreadsheet className="h-3 w-3 mr-0.5" />
                            Content
                          </Badge>
                        )}

                        {template.isActive ? (
                          <Badge variant="outline" className="h-4 px-1.5 text-[10px] text-green-600">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="h-4 px-1.5 text-[10px] text-muted-foreground">
                            Inactive
                          </Badge>
                        )}

                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span>
                            {format(new Date(template.updatedAt), "MMM d, yyyy")}
                          </span>
                        </div>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`button-menu-${template.id}`}
                            >
                              <MoreVertical className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditDialog(template);
                              }}
                              data-testid={`button-edit-${template.id}`}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                duplicateTemplateMutation.mutate(template);
                              }}
                              data-testid={`button-duplicate-${template.id}`}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteTemplateMutation.mutate(template.id);
                              }}
                              className="text-destructive"
                              data-testid={`button-delete-${template.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? "Edit Note Template" : "Create Note Template"}
              </DialogTitle>
            </DialogHeader>

            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="template-name">Template Name</Label>
                  <Input
                    id="template-name"
                    placeholder="e.g., Site Visit Report"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    data-testid="input-template-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template-description">Description</Label>
                  <Textarea
                    id="template-description"
                    placeholder="Describe when to use this template..."
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    rows={2}
                    data-testid="input-template-description"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Form-based Template</Label>
                    <p className="text-xs text-muted-foreground">
                      Define fields that users will fill in
                    </p>
                  </div>
                  <Switch
                    checked={isFormBased}
                    onCheckedChange={setIsFormBased}
                    data-testid="switch-form-based"
                  />
                </div>

                {isFormBased && (
                  <div className="space-y-2 border rounded-md p-3">
                    <div className="flex items-center justify-between">
                      <Label>Template Fields</Label>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={addField}
                        disabled={isLoadingFields}
                        data-testid="button-add-field"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Field
                      </Button>
                    </div>

                    {isLoadingFields ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Loading fields...
                      </p>
                    ) : templateFields.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No fields added yet. Click "Add Field" to define form fields.
                      </p>
                    ) : (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleFieldDragEnd}
                      >
                        <SortableContext 
                          items={templateFields.map((f) => f._tempId)} 
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-2">
                            {templateFields.map((field, index) => (
                              <SortableFieldRow
                                key={field._tempId}
                                field={field}
                                fieldId={field._tempId}
                                onEdit={() => editField(field, index)}
                                onRemove={() => removeField(index)}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button
                className="bg-[#bba7db] text-white hover:bg-[#bba7db]/90"
                onClick={handleSubmit}
                disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending || isLoadingFields}
                data-testid="button-save-template"
              >
                {editingTemplate ? "Update" : "Create"} Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <FieldEditDialog
          isOpen={isFieldDialogOpen}
          onClose={() => {
            setIsFieldDialogOpen(false);
            setEditingField(null);
            setEditingFieldIndex(null);
          }}
          field={editingField}
          onFieldChange={setEditingField}
          onSave={saveField}
        />
      </div>
    );
  }
);

NoteTemplatesLibrary.displayName = "NoteTemplatesLibrary";

function TemplateFieldsList({ templateId }: { templateId: string }) {
  const { data: result, isLoading } = useQuery<{ template: NoteTemplate; fields: NoteTemplateField[] }>({
    queryKey: ["/api/note-templates", templateId, { includeFields: "true" }],
    queryFn: async () => {
      const response = await fetch(`/api/note-templates/${templateId}?includeFields=true`);
      if (!response.ok) throw new Error("Failed to fetch template");
      return response.json();
    },
  });

  if (isLoading) {
    return <div className="py-2 text-sm text-muted-foreground">Loading fields...</div>;
  }

  const fields = result?.fields || [];

  if (fields.length === 0) {
    return (
      <div className="py-2 text-sm text-muted-foreground">
        No fields defined for this template.
      </div>
    );
  }

  return (
    <div className="py-2 space-y-1">
      <div className="text-xs font-medium text-muted-foreground mb-2">Template Fields:</div>
      {fields.map((field) => (
        <div key={field.id} className="flex items-center gap-2 text-sm">
          <span className="font-medium">{field.label}</span>
          <Badge variant="outline" className="h-5 text-[10px] no-default-hover-elevate no-default-active-elevate">
            {FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}
          </Badge>
          {field.required && (
            <Badge variant="secondary" className="h-5 text-[10px]">Required</Badge>
          )}
        </div>
      ))}
    </div>
  );
}

function FieldEditDialog({
  isOpen,
  onClose,
  field,
  onFieldChange,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  field: Partial<NoteTemplateField> | null;
  onFieldChange: (field: Partial<NoteTemplateField> | null) => void;
  onSave: () => void;
}) {
  const [optionText, setOptionText] = useState("");

  if (!field) return null;

  const addOption = () => {
    if (!optionText.trim()) return;
    const options = (field.options as { value: string; label: string }[]) || [];
    onFieldChange({
      ...field,
      options: [...options, { value: optionText.toLowerCase().replace(/\s+/g, "_"), label: optionText }],
    });
    setOptionText("");
  };

  const removeOption = (index: number) => {
    const options = (field.options as { value: string; label: string }[]) || [];
    onFieldChange({
      ...field,
      options: options.filter((_, i) => i !== index),
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {field.id ? "Edit Field" : "Add Field"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="field-label">Field Label</Label>
            <Input
              id="field-label"
              placeholder="e.g., Weather Conditions"
              value={field.label || ""}
              onChange={(e) => onFieldChange({ ...field, label: e.target.value })}
              data-testid="input-field-label"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="field-type">Field Type</Label>
            <Select
              value={field.type || "text"}
              onValueChange={(value) => onFieldChange({ ...field, type: value as any })}
            >
              <SelectTrigger id="field-type" data-testid="select-field-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="field-description">Help Text (Optional)</Label>
            <Input
              id="field-description"
              placeholder="Instructions for this field..."
              value={field.description || ""}
              onChange={(e) => onFieldChange({ ...field, description: e.target.value })}
              data-testid="input-field-description"
            />
          </div>

          {(field.type === "text" || field.type === "textarea" || field.type === "number") && (
            <div className="space-y-2">
              <Label htmlFor="field-placeholder">Placeholder (Optional)</Label>
              <Input
                id="field-placeholder"
                placeholder="Placeholder text..."
                value={field.placeholder || ""}
                onChange={(e) => onFieldChange({ ...field, placeholder: e.target.value })}
                data-testid="input-field-placeholder"
              />
            </div>
          )}

          {field.type === "select" && (
            <div className="space-y-2">
              <Label>Dropdown Options</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add option..."
                  value={optionText}
                  onChange={(e) => setOptionText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption())}
                  data-testid="input-option-text"
                />
                <Button variant="outline" size="sm" onClick={addOption} data-testid="button-add-option">
                  Add
                </Button>
              </div>
              <div className="space-y-1">
                {((field.options as { value: string; label: string }[]) || []).map((option, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                    <span className="flex-1 text-sm">{option.label}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => removeOption(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Switch
              id="field-required"
              checked={field.required || false}
              onCheckedChange={(checked) => onFieldChange({ ...field, required: checked })}
              data-testid="switch-field-required"
            />
            <Label htmlFor="field-required">Required field</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-[#bba7db] text-white hover:bg-[#bba7db]/90"
            onClick={onSave}
            data-testid="button-save-field"
          >
            Save Field
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
