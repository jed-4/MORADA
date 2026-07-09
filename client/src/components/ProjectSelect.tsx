import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import type { Project } from "@shared/schema";

const PHASE_ORDER: Record<string, number> = {
  construction: 0,
  pre_construction: 1,
  lead: 2,
  post_construction: 3,
  archive: 4,
};

interface ProjectSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  allowNone?: boolean;
  showColor?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function ProjectSelect({
  value,
  onValueChange,
  placeholder = "Select project...",
  disabled = false,
  allowClear = false,
  allowNone = true,
  showColor = true,
  className,
  "data-testid": testId,
}: ProjectSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  interface Option {
    value: string;
    label: string;
    address?: string;
    color?: string | null;
  }

  const allOptions: Option[] = useMemo(() => {
    const opts: Option[] = [];
    if (allowNone) {
      opts.push({ value: "none", label: "Business (No Project)" });
    }
    // Sort by phase order (construction first), then by job number within each phase
    const sorted = [...projects].sort((a, b) => {
      const phaseA = PHASE_ORDER[a.currentSystemPhase || "lead"] ?? 99;
      const phaseB = PHASE_ORDER[b.currentSystemPhase || "lead"] ?? 99;
      if (phaseA !== phaseB) return phaseA - phaseB;
      const jnA = a.jobNumber || "";
      const jnB = b.jobNumber || "";
      return jnA.localeCompare(jnB, undefined, { numeric: true });
    });
    sorted.forEach((p) =>
      opts.push({ value: p.id, label: p.name, address: p.address || undefined, color: p.color })
    );
    return opts;
  }, [projects, allowNone]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allOptions;
    const q = search.toLowerCase();
    return allOptions.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.address && o.address.toLowerCase().includes(q))
    );
  }, [allOptions, search]);

  const selected = allOptions.find((o) => o.value === (value || (allowNone ? "none" : undefined)));

  const handleSelect = (optValue: string) => {
    onValueChange(optValue === "none" ? "" : optValue);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
          data-testid={testId}
        >
          <span className="truncate flex items-center gap-2">
            {selected?.color && showColor && selected.value !== "none" && (
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: selected.color }} />
            )}
            {isLoading ? "Loading..." : (selected?.label || placeholder)}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{ width: "var(--radix-popover-trigger-width)" }}
        align="start"
      >
        {allOptions.length > 6 && (
          <div className="p-2 border-b">
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
              autoFocus
            />
          </div>
        )}
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No projects found.</p>
          )}
          {filtered.map((option) => {
            const isSelected = (value || (allowNone ? "none" : undefined)) === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm text-left hover-elevate cursor-pointer",
                  isSelected && "bg-accent text-accent-foreground"
                )}
              >
                <Check className={cn("h-4 w-4 flex-shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                {option.color && showColor && option.value !== "none" && (
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: option.color }} />
                )}
                <div className="flex flex-col min-w-0">
                  <span className="truncate">{option.label}</span>
                  {option.address && (
                    <span className="text-xs text-muted-foreground truncate">{option.address}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
