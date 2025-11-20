import { ArrowLeft } from "lucide-react";

interface MobileHeaderProps {
  title: string;
  showBack?: boolean;
  action?: React.ReactNode;
}

export function MobileHeader({ title, showBack = false, action }: MobileHeaderProps) {

  return (
    <header className="safe-top bg-card border-b px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {showBack && (
          <button
            onClick={() => window.history.back()}
            className="p-2 -ml-2 hover-elevate active-elevate-2 rounded-md"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      {action && <div>{action}</div>}
    </header>
  );
}
