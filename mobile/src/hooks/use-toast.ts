// Toast hook for mobile - uses native haptics when available
import { useState, useCallback } from "react";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback(async (props: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast: Toast = { ...props, id };
    
    setToasts((prev) => [...prev, newToast]);

    // Use native haptics on mobile for tactile feedback
    try {
      if (props.variant === "destructive") {
        await Haptics.impact({ style: ImpactStyle.Heavy });
      } else {
        await Haptics.impact({ style: ImpactStyle.Light });
      }
    } catch (e) {
      // Haptics not available or failed - that's ok
    }

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
    
    return id;
  }, []);

  const dismiss = useCallback((toastId?: string) => {
    setToasts((prev) => 
      toastId ? prev.filter((t) => t.id !== toastId) : []
    );
  }, []);

  return {
    toast,
    dismiss,
    toasts,
  };
}
