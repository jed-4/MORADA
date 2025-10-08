import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  GripVertical,
  Plus,
  Trash2,
  Type,
  AlignLeft,
  Hash,
  Calendar,
  List,
  CheckSquare,
  FileIcon,
  Image,
  X,
} from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Checkbox } from "@/components/ui/checkbox";
import type { TemplateFieldDefinition } from "@shared/schema";

interface CustomFieldBuilderProps {
  fields: TemplateFieldDefinition[];
  onChange: (fields: TemplateFieldDefinition[]) => void;
}

const fieldTypeOptions = [
  { value: 'text', label: 'Short Text', icon: Type },
  { value: 'textarea', label: 'Long Text', icon: AlignLeft },
  { value: 'number', label: 'Number', icon: Hash },
  { value: 'date', label: 'Date', icon: Calendar },
  { value: 'select', label: 'Dropdown', icon: List },
  { value: 'checkbox', label: 'Checkbox', icon: CheckSquare },
  { value: 'file', label: 'File Upload', icon: FileIcon },
  { value: 'photo-gallery', label: 'Photo Gallery (3 max)', icon: Image },
] as const;

function SortableField({ field, onUpdate, onDelete }: { 
  field: TemplateFieldDefinition; 
  onUpdate: (field: TemplateFieldDefinition) => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [optionInput, setOptionInput] = useState("");
  const fieldTypeInfo = fieldTypeOptions.find(t => t.value === field.type);
  const Icon = fieldTypeInfo?.icon || Type;

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card className="border-l-4 border-l-primary/20">
        <CardContent className="p-4">
          <div className="flex gap-3">
            {/* Drag Handle */}
            <div
              {...listeners}
              className="flex items-start pt-6 cursor-grab active:cursor-grabbing"
              data-testid={`drag-handle-${field.id}`}
            >
              <GripVertical className="h-5 w-5 text-muted-foreground" />
            </div>

            {/* Field Config */}
            <div className="flex-1 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Field Label</Label>
                  <Input
                    value={field.title}
                    onChange={(e) => onUpdate({ ...field, title: e.target.value })}
                    placeholder="Enter field label"
                    className="mt-1"
                    data-testid={`input-field-label-${field.id}`}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Field Type</Label>
                  <Select
                    value={field.type}
                    onValueChange={(value: any) => onUpdate({ ...field, type: value })}
                  >
                    <SelectTrigger className="mt-1" data-testid={`select-field-type-${field.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldTypeOptions.map((option) => {
                        const OptionIcon = option.icon;
                        return (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <OptionIcon className="h-4 w-4" />
                              {option.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Dropdown Options */}
              {field.type === 'select' && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Dropdown Options</Label>
                  <div className="flex gap-2">
                    <Input
                      value={optionInput}
                      onChange={(e) => setOptionInput(e.target.value)}
                      placeholder="Add option..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && optionInput.trim()) {
                          e.preventDefault();
                          const newOption = { label: optionInput.trim(), value: optionInput.trim().toLowerCase().replace(/\s+/g, '-') };
                          onUpdate({
                            ...field,
                            options: [...(field.options || []), newOption],
                          });
                          setOptionInput("");
                        }
                      }}
                      data-testid={`input-add-option-${field.id}`}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (optionInput.trim()) {
                          const newOption = { label: optionInput.trim(), value: optionInput.trim().toLowerCase().replace(/\s+/g, '-') };
                          onUpdate({
                            ...field,
                            options: [...(field.options || []), newOption],
                          });
                          setOptionInput("");
                        }
                      }}
                      data-testid={`button-add-option-${field.id}`}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {field.options && field.options.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {field.options.map((option, idx) => (
                        <Badge key={idx} variant="secondary" className="gap-1" data-testid={`badge-option-${field.id}-${idx}`}>
                          {option.label}
                          <button
                            type="button"
                            onClick={() => {
                              onUpdate({
                                ...field,
                                options: field.options?.filter((_, i) => i !== idx),
                              });
                            }}
                            className="ml-1 hover:text-destructive"
                            data-testid={`button-remove-option-${field.id}-${idx}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Required Checkbox */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`required-${field.id}`}
                  checked={field.required}
                  onCheckedChange={(checked) => onUpdate({ ...field, required: checked === true })}
                  data-testid={`checkbox-field-required-${field.id}`}
                />
                <Label htmlFor={`required-${field.id}`} className="text-sm cursor-pointer">
                  Required field
                </Label>
              </div>
            </div>

            {/* Delete Button */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onDelete}
              className="mt-5 text-muted-foreground hover:text-destructive"
              data-testid={`button-delete-field-${field.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function CustomFieldBuilder({ fields, onChange }: CustomFieldBuilderProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const addField = () => {
    const newField: TemplateFieldDefinition = {
      id: `field-${Date.now()}`,
      title: '',
      type: 'text',
      required: false,
      order: fields.length,
    };
    onChange([...fields, newField]);
  };

  const updateField = (index: number, updatedField: TemplateFieldDefinition) => {
    const newFields = [...fields];
    newFields[index] = updatedField;
    onChange(newFields);
  };

  const deleteField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);
      onChange(arrayMove(fields, oldIndex, newIndex));
    }
  };

  return (
    <div className="space-y-3">
      {fields.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <Type className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-3">
              No custom fields yet. Add fields to customize your site diary template.
            </p>
            <Button type="button" onClick={addField} variant="outline" data-testid="button-add-first-field">
              <Plus className="h-4 w-4 mr-2" />
              Add Field
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <SortableField
                    key={field.id}
                    field={field}
                    onUpdate={(updatedField) => updateField(index, updatedField)}
                    onDelete={() => deleteField(index)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <Button
            type="button"
            onClick={addField}
            variant="outline"
            className="w-full"
            data-testid="button-add-field"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Field
          </Button>
        </>
      )}
    </div>
  );
}
