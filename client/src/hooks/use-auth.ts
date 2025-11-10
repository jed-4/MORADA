import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User | null>({
    queryKey: ['/api/auth/user'],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    staleTime: Infinity, // Never consider stale
    refetchOnMount: true, // Always check auth on mount to handle page refreshes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const response = await apiRequest('/api/auth/login', 'POST', { email, password });
      
      // Set the user data directly in the cache instead of refetching
      // This avoids race conditions with session cookie propagation
      if (response.user) {
        queryClient.setQueryData(['/api/auth/user'], response.user);
      }
      
      return response;
    },
  });

  const registerMutation = useMutation({
    mutationFn: async ({ 
      email, 
      password, 
      name,
      companyName 
    }: { 
      email: string; 
      password: string; 
      name: string;
      companyName: string;
    }) => {
      const response = await apiRequest('/api/auth/register', 'POST', { 
        email, 
        password, 
        name, 
        companyName 
      });
      
      // Set the user data directly in the cache instead of refetching
      // This avoids race conditions with session cookie propagation
      if (response.user) {
        queryClient.setQueryData(['/api/auth/user'], response.user);
      }
      
      return response;
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('/api/auth/logout', 'POST');
    },
    onSuccess: () => {
      queryClient.setQueryData(['/api/auth/user'], null);
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    },
  });

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    error,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout: logoutMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
  };
}
