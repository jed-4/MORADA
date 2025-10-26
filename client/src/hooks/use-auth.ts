import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User | null>({
    queryKey: ['/api/auth/user'],
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      // Call the Replit Auth logout endpoint
      window.location.href = '/api/logout';
    },
  });

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    error,
    logout: logoutMutation.mutate,
    login: () => {
      // Redirect to Replit Auth login
      window.location.href = '/api/login';
    },
  };
}
