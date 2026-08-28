import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, Trash2, Check } from "lucide-react";
import {
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
  /** Approved variations are locked server-side, so the toggles are shown but
   *  disabled rather than hidden — the builder can still see what was sent. */
  disabled?: boolean;
  disabledReason?: string;
}

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
  const [newTemplateName, setNewTemplateName] = useState("");
  const [naming, setNaming] = useState(false);

  const activeTemplate = templates.find((t) => variationColumnsEqual(t.columns, columns));

  const save = () => {
    const name = newTemplateName.trim();
    if (!name) return;
    onSaveTemplate(name);
    setNewTemplateName("");
    setNaming(false);
  };

  return (
    <div className="p-4 space-y-5" data-testid="sidebar-variation-columns">
      <div>
        <h3 className="text-sm font-medium">Visible to client</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Hidden fields are removed from the document and are never sent to the
          client portal.
        </p>
      </div>

      {disabled && disabledReason && (
        <p className="text-xs text-muted-foreground border rounded-md px-2 py-1.5">
          {disabledReason}
        </p>
      )}

      {/* ── Templates ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Templates
          </span>
          {!naming && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setNaming(true)}
              className="text-xs underline underline-offset-2 disabled:opacity-40"
              data-testid="button-save-column-template"
            >
              Save current
            </button>
          )}
        </div>

        {naming && (
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") { setNaming(false); setNewTemplateName(""); }
              }}
              placeholder="Template name"
              className="h-7 text-xs"
              data-testid="input-column-template-name"
            />
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={save}
              disabled={!newTemplateName.trim() || savingTemplate}
            >
              Save
            </Button>
          </div>
        )}

        {templates.length === 0 && !naming ? (
          <p className="text-xs text-muted-foreground">
            None yet. Set the columns below, then save them as a template to
            reuse on the next variation.
          </p>
        ) : (
          <div className="space-y-1">
            {templates.map((t) => {
              const isActive = activeTemplate?.id === t.id;
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-1 group"
                  data-testid={`row-column-template-${t.id}`}
                >
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(t.columns)}
                    className={`flex-1 flex items-center gap-1.5 text-left text-xs px-2 py-1 rounded-md border hover-elevate disabled:opacity-40 ${
                      isActive ? "border-primary/50 bg-primary/5" : "border-transparent"
                    }`}
                  >
                    {isActive ? (
                      <Check className="h-3 w-3 shrink-0 text-primary" />
                    ) : (
                      <Eye className="h-3 w-3 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{t.name}</span>
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onDeleteTemplate(t.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive disabled:opacity-0"
                    aria-label={`Delete template ${t.name}`}
                    data-testid={`button-delete-template-${t.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Column toggles ── */}
      {VARIATION_DOCUMENT_COLUMN_GROUPS.map((group) => (
        <div key={group.title} className="space-y-2.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {group.title}
          </span>
          {group.keys.map((key) => {
            const meta = VARIATION_DOCUMENT_COLUMN_LABELS[key];
            return (
              <label
                key={key}
                className={`flex items-start gap-2.5 ${disabled ? "opacity-60" : "cursor-pointer"}`}
              >
                <Checkbox
                  checked={columns[key]}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange({ ...columns, [key]: checked === true })
                  }
                  className="mt-0.5"
                  data-testid={`checkbox-column-${key}`}
                />
                <span className="min-w-0">
                  <span className="block text-sm leading-tight">
                    {meta.label}
                    {/* Cost and margin columns are the ones a builder would not
                        want to switch on by accident, so they say so rather
                        than relying on the label alone. */}
                    {meta.revealsMargin && columns[key] && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wide text-status-warning">
                        shows margin
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground leading-tight mt-0.5">
                    {meta.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      ))}

      <p className="text-xs text-muted-foreground border-t pt-3">
        To send a lump sum with no breakdown, clear the PDF checkbox on each line
        instead — their value shows as one "Additional works" row.
      </p>
    </div>
  );
}
