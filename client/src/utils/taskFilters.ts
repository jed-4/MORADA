import { type Task } from "@shared/schema";
import { type FilterState } from "@/components/FilterPanel";

export function applyTaskFilters(tasks: Task[], filters: FilterState): Task[] {
  return tasks.filter(task => {
    // Search filter
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      const searchableText = [
        task.title,
        task.content,
        task.assigneeName,
        task.projectId,
        ...(Array.isArray(task.tags) ? task.tags : [])
      ].filter(Boolean).join(' ').toLowerCase();
      
      if (!searchableText.includes(searchTerm)) {
        return false;
      }
    }

    // Status filter
    if (filters.status && filters.status.length > 0) {
      if (!filters.status.includes(task.status || "todo")) {
        return false;
      }
    }

    // Priority filter
    if (filters.priority && filters.priority.length > 0) {
      if (!filters.priority.includes(task.priority || "medium")) {
        return false;
      }
    }

    // Assignee filter
    if (filters.assignee && filters.assignee.length > 0) {
      if (!task.assigneeName || !filters.assignee.includes(task.assigneeName)) {
        return false;
      }
    }

    // Project filter
    if (filters.project && filters.project.length > 0) {
      if (!task.projectId || !filters.project.includes(task.projectId)) {
        return false;
      }
    }

    // Tags filter
    if (filters.tags && filters.tags.length > 0) {
      if (!task.tags || !Array.isArray(task.tags)) {
        return false;
      }
      const taskTags = task.tags as string[];
      const hasMatchingTag = filters.tags.some(filterTag => 
        taskTags.includes(filterTag)
      );
      if (!hasMatchingTag) {
        return false;
      }
    }

    // Labels filter
    if (filters.labels && filters.labels.length > 0) {
      if (!task.labels || !Array.isArray(task.labels)) {
        return false;
      }
      const taskLabels = task.labels as string[];
      const hasMatchingLabel = filters.labels.some(filterLabel => 
        taskLabels.includes(filterLabel)
      );
      if (!hasMatchingLabel) {
        return false;
      }
    }

    // Due date filter
    if (filters.dueDateFrom || filters.dueDateTo) {
      if (!task.dueDate) {
        return false; // Exclude tasks without due dates when date filter is active
      }

      const taskDueDate = new Date(task.dueDate);
      
      if (filters.dueDateFrom) {
        const fromDate = new Date(filters.dueDateFrom);
        fromDate.setHours(0, 0, 0, 0);
        if (taskDueDate < fromDate) {
          return false;
        }
      }

      if (filters.dueDateTo) {
        const toDate = new Date(filters.dueDateTo);
        toDate.setHours(23, 59, 59, 999);
        if (taskDueDate > toDate) {
          return false;
        }
      }
    }

    return true;
  });
}

export function extractFilterOptions(tasks: Task[]) {
  const assignees = new Set<string>();
  const projects = new Set<string>();
  const tags = new Set<string>();
  const labels = new Set<string>();

  tasks.forEach(task => {
    if (task.assigneeName) {
      assignees.add(task.assigneeName);
    }
    if (task.projectId) {
      projects.add(task.projectId);
    }
    if (task.tags && Array.isArray(task.tags)) {
      (task.tags as string[]).forEach(tag => tags.add(tag));
    }
    if (task.labels && Array.isArray(task.labels)) {
      (task.labels as string[]).forEach(label => labels.add(label));
    }
  });

  return {
    availableAssignees: Array.from(assignees).sort(),
    availableProjects: Array.from(projects).sort(),
    availableTags: Array.from(tags).sort(),
    availableLabels: Array.from(labels).sort(),
  };
}

export function getActiveFilterCount(filters: FilterState): number {
  return Object.entries(filters).filter(([_, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && value !== "";
  }).length;
}

export function serializeFilters(filters: FilterState): Record<string, any> {
  // Convert FilterState to a JSON-serializable format for storage
  return {
    ...filters,
    dueDateFrom: filters.dueDateFrom?.toISOString(),
    dueDateTo: filters.dueDateTo?.toISOString(),
  };
}

export function deserializeFilters(serialized: Record<string, any>): FilterState {
  // Convert JSON-serialized format back to FilterState
  const filters: FilterState = { ...serialized };
  
  if (serialized.dueDateFrom) {
    filters.dueDateFrom = new Date(serialized.dueDateFrom);
  }
  if (serialized.dueDateTo) {
    filters.dueDateTo = new Date(serialized.dueDateTo);
  }
  
  return filters;
}