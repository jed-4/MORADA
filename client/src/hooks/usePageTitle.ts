import { useLocation, useParams } from "wouter";
import { useProject } from "@/contexts/ProjectContext";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

interface PageTitleOptions {
  pageName: string;
  overrideContext?: string; // Allow manual override of context
}

/**
 * Hook to generate consistent page titles across the application
 * Format: "Context · Page Name"
 * 
 * Examples:
 * - "26 Ocean · Minutes" (project page)
 * - "Lighthouse Projects · Expenses" (business page)
 * - "My · Tasks" (user workspace page)
 * - "All Projects · Notes" (cross-project view)
 */
export function usePageTitle({ pageName, overrideContext }: PageTitleOptions): string {
  const [location] = useLocation();
  const params = useParams();
  const { currentProject } = useProject();
  const { data: user } = useQuery<User & { companyNickname?: string }>({
    queryKey: ["/api/auth/user"],
  });

  // Allow manual override
  if (overrideContext) {
    return `${overrideContext} · ${pageName}`;
  }

  // Determine context based on current route
  const pathSegments = location.split('/').filter(Boolean);

  // Project-specific pages: /projects/:projectId/*
  if (pathSegments[0] === 'projects' && params.projectId && currentProject) {
    return `${currentProject.name} · ${pageName}`;
  }

  // Business pages: /business/*
  if (pathSegments[0] === 'business') {
    const companyName = user?.companyNickname || 'Business';
    return `${companyName} · ${pageName}`;
  }

  // User workspace pages: /workspace/* or /users/*
  if (pathSegments[0] === 'workspace' || pathSegments[0] === 'users') {
    return `My · ${pageName}`;
  }

  // Default: All Projects view
  return `All Projects · ${pageName}`;
}
