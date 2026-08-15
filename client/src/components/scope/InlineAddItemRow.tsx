import { useState, useEffect, useRef } from "react";

// Inline blank-row item creation: shows a single auto-focused input.
// Enter saves and re-arms a fresh blank row. Escape cancels. Blur saves if non-empty, cancels if empty.
export function InlineAddItemRow({ stage, onSave, onCancel }: {
  stage: string;
  onSave: (title: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onSave(trimmed);
      setValue("");
      // Refocus the same input for the next item
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      onCancel();
    }
  };

  return (
    <div
      className="grid gap-2 px-2 border-b border-border/50 h-10 items-center bg-primary/5"
      style={{ gridTemplateColumns: '24px 24px minmax(200px, 1fr) 100px minmax(150px, 2fr) 24px' }}
      data-testid={`inline-add-row-${stage.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div />
      <div />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setValue("");
            onCancel();
          }
        }}
        onBlur={(e) => {
          // If focus is moving to another "+ Item" trigger or another inline-add input,
          // skip blur-cancel so the parent can switch stages cleanly.
          const next = e.relatedTarget as HTMLElement | null;
          if (next && (
            next.getAttribute('data-testid')?.startsWith('button-add-item-') ||
            next.getAttribute('data-testid')?.startsWith('input-inline-add-')
          )) {
            return;
          }
          commit();
        }}
        placeholder="Item name (Enter to save, Esc to cancel)"
        className="h-7 text-sm font-medium bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded px-2"
        data-testid={`input-inline-add-${stage.toLowerCase().replace(/\s+/g, '-')}`}
      />
      <div />
      <div />
      <div />
    </div>
  );
}

export default InlineAddItemRow;
