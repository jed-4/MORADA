import { useState } from "react";

/**
 * The "add a column" form for the company's own Details columns.
 *
 * Lives in its own file because both places you manage these columns — an
 * estimate's Details list and the Details template — have to offer exactly the
 * same field types, and a pick list whose options are parsed differently in two
 * places would quietly produce two different column shapes.
 */
export function DetailColumnsForm({
  onAdd,
}: {
  onAdd: (label: string, type: string, options: string[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [options, setOptions] = useState("");

  const submit = () => {
    const name = label.trim();
    if (!name) return;
    onAdd(
      name,
      type,
      type === "select" ? options.split(",").map(o => o.trim()).filter(Boolean) : [],
    );
    setLabel("");
    setOptions("");
  };

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Add a column</div>
      <input
        value={label}
        onChange={e => setLabel(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
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
      <button
        onClick={submit}
        disabled={!label.trim()}
        className="w-full h-7 text-xs rounded bg-primary/10 text-foreground hover-elevate disabled:opacity-40"
        data-testid="button-add-detail-column"
      >
        Add column
      </button>
    </div>
  );
}
