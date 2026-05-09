import { Pin, PinOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePinnedItems } from "./usePinnedItems";

interface PinRowButtonProps {
  projectId: string | undefined;
  itemType: string;
  itemId: string;
  itemName: string;
  itemIcon?: string | null;
  category?: string | null;
  className?: string;
  alwaysVisible?: boolean;
}

/**
 * Reusable pin-toggle button that appears on row hover (or always when
 * `alwaysVisible`). Shows a filled `PinOff` icon in BuildPro purple when the
 * item is pinned, and a muted outline `Pin` otherwise. Click stops
 * propagation so the parent row's onClick is not triggered.
 */
export function PinRowButton({
  projectId,
  itemType,
  itemId,
  itemName,
  itemIcon,
  category,
  className,
  alwaysVisible,
}: PinRowButtonProps) {
  const { isPinned, togglePin } = usePinnedItems(projectId);
  if (!projectId || !itemId) return null;
  const pinned = isPinned(itemType, itemId);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        togglePin({ itemType, itemId, itemName, itemIcon, category });
      }}
      title={pinned ? "Unpin from dashboard" : "Pin to dashboard"}
      className={cn(
        "p-1 rounded hover:bg-[hsl(var(--bp-subtle))] transition-opacity",
        alwaysVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        className,
      )}
      data-testid={`button-pin-${itemType}-${itemId}`}
    >
      {pinned ? (
        <PinOff size={14} className="text-[hsl(var(--bp-purple))]" />
      ) : (
        <Pin size={14} className="text-[hsl(var(--bp-muted))]" />
      )}
    </button>
  );
}
