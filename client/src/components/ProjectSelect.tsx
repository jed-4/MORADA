import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchableSelect, SearchableSelectOption } from "@/components/ui/searchable-select";
import type { Project } from "@shared/schema";

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
  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const options: SearchableSelectOption[] = useMemo(() => {
    const opts: SearchableSelectOption[] = [];
    
    if (allowNone) {
      opts.push({
        value: "none",
        label: "None",
      });
    }
    
    projects.forEach((project) => {
      opts.push({
        value: project.id,
        label: project.name,
        description: project.address || undefined,
        icon: showColor && project.color ? (
          <span 
            className="w-3 h-3 rounded-full flex-shrink-0" 
            style={{ backgroundColor: project.color }}
          />
        ) : undefined,
      });
    });
    
    return opts;
  }, [projects, allowNone, showColor]);

  const handleValueChange = (newValue: string) => {
    if (newValue === "none") {
      onValueChange("");
    } else {
      onValueChange(newValue);
    }
  };

  return (
    <SearchableSelect
      options={options}
      value={value || (allowNone ? "none" : undefined)}
      onValueChange={handleValueChange}
      placeholder={isLoading ? "Loading..." : placeholder}
      searchPlaceholder="Search projects..."
      emptyMessage="No projects found."
      disabled={disabled || isLoading}
      allowClear={allowClear}
      className={className}
      data-testid={testId}
    />
  );
}
