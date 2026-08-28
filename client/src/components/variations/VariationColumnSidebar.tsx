import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Trash2, RotateCcw, Check, X } from "lucide-react";
import {
  DEFAULT_VARIATION_DOCUMENT_COLUMNS,
  VARIATION_DOCUMENT_COLUMN_GROUPS,
  VARIATION_DOCUMENT_COLUMN_LABELS,
  variationColumnsEqual,
  type VariationColumnTemplate,
  type VariationDocumentColumns,
} from "@shared/variationDocumentColumns";

interface VariationColumnSidebarProps {
  columns: VariationDocumentColumns;
  onChange: (next: VariationDocumentColumns) => void;
  templates: VariationColumnTemplate[];
  onSaveTemplate: (name: string) => void;
  onDeleteTemplate: (id: string) => void;
  savingTemplate?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

const NO_TEMPLATE = "__none__";

export function VariationColumnSidebar({
  columns,
  onChange,
  templates,
  onSaveTemplate,
  onDeleteTemplate,
  savingTemplate = false,
  disabled = false,
  disabledReason,
}: VariationColumnSidebarProps) {
  const [newName, setNewName] = useState("");
  const [naming, setNaming] = useState(false);

  const allKeys = Object.keys(DEFAULT_VARIATION_DOCUMENT_COLUMNS) as Array<
    keyof VariationDocumentColumns
  >;
  const shownCount = allKeys.filter((k) => columns[k]).length;
  const activeTemplate = templates.find((t) => variationColumnsEqual(t.columns, columns));
  const isDefault = variationColumnsEqual(columns, DEFAULT_VARIATION_DOCUMENT_COLUMNS);

  const save = () => {
    const name = newName.trim();
    if (!name) return;
    onSaveTemplate(name);
    setNewName("");
    setNaming(false);
  };

  return (
    <div className="flex flex-col h-full" data-testid="sidebar-variation-columns">
      {/* Header */}
      <div className="px-4 py-3 border-b shrink-0">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">Visible to client</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {shownCount}/{allKeys.length}
          </span>
        </div>
        {disabled && disabledReason ? (
          <p className="text-xs text-muted-foreground mt-1">{disabledReason}</p>
        ) : null}
      </div>

      {/* Templates */}
      <div className="px-4 py-3 border-b shrink-0 space-y-2">
        <div className="flex items-center gap-1.5">
          <Select
            disabled={disabled || templates.length === 0}
            value={activeTemplate?.id ?? NO_TEMPLATE}
            onValueChange={(id) => {
              const t = templates.find((x) => x.id === id);
              if (t) onChange(t.columns);
            }}
          >
            <SelectTrigger className="h-7 text-xs flex-1" data-testid="select-column-template">
              <SelectValue
                placeholder={templates.length ? "Choose a template" : "No templates yet"}
              />
            </SelectTrigger>
            <SelectContent>
              {/* Only reachable when the current selection matches no template,
                  so it never reads as a choice the builder can make. */}
              {!activeTemplate && (
                <SelectItem value={NO_TEMPLATE} disabled>
                  Custom
                </SelectItem>
              )}
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {naming ? null : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7 shrink-0"
                  disabled={disabled}
                  onClick={() => setNaming(true)}
                  data-testid="button-save-column-template"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Save these columns as a template</TooltipContent>
            </Tooltip>
          )}

          {activeTemplate && !naming && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={disabled}
                  onClick={() => onDeleteTemplate(activeTemplate.id)}
                  data-testid="button-delete-column-template"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Delete "{activeTemplate.name}"</TooltipContent>
            </Tooltip>
          )}
        </div>

        {naming && (
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") { setNaming(false); setNewName(""); }
              }}
              placeholder="Template name"
              className="h-7 text-xs"
              data-testid="input-column-template-name"
            />
            <Button
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={save}
              disabled={!newName.trim() || savingTemplate}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              onClick={() => { setNaming(false); setNewName(""); }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Toggles */}
      <div className="flex-1 overflow-y-auto">
        {VARIATION_DOCUMENT_COLUMN_GROUPS.map((group) => (
          <div key={group.title} className="py-2">
            <div className="px-4 pb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {group.title}
              </span>
            </div>
            {group.keys.map((key) => {
              const meta = VARIATION_DOCUMENT_COLUMN_LABELS[key];
              const row = (
                <div
                  className={`flex items-center justify-between gap-3 px-4 py-1.5 ${
                    disabled ? "opacity-60" : "hover:bg-muted/50"
                  }`}
                >
                  <span className="text-sm min-w-0 flex items-center gap-1.5">
                    <span className="truncate">{meta.label}</span>
                    {/* Cost and margin columns are the ones you would not want
                        to enable by accident, so the dot is always present and
                        only colours in once the column is actually on. */}
                    {meta.revealsMargin && (
                      <span
                        className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                          columns[key] ? "bg-status-warning" : "bg-muted-foreground/30"
                        }`}
                      />
                    )}
                  </span>
                  <Switch
                    checked={columns[key]}
                    disabled={disabled}
                    onCheckedChange={(checked) => onChange({ ...columns, [key]: checked })}
                    className="shrink-0 scale-75 origin-right"
                    data-testid={`switch-column-${key}`}
                  />
                </div>
              );
              // The hint is worth reading but not worth eleven lines of grey
              // text down the panel, so it lives in a tooltip.
              return (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>{row}</TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[220px]">
                    {meta.hint}
                    {meta.revealsMargin && (
                      <span className="block mt-0.5 text-status-warning">
                        Shows the client your margin.
                      </span>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t shrink-0 space-y-2">
        {!isDefault && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...DEFAULT_VARIATION_DOCUMENT_COLUMNS })}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            data-testid="button-reset-columns"
          >
            <RotateCcw className="h-3 w-3" />
            Reset to default
          </button>
        )}
        <p className="text-xs text-muted-foreground leading-snug">
          Hidden fields are never sent to the client portal.
        </p>
      </div>
    </div>
  );
}
