import { useState } from "react";
import { Filter, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export interface FilterFacet {
  key: string;
  /** Field label, e.g. "Supplier". */
  label: string;
  /** Shown on the trigger when nothing is selected, e.g. "All suppliers". */
  allLabel?: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Show a search box inside the dropdown (for long lists). */
  searchable?: boolean;
  /** Hide this facet entirely (e.g. project facet in a project-scoped view). */
  hidden?: boolean;
}

export interface FilterSelect {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  /** Value that counts as "no filter"; defaults to the first option's value. */
  defaultValue?: string;
  hidden?: boolean;
}

/**
 * Shared faceted filter bar. A single "Filters" button opens a popover rolling
 * up multi-select facets and single-select presets, with an active-filter count
 * badge and a Clear action — the same pattern used on the Timesheets page.
 * Parent owns the state; this component is presentational + toggling.
 */
export function DataTableFilterBar({
  facets = [],
  selects = [],
  align = "start",
}: {
  facets?: FilterFacet[];
  selects?: FilterSelect[];
  align?: "start" | "end";
}) {
  const visibleFacets = facets.filter((f) => !f.hidden);
  const visibleSelects = selects.filter((s) => !s.hidden);

  const selectDefault = (s: FilterSelect) => s.defaultValue ?? s.options[0]?.value ?? "";

  const activeFilterCount =
    visibleFacets.reduce((n, f) => n + f.selected.length, 0) +
    visibleSelects.reduce((n, s) => n + (s.value !== selectDefault(s) ? 1 : 0), 0);

  const clearAll = () => {
    for (const f of visibleFacets) f.onChange([]);
    for (const s of visibleSelects) s.onChange(selectDefault(s));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative h-6 w-6 flex items-center justify-center text-xs border rounded-md hover-elevate active-elevate-2",
            activeFilterCount > 0 ? "bg-primary/10 text-[#8b7ab8] border-primary/40" : "text-muted-foreground",
          )}
          data-testid="button-filters"
          aria-label="Filters"
          title="Filters"
        >
          <Filter className="w-3 h-3" />
          {activeFilterCount > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-primary text-white text-[9px] leading-[14px] font-semibold text-center"
              data-testid="badge-filters-count"
            >
              {activeFilterCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align={align}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filters</span>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-muted-foreground hover:text-foreground hover-elevate active-elevate-2 px-1 rounded"
                data-testid="button-filters-clear"
              >
                Clear
              </button>
            )}
          </div>

          {visibleFacets.map((facet) => (
            <FacetControl key={facet.key} facet={facet} />
          ))}

          {visibleSelects.map((s) => (
            <div key={s.key} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{s.label}</label>
              <select
                value={s.value}
                onChange={(e) => s.onChange(e.target.value)}
                className={cn(
                  "w-full h-7 px-2 text-xs border rounded-md bg-transparent",
                  s.value !== selectDefault(s) ? "bg-primary/10 border-primary/40" : "",
                )}
                data-testid={`select-filter-${s.key}`}
              >
                {s.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FacetControl({ facet }: { facet: FilterFacet }) {
  const [open, setOpen] = useState(false);
  const count = facet.selected.length;
  const allLabel = facet.allLabel ?? `All ${facet.label.toLowerCase()}`;

  const toggle = (value: string) => {
    const next = facet.selected.includes(value)
      ? facet.selected.filter((v) => v !== value)
      : [...facet.selected, value];
    facet.onChange(next);
  };

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{facet.label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "w-full h-7 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-between",
              count > 0 ? "bg-primary/10 border-primary/40" : "",
            )}
            data-testid={`button-filter-${facet.key}`}
          >
            <span className="truncate">{count === 0 ? allLabel : `${count} selected`}</span>
            <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[220px]" align="start">
          <Command>
            {facet.searchable && <CommandInput placeholder={`Search ${facet.label.toLowerCase()}...`} />}
            <CommandList className="max-h-[260px]">
              <CommandEmpty>No matches.</CommandEmpty>
              <CommandGroup>
                {facet.options.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={o.label}
                    onSelect={() => toggle(o.value)}
                    className="cursor-pointer"
                    data-testid={`option-filter-${facet.key}-${o.value}`}
                  >
                    <Checkbox checked={facet.selected.includes(o.value)} className="mr-2 pointer-events-none" />
                    <span className="truncate">{o.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
