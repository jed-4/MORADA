import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

export function BottomSheet({ isOpen, onClose, children, title }: BottomSheetProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        data-testid="bottom-sheet-overlay"
      />
      
      {/* Bottom Sheet */}
      <div
        className="fixed left-0 right-0 bottom-0 bg-card rounded-t-2xl z-50 max-h-[90vh] overflow-y-auto animate-slide-up"
        data-testid="bottom-sheet"
      >
        {title && (
          <div className="sticky top-0 bg-card border-b px-4 py-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 hover-elevate active-elevate-2 rounded-md"
              data-testid="button-close-bottom-sheet"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </>,
    document.body
  );
}
