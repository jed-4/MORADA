import { type EstimateGroup } from "@shared/schema";
import { ChevronRight } from "lucide-react";

interface EstimateBreadcrumbProps {
  group?: EstimateGroup | null;
  allGroups: EstimateGroup[];
}

export function EstimateBreadcrumb({ group, allGroups }: EstimateBreadcrumbProps) {
  if (!group) return null;

  const buildBreadcrumb = (currentGroup: EstimateGroup): EstimateGroup[] => {
    const path: EstimateGroup[] = [currentGroup];
    let parent = currentGroup.parentGroupId 
      ? allGroups.find(g => g.id === currentGroup.parentGroupId)
      : null;
    
    while (parent) {
      path.unshift(parent);
      parent = parent.parentGroupId 
        ? allGroups.find(g => g.id === parent!.parentGroupId)
        : null;
    }
    
    return path;
  };

  const breadcrumbPath = buildBreadcrumb(group);

  return (
    <div className="breadcrumb-trail" data-testid="breadcrumb-trail">
      {breadcrumbPath.map((g, index) => (
        <span 
          key={g.id} 
          className="text-xs"
          style={{
            color: index === 0 ? '#3b82f6' : index === 1 ? '#10b981' : '#6b7280'
          }}
        >
          {g.name}
        </span>
      ))}
    </div>
  );
}
