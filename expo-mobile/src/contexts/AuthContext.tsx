import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiRequest, apiFetch, loadSession, saveSession, clearSession, getSessionId, setUnauthorizedHandler } from '../services/api';
import { registerForPushNotifications, unregisterPushNotifications } from '../services/pushNotifications';
import { startSyncService, stopSyncService } from '../services/syncService';
import { connectSocket, disconnectSocket } from '../services/socket';

interface User {
  id: string;
  email: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  companyId?: string;
  companyNickname?: string;
  role?: string;
  roleId?: string;
  roleName?: string;
  userCategory?: string;
  profileImageUrl?: string;
  chosenPlan?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSubbie: boolean;
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
          registerForPushNotifications();
          startSyncService();
          connectSocket();
        } catch {
          await clearSession();
          setUser(null);
        }
      }
      setIsLoading(false);
    };
    init();
  }, []);

  // Expired/revoked session (401 on an authenticated request): clear local
  // state so the navigator returns to the login screen, instead of every
  // screen failing individually with generic errors.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      stopSyncService();
      disconnectSocket();
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = async (email: string, password: string) => {
    try {
      // apiRequest throws on non-2xx with the server's message.
      const response = await apiRequest('/api/auth/login', 'POST', { email, password });
      const data = await response.json();

      if (!data.sessionId) {
        return { success: false, error: 'Session not returned. Please try again.' };
      }

      await saveSession(data.sessionId);
      const userData = await apiFetch<User>('/api/auth/user');
      setUser(userData);
      registerForPushNotifications();
      startSyncService();
      connectSocket();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Network error. Check your connection.' };
    }
  };

  const loginWithSession = async (sid: string) => {
    try {
      await saveSession(sid);
      const userData = await apiFetch<User>('/api/auth/user');
      setUser(userData);
      registerForPushNotifications();
      startSyncService();
      connectSocket();
      return { success: true };
    } catch (error: any) {
      await clearSession();
      return { success: false, error: error.message || 'Session invalid. Please try again.' };
    }
  };

  const logout = async () => {
    stopSyncService();
    disconnectSocket();
    // Unregister this device first, while the session is still valid.
    await unregisterPushNotifications();
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
        isSubbie: user?.chosenPlan === 'subbie',
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
