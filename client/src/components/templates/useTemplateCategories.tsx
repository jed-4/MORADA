import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type TemplateCategory } from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TemplateCategoryType = "rfi" | "rfq" | "task";

export interface CategoryTreeNode {
  id: string;
  name: string;
  depth: number;
}

/**
 * Shared category subsystem for template pages (RFI / RFQ / Task).
 * Fetches the categories for a template type and exposes the breadcrumb
 * formatter and the flattened, depth-annotated tree used by selects.
 */
export function useTemplateCategories(templateType: TemplateCategoryType) {
  const { data: categories = [], isLoading } = useQuery<TemplateCategory[]>({
    queryKey: ["/api/template-categories", templateType],
    queryFn: async () => {
      const response = await fetch(`/api/template-categories?templateType=${templateType}`);
      if (!response.ok) throw new Error("Failed to fetch categories");
      return response.json();
    },
  });

  /** "Parent / Child / Grandchild" path for a category id (empty string if unknown). */
  const getCategoryBreadcrumb = useCallback(
    (categoryId: string | null | undefined): string => {
      if (!categoryId) return "";
      const category = categories.find((c) => c.id === categoryId);
      if (!category) return "";

      const breadcrumbParts: string[] = [category.name];
      let currentCategory = category;

      while (currentCategory.parentId) {
        const parent = categories.find((c) => c.id === currentCategory.parentId);
        if (parent) {
          breadcrumbParts.unshift(parent.name);
          currentCategory = parent;
        } else {
          break;
        }
      }

      return breadcrumbParts.join(" / ");
    },
    [categories],
  );

  /** Depth-first flattened tree, for indented Select options. */
  const categoryTree = useMemo<CategoryTreeNode[]>(() => {
    const tree: CategoryTreeNode[] = [];

    const addChildren = (parentId: string, depth: number) => {
      const children = categories.filter((c) => c.parentId === parentId);
      children.forEach((child) => {
        tree.push({ id: child.id, name: child.name, depth });
        addChildren(child.id, depth + 1);
      });
    };

    categories
      .filter((c) => !c.parentId)
      .forEach((root) => {
        tree.push({ id: root.id, name: root.name, depth: 0 });
        addChildren(root.id, 1);
      });

    return tree;
  }, [categories]);

  return { categories, isLoading, getCategoryBreadcrumb, categoryTree };
}

export interface CategoryFilterSelectProps {
  /** Current filter value — "all" or a category id. */
  value: string;
  onValueChange: (value: string) => void;
  /** Flattened tree from useTemplateCategories. */
  tree: CategoryTreeNode[];
  allLabel?: string;
  placeholder?: string;
  className?: string;
  testId?: string;
}

/**
 * Compact toolbar Select for filtering a template list by category.
 * Renders indented options mirroring the category hierarchy.
 */
export function CategoryFilterSelect({
  value,
  onValueChange,
  tree,
  allLabel = "All Categories",
  placeholder = "Category",
  className = "h-6 w-40 text-xs",
  testId = "select-category-filter",
}: CategoryFilterSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className} data-testid={testId}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {tree.map((cat) => (
          <SelectItem key={cat.id} value={cat.id}>
            <span style={{ paddingLeft: `${cat.depth * 12}px` }}>
              {cat.depth > 0 ? "└ " : ""}
              {cat.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
