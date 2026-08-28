import { Checkbox } from "@/components/ui/checkbox";
import { Lock } from "lucide-react";
import {
  VARIATION_DOCUMENT_COLUMN_LABELS,
  type VariationDocumentColumns,
} from "@shared/variationDocumentColumns";

interface VariationColumnSidebarProps {
  columns: VariationDocumentColumns;
  onChange: (next: VariationDocumentColumns) => void;
  /** Approved variations are locked server-side, so the toggles are shown but
   *  disabled rather than hidden — the builder can still see what was sent. */
  disabled?: boolean;
  disabledReason?: string;
}

export function VariationColumnSidebar({
  columns,
  onChange,
  disabled = false,
  disabledReason,
}: VariationColumnSidebarProps) {
  return (
    <div className="p-4 space-y-4" data-testid="sidebar-variation-columns">
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

      <div className="space-y-3">
        {VARIATION_DOCUMENT_COLUMN_LABELS.map(({ key, label, hint }) => (
          <label
            key={key}
            className={`flex items-start gap-2.5 ${
              disabled ? "opacity-60" : "cursor-pointer"
            }`}
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
              <span className="block text-sm leading-tight">{label}</span>
              <span className="block text-xs text-muted-foreground leading-tight mt-0.5">
                {hint}
              </span>
            </span>
          </label>
        ))}
      </div>

      {/* Shown rather than omitted: someone hunting for "turn off the amounts"
          needs to see that it deliberately isn't offered, not assume they
          missed it. */}
      <div className="pt-3 border-t space-y-2">
        {[
          { label: "Description", hint: "Always shown" },
          { label: "Amount", hint: "Always shown" },
        ].map(({ label, hint }) => (
          <div key={label} className="flex items-start gap-2.5 opacity-50">
            <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm leading-tight">{label}</span>
              <span className="block text-xs text-muted-foreground leading-tight mt-0.5">
                {hint}
              </span>
            </span>
          </div>
        ))}
        <p className="text-xs text-muted-foreground pt-1">
          To send a lump sum with no breakdown, clear the PDF checkbox on each
          line instead — their value shows as one "Additional works" row.
        </p>
      </div>
    </div>
  );
}
