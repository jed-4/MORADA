import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../services/api';
import { useAuth } from './AuthContext';

/**
 * Which project a client is looking at.
 *
 * Most homeowners have one job, so client mode is built around a single
 * current project rather than a project list; a client with more than one
 * switches from Home. The list comes from GET /api/projects, which the server
 * already scopes to the projects this client was granted.
 */

export interface ClientProject {
  id: string;
  name: string;
  location?: string | null;
}

interface ClientProjectContextType {
  projects: ClientProject[];
  project: ClientProject | null;
  isLoading: boolean;
  /** Set when the list could not be loaded at all. */
  error: string | null;
  selectProject: (id: string) => void;
  reload: () => Promise<void>;
}

const ClientProjectContext = createContext<ClientProjectContextType | null>(null);

const storageKey = (userId: string) => `client-project:${userId}`;

export function ClientProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ClientProject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const rows = await apiFetch<ClientProject[]>('/api/projects');
      // Only what the screens use — the route returns whole project rows.
      setProjects((rows ?? []).map((p) => ({ id: p.id, name: p.name, location: p.location ?? null })));
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Could not load your project');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(storageKey(user.id));
        if (!cancelled && saved) setSelectedId(saved);
      } catch {
        // No saved choice — the first project is used.
      }
      if (!cancelled) await reload();
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, reload]);

  const selectProject = useCallback(
    (id: string) => {
      setSelectedId(id);
      if (user?.id) AsyncStorage.setItem(storageKey(user.id), id).catch(() => {});
    },
    [user?.id],
  );

  // A saved id for a project they've since lost access to falls back to the first.
  const project = projects.find((p) => p.id === selectedId) ?? projects[0] ?? null;

  return (
    <ClientProjectContext.Provider value={{ projects, project, isLoading, error, selectProject, reload }}>
      {children}
    </ClientProjectContext.Provider>
  );
}

export function useClientProject() {
  const context = useContext(ClientProjectContext);
  if (!context) throw new Error('useClientProject must be used within a ClientProjectProvider');
  return context;
}
