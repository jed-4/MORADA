import { useState, useEffect } from "react";

const STORAGE_KEY = "toolbar-visible";

export function useToolbarVisible() {
  const [toolbarVisible, setToolbarVisible] = useState<boolean>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === "true";
  });

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setToolbarVisible(e.newValue === null ? true : e.newValue === "true");
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const toggleToolbar = () => {
    const next = !toolbarVisible;
    localStorage.setItem(STORAGE_KEY, String(next));
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: String(next) }));
  };

  return { toolbarVisible, toggleToolbar };
}
