import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiRequest, apiFetch, loadSession, saveSession, clearSession, getSessionId } from '../services/api';

interface User {
  id: string;
  email: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  companyId?: string;
  companyNickname?: string;
  role?: string;
  profileImageUrl?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginWithSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const userData = await apiFetch<User>('/api/auth/user');
      setUser(userData);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await loadSession();
      if (getSessionId()) {
        try {
          const userData = await apiFetch<User>('/api/auth/user');
          setUser(userData);
        } catch {
          await clearSession();
          setUser(null);
        }
      }
      setIsLoading(false);
    };
    init();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await apiRequest('/api/auth/login', 'POST', { email, password });
      const data = await response.json();

      if (response.ok && data.sessionId) {
        await saveSession(data.sessionId);
        const userData = await apiFetch<User>('/api/auth/user');
        setUser(userData);
        return { success: true };
      }

      if (response.ok && !data.sessionId) {
        return { success: false, error: 'Session not returned. Please try again.' };
      }

      return { success: false, error: data.message || 'Login failed' };
    } catch (error: any) {
      return { success: false, error: error.message || 'Network error. Check your connection.' };
    }
  };

  const loginWithSession = async (sid: string) => {
    try {
      await saveSession(sid);
      const userData = await apiFetch<User>('/api/auth/user');
      setUser(userData);
      return { success: true };
    } catch (error: any) {
      await clearSession();
      return { success: false, error: error.message || 'Session invalid. Please try again.' };
    }
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', 'POST');
    } catch {}
    await clearSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        loginWithSession,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
