import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MapPin, Plus, Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ProjectLocationView } from "@shared/defects";
import { useProjectLocations } from "./defectHooks";

interface Props {
  projectId: string;
  value: string | null;
  /** Free-text fallback shown when no location is picked (old defects). */
  fallbackText?: string | null;
  onChange: (locationId: string | null, path: string | null) => void;
  canAdd: boolean;
  disabled?: boolean;
  testId?: string;
}

/**
 * Pick a project location (Level 1 › Kitchen › Island). Typing a name that
 * isn't there offers to add it — at the top level, or inside the location
 * currently picked.
 */
export function DefectLocationPicker({ projectId, value, fallbackText, onChange, canAdd, disabled, testId }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: locations = [] } = useProjectLocations(projectId);
  const selected = locations.find((l) => l.id === value) ?? null;

  const addMutation = useMutation({
    mutationFn: (body: { name: string; parentId: string | null }) =>
      apiRequest(`/api/projects/${projectId}/locations`, "POST", body) as Promise<ProjectLocationView>,
    onSuccess: (loc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "locations"] });
      onChange(loc.id, loc.path);
      setSearch("");
      setOpen(false);
    },
    onError: (e: any) =>
      toast({ title: "Couldn't add the location", description: e?.message, variant: "destructive" }),
  });

  const name = search.trim();
  const exact = locations.some((l) => l.name.toLowerCase() === name.toLowerCase() || l.path.toLowerCase() === name.toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm flex items-center justify-between gap-2 disabled:opacity-60"
          data-testid={testId ?? "defect-location-picker"}
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className={`truncate ${selected || fallbackText ? "text-foreground" : "text-muted-foreground"}`}>
              {selected?.path ?? fallbackText ?? "Pick a location"}
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search or add a location…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{canAdd ? "No match — add it below" : "No locations"}</CommandEmpty>
            {value && (
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => { onChange(null, null); setOpen(false); }}
                  className="text-muted-foreground"
                >
                  No location
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {locations.map((l) => (
                <CommandItem
                  key={l.id}
                  value={l.path}
                  onSelect={() => { onChange(l.id, l.path); setOpen(false); }}
                  data-testid={`location-option-${l.id}`}
                >
                  <Check className={`h-3.5 w-3.5 mr-1.5 ${l.id === value ? "opacity-100" : "opacity-0"}`} />
                  <span className="truncate">{l.path}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {canAdd && name && !exact && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value={`__add__${name}`}
                    disabled={addMutation.isPending}
                    onSelect={() => addMutation.mutate({ name, parentId: null })}
                    data-testid="location-add-top"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add “{name}”
                  </CommandItem>
                  {selected && (
                    <CommandItem
                      value={`__addin__${name}`}
                      disabled={addMutation.isPending}
                      onSelect={() => addMutation.mutate({ name, parentId: selected.id })}
                      data-testid="location-add-inside"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      <span className="truncate">Add “{name}” inside {selected.path}</span>
                    </CommandItem>
                  )}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
