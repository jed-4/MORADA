const STORAGE_KEY = "workspacePreferences";

interface WorkspacePreferences {
  defaultExpanded: boolean;
}

const DEFAULTS: WorkspacePreferences = {
  defaultExpanded: false,
};

export function getWorkspacePreferences(): WorkspacePreferences {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...DEFAULTS, ...JSON.parse(saved) };
    }
  } catch {}
  return { ...DEFAULTS };
}

export function setWorkspacePreferences(prefs: Partial<WorkspacePreferences>): WorkspacePreferences {
  const current = getWorkspacePreferences();
  const updated = { ...current, ...prefs };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}
