import { useQuery } from "@tanstack/react-query";
import { queryClient, getApiBaseUrl } from "./api";
import type { User } from "./schema";

export function useAuth() {
  const baseUrl = getApiBaseUrl();
  
  const { data: user, isLoading, error } = useQuery<User | null>({
    queryKey: ['/api/auth/user'],
    queryFn: async ({ queryKey }) => {
      try {
        const fullUrl = `${baseUrl}/api/auth/user`;
        const res = await fetch(fullUrl, {
          credentials: 'include',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        
        if (res.status === 401) {
          return null;
        }
        
        if (res.status === 304) {
          const cachedData = queryClient.getQueryData<User | null>(queryKey);
          return cachedData ?? null;
        }
        
        if (!res.ok) {
          throw new Error(`Auth check failed: ${res.status}`);
        }
        
        const userData = await res.json();
        return userData;
      } catch (error) {
        console.error('Auth check error:', error);
        return null;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
    gcTime: Infinity,
    refetchOnMount: false, // Don't refetch on every component mount
    refetchOnWindowFocus: false, // Don't refetch on every tab focus
    refetchOnReconnect: true, // Only refetch on network reconnect
  });

  const logout = async () => {
    try {
      // Clear auth cache first
      queryClient.setQueryData(['/api/auth/user'], null);
      
      // For mobile, navigate to login screen instead of redirecting
      if (import.meta.env.VITE_API_BASE_URL) {
        // Mobile: just clear the cache and let the app handle navigation
        return;
      }
      
      // Web: Redirect to Replit Auth logout (GET endpoint)
      window.location.href = '/api/logout';
    } catch (error) {
      console.error('Logout error:', error);
      queryClient.setQueryData(['/api/auth/user'], null);
      
      if (!import.meta.env.VITE_API_BASE_URL) {
        window.location.href = '/';
      }
    }
  };

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    error,
    logout,
  };
}
