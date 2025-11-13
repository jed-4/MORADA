// Replit Auth integration - see blueprint:javascript_log_in_with_replit
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User | null>({
    queryKey: ['/api/auth/user'],
    queryFn: async ({ queryKey }) => {
      try {
        const res = await fetch('/api/auth/user', {
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
    staleTime: 0, // Always fetch fresh data to catch auth state changes immediately
    gcTime: Infinity,
    refetchOnMount: true, // Always check for fresh data on component mount
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    refetchOnReconnect: true, // Refetch when connection restored
  });

  const logout = async () => {
    try {
      // Clear auth cache first
      queryClient.setQueryData(['/api/auth/user'], null);
      
      // Redirect to Replit Auth logout (GET endpoint)
      window.location.href = '/api/logout';
    } catch (error) {
      console.error('Logout error:', error);
      // Still clear cache and redirect even if logout fails
      queryClient.setQueryData(['/api/auth/user'], null);
      window.location.href = '/';
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
