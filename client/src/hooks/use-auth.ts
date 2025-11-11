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
          cache: 'no-store', // Prevent 304 responses that cause loop
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        
        if (res.status === 401) {
          return null;
        }
        
        // Handle 304 Not Modified - treat as success with cached data
        if (res.status === 304) {
          const cachedData = queryClient.getQueryData<User | null>(queryKey);
          return cachedData ?? null;
        }
        
        if (!res.ok) {
          throw new Error(`Auth check failed: ${res.status}`);
        }
        
        return await res.json();
      } catch (error) {
        console.error('Auth check error:', error);
        return null;
      }
    },
    retry: false,
    staleTime: Infinity, // Never refetch automatically
    gcTime: Infinity, // Keep in cache indefinitely  
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const logout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
      });
      
      // Clear auth cache
      queryClient.setQueryData(['/api/auth/user'], null);
      
      // Redirect to landing page
      window.location.href = '/';
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
