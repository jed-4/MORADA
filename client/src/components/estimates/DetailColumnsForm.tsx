import { useState } from "react";

/**
 * The form for the company's own Details columns — adding one, and editing one
 * that already exists.
 *
 * Lives in its own file because both places you manage these columns — an
 * estimate's Details list and the Details template — have to offer exactly the
 * same field types, and a pick list whose options are parsed differently in two
 * places would quietly produce two different column shapes.
 *
 * Editing goes through the same form for the same reason: a rename that parsed
 * its options differently from the add would be a third shape again.
 */
export function DetailColumnsForm({
  onAdd,
  initial,
  onSave,
  onCancel,
}: {
  onAdd?: (label: string, type: string, options: string[]) => void;
  /** Present when editing an existing column rather than adding one. */
  initial?: { label: string; type: string; options: string[] };
  onSave?: (label: string, type: string, options: string[]) => void;
  onCancel?: () => void;
}) {
  const editing = !!initial;
  const [label, setLabel] = useState(initial?.label ?? "");
  const [type, setType] = useState(initial?.type ?? "text");
  const [options, setOptions] = useState((initial?.options ?? []).join(", "));

  const submit = () => {
    const name = label.trim();
    if (!name) return;
    const parsed = type === "select" ? options.split(",").map(o => o.trim()).filter(Boolean) : [];
    if (editing) {
      onSave?.(name, type, parsed);
      return;
    }
    onAdd?.(name, type, parsed);
    setLabel("");
    setOptions("");
  };

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {editing ? "Edit column" : "Add a column"}
      </div>
      <input
        value={label}
        onChange={e => setLabel(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); submit(); }
          if (e.key === "Escape" && editing) { e.preventDefault(); onCancel?.(); }
        }}
        autoFocus={editing}
        placeholder="Column name"
        className="w-full h-7 px-2 text-xs rounded border border-border bg-background outline-none"
        data-testid="input-new-detail-column"
      />
      <select
        value={type}
        onChange={e => setType(e.target.value)}
        className="w-full h-7 px-1.5 text-xs rounded border border-border bg-background outline-none"
        data-testid="select-new-detail-column-type"
      >
        <option value="text">Text</option>
        <option value="checkbox">Tick box</option>
        <option value="date">Date</option>
        <option value="select">Pick list</option>
      </select>
      {type === "select" && (
        <input
          value={options}
          onChange={e => setOptions(e.target.value)}
          placeholder="Options, comma separated"
          className="w-full h-7 px-2 text-xs rounded border border-border bg-background outline-none"
          data-testid="input-new-detail-column-options"
        />
      )}
      <div className="flex gap-1.5">
        {editing && (
          <button
            onClick={onCancel}
            className="flex-1 h-7 text-xs rounded border border-border text-muted-foreground hover-elevate"
            data-testid="button-cancel-detail-column"
          >
            Cancel
          </button>
        )}
        <button
          onClick={submit}
          disabled={!label.trim()}
          className="flex-1 h-7 text-xs rounded bg-primary/10 text-foreground hover-elevate disabled:opacity-40"
          data-testid={editing ? "button-save-detail-column" : "button-add-detail-column"}
        >
          {editing ? "Save" : "Add column"}
        </button>
      </div>
    </div>
  );
}
