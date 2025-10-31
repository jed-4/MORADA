import { useQuery } from "@tanstack/react-query";
import type { FieldCategoryWithOptions } from "@shared/schema";

export function useTaskTemplateCategoryOptions() {
  const { data: fieldCategories = [], isLoading, isError } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  const categoryCategory = fieldCategories.find(cat => cat.key === "task_template.category");
  const categoryOptions = categoryCategory?.options || [];
  
  // Create lookup maps for easy access
  const categoryMap = categoryOptions.reduce((acc, option) => {
    acc[option.key] = option;
    return acc;
  }, {} as Record<string, typeof categoryOptions[0]>);
  
  // Fallback category data for loading/missing states
  const defaultCategories = {
    "admin": { key: "admin", name: "Administration", color: "#6B7280" },
    "finance": { key: "finance", name: "Finance", color: "#10B981" },
    "operations": { key: "operations", name: "Operations", color: "#3B82F6" },
    "safety": { key: "safety", name: "Safety", color: "#EF4444" },
    "quality": { key: "quality", name: "Quality Control", color: "#8B5CF6" },
    "marketing": { key: "marketing", name: "Marketing", color: "#F59E0B" },
    "compliance": { key: "compliance", name: "Compliance", color: "#14B8A6" },
    "hr": { key: "hr", name: "Human Resources", color: "#EC4899" }
  };
  
  const getCategoryInfo = (categoryKey: string | null | undefined) => {
    if (!categoryKey) return null;
    return categoryMap[categoryKey] || defaultCategories[categoryKey as keyof typeof defaultCategories] || {
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
    hasLoadedButNoOptions: !isLoading && !isError && categoryOptions.length === 0
  };
}
