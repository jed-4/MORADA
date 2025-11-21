import { useLocation, useRouter, useRoute } from "wouter";
import { useMemo } from "react";

export function useProjectRoute() {
  const router = useRouter();
  const [location] = useLocation();
  
  const result = useMemo(() => {
    // Get the base path from router
    const basePath = router.base || "";
    
    // Create the full path that wouter expects
    let fullPath = location;
    
    // If location doesn't include the base, prepend it
    if (basePath && !location.startsWith(basePath)) {
      fullPath = basePath + (location.startsWith('/') ? location : '/' + location);
    }
    
    // Remove the base to get the relative path
    let relativePath = fullPath;
    if (basePath) {
      relativePath = fullPath.slice(basePath.length);
    }
    
    // Ensure it starts with /
    if (!relativePath.startsWith('/')) {
      relativePath = '/' + relativePath;
    }
    
    // Match the pattern /projects/:id/:tab
    const pattern = /^\/projects\/([^\/]+)\/([^\/]+)$/;
    const match = relativePath.match(pattern);
    
    if (!match) return null;
    
    return {
      projectId: match[1],
      tab: match[2],
    };
  }, [location, router.base]);
  
  return result;
}
