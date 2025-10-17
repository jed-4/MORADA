import { useQuery } from "@tanstack/react-query";
import type { FieldCategoryWithOptions } from "@shared/schema";

export function useDefectTypeOptions() {
  const { data: fieldCategories = [], isLoading, isError } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  const defectTypeCategory = fieldCategories.find(cat => cat.key === "defect.type");
  const typeOptions = defectTypeCategory?.options || [];
  
  // Create lookup maps for easy access
  const typeMap = typeOptions.reduce((acc, option) => {
    acc[option.key] = option;
    return acc;
  }, {} as Record<string, typeof typeOptions[0]>);
  
  // Fallback type data for loading/missing states
  const defaultTypes = {
    "builder": { key: "builder", name: "Builder Defect", color: "#3B82F6" },
    "subcontractor": { key: "subcontractor", name: "Subcontractor", color: "#F59E0B" },
    "client": { key: "client", name: "Client Reported", color: "#8B5CF6" },
    "warranty": { key: "warranty", name: "Warranty", color: "#EF4444" }
  };
  
  const getTypeInfo = (typeKey: string) => {
    return typeMap[typeKey] || defaultTypes[typeKey as keyof typeof defaultTypes] || {
      key: typeKey,
      name: typeKey.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase()),
      color: "#6B7280"
    };
  };
  
  return {
    typeOptions,
    typeMap,
    getTypeInfo,
    isLoading,
    isError,
    hasLoadedButNoOptions: !isLoading && !isError && typeOptions.length === 0
  };
}
