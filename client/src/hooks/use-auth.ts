// Replit Auth integration - see blueprint:javascript_log_in_with_replit
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User | null>({
    queryKey: ['/api/auth/user'],
    queryFn: async ({ queryKey }) => {
      console.log('[useAuth] queryFn called');
      try {
        const res = await fetch('/api/auth/user', {
          credentials: 'include',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        
        console.log('[useAuth] Response status:', res.status);
        
        if (res.status === 401) {
          console.log('[useAuth] 401 - returning null');
          return null;
        }
        
        if (res.status === 304) {
          const cachedData = queryClient.getQueryData<User | null>(queryKey);
          console.log('[useAuth] 304 - returning cached:', cachedData);
          return cachedData ?? null;
        }
        
        if (!res.ok) {
          console.error('[useAuth] Request failed:', res.status);
          throw new Error(`Auth check failed: ${res.status}`);
        }
        
        const userData = await res.json();
        console.log('[useAuth] Success - user data:', userData);
        return userData;
      } catch (error) {
        console.error('[useAuth] Error in queryFn:', error);
        return null;
      }
    },
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  console.log('[useAuth] Hook state:', { hasData: !!user, isLoading, hasError: !!error });

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
