import { useEffect } from "react";
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
 * Format: "Context · Page Name | BuildPro"
 * 
 * Also automatically sets document.title for browser tab
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

  let title: string;

  // Allow manual override
  if (overrideContext) {
    title = `${overrideContext} · ${pageName}`;
  }
  // Determine context based on current route
  else {
    const pathSegments = location.split('/').filter(Boolean);

    // Project-specific pages: /projects/:projectId/*
    if (pathSegments[0] === 'projects' && params.projectId && currentProject) {
      title = `${currentProject.name} · ${pageName}`;
    }
    // Business pages: /business/*
    else if (pathSegments[0] === 'business') {
      const companyName = user?.companyNickname || 'Business';
      title = `${companyName} · ${pageName}`;
    }
    // User workspace pages: /workspace/* or /users/*
    else if (pathSegments[0] === 'workspace' || pathSegments[0] === 'users') {
      title = `My · ${pageName}`;
    }
    // Default: All Projects view
    else {
      title = `All Projects · ${pageName}`;
    }
  }

  useEffect(() => {
    document.title = "BuildPro";
  }, [title]);

  return title;
}
