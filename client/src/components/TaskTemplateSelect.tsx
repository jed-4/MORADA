import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchableSelect, SearchableSelectOption } from "@/components/ui/searchable-select";
import type { TaskTemplate } from "@shared/schema";

interface TaskTemplateSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  allowNone?: boolean;
  activeOnly?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function TaskTemplateSelect({
  value,
  onValueChange,
  placeholder = "Select template...",
  disabled = false,
  allowClear = false,
  allowNone = true,
  activeOnly = true,
  className,
  "data-testid": testId,
}: TaskTemplateSelectProps) {
  const { data: templates = [], isLoading } = useQuery<TaskTemplate[]>({
    queryKey: ["/api/task-templates"],
  });

  const filteredTemplates = useMemo(() => {
    if (!activeOnly) return templates;
    return templates.filter((t) => t.isActive !== false);
  }, [templates, activeOnly]);

  const options: SearchableSelectOption[] = useMemo(() => {
    const opts: SearchableSelectOption[] = [];
    
    if (allowNone) {
      opts.push({
        value: "none",
        label: "None",
      });
    }
    
    filteredTemplates.forEach((template) => {
      opts.push({
        value: template.id,
        label: template.name,
        description: template.description || undefined,
      });
    });
    
    return opts;
  }, [filteredTemplates, allowNone]);

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
      searchPlaceholder="Search templates..."
      emptyMessage="No templates found."
      disabled={disabled || isLoading}
      allowClear={allowClear}
      className={className}
      data-testid={testId}
    />
  );
}
