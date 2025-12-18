import { useQuery } from "@tanstack/react-query";
import type { FieldCategoryWithOptions } from "@shared/schema";

// Default category options as fallback
const defaultCategoryOptions = [
  { key: "admin", name: "Administration", color: "#6B7280", value: "admin", label: "Administration" },
  { key: "finance", name: "Finance", color: "#10B981", value: "finance", label: "Finance" },
  { key: "operations", name: "Operations", color: "#3B82F6", value: "operations", label: "Operations" },
  { key: "safety", name: "Safety", color: "#EF4444", value: "safety", label: "Safety" },
  { key: "quality", name: "Quality Control", color: "#8B5CF6", value: "quality", label: "Quality Control" },
  { key: "marketing", name: "Marketing", color: "#F59E0B", value: "marketing", label: "Marketing" },
  { key: "compliance", name: "Compliance", color: "#14B8A6", value: "compliance", label: "Compliance" },
  { key: "hr", name: "Human Resources", color: "#EC4899", value: "hr", label: "Human Resources" }
];

export function useTaskTemplateCategoryOptions() {
  const { data: fieldCategories = [], isLoading, isError } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  const categoryCategory = fieldCategories.find(cat => cat.key === "task_template.category");
  const apiOptions = categoryCategory?.options || [];
  
  // Use API options if available, otherwise use defaults
  const categoryOptions = apiOptions.length > 0 
    ? apiOptions.map(opt => ({ ...opt, value: opt.key, label: opt.name, depth: 0 }))
    : defaultCategoryOptions.map(opt => ({ ...opt, depth: 0 }));
  
  // Create lookup maps for easy access
  const categoryMap = categoryOptions.reduce((acc, option) => {
    acc[option.key] = option;
    return acc;
  }, {} as Record<string, typeof categoryOptions[0]>);
  
  const getCategoryInfo = (categoryKey: string | null | undefined) => {
    if (!categoryKey) return null;
    return categoryMap[categoryKey] || {
      key: categoryKey,
      name: categoryKey.replace("-", " ").replace(/\b\w/g, l => l.toUpperCase()),
      color: "#6B7280"
    };
  };
  
  return {
    categoryOptions,
    categoryMap,
    getCategoryInfo,
    isLoading,
    isError,
    hasLoadedButNoOptions: !isLoading && !isError && apiOptions.length === 0
  };
}
