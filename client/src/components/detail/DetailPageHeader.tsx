import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The h-9 header bar every detail page rebuilds by hand.
 *
 * Notably it takes `backTo` as a base path and re-applies project context, so
 * "back" from a project-scoped record returns to the project's list instead of
 * dumping the user at the business-level one — RFQDetail and CreateRFQ both
 * hardcoded `/rfqs` and lost the project.
 */
export interface DetailPageHeaderProps {
  /** Business-level list path, e.g. "/rfqs". Project context is re-applied. */
  backTo: string;
  projectId?: string | null;

  title: string;
  onTitleChange?: (value: string) => void;
  titlePlaceholder?: string;
  /** Width of the inline title input. Long titles want more room. */
  titleClassName?: string;

  /** Reference number shown as a mono badge, e.g. an RFQ number. */
  reference?: string;
  /** Status pill and any other badges. */
  badges?: ReactNode;

  /** Shows the Save button. Omit for pages that save on change. */
  dirty?: boolean;
  saving?: boolean;
  onSave?: () => void;

  /** Page-specific buttons, right of Save. */
  actions?: ReactNode;
}

export function DetailPageHeader({
  backTo,
  projectId,
  title,
  onTitleChange,
  titlePlaceholder,
  titleClassName,
  reference,
  badges,
  dirty,
  saving,
  onSave,
  actions,
}: DetailPageHeaderProps) {
  const [, setLocation] = useLocation();

  const goBack = () => {
    setLocation(projectId ? `/projects/${projectId}${backTo}` : backTo);
  };

  return (
    <div className="h-9 px-3 flex items-center justify-between border-b bg-background shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={goBack}
          className="h-6 w-6 rounded-md hover-elevate active-elevate-2 flex items-center justify-center flex-shrink-0"
          data-testid="button-back"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {onTitleChange ? (
            <Input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder={titlePlaceholder}
              className={cn(
                "h-7 text-sm font-semibold border-transparent hover:border-input focus:border-input",
                titleClassName ?? "w-[240px]",
              )}
              data-testid="input-detail-title"
            />
          ) : (
            <span className="text-sm font-semibold truncate" data-testid="text-detail-title">
              {title}
            </span>
          )}

          {reference && (
            <Badge variant="outline" className="text-xs font-mono flex-shrink-0">
              {reference}
            </Badge>
          )}
          {badges}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {dirty && onSave && (
          <Button
            size="sm"
            variant="outline"
            onClick={onSave}
            disabled={saving}
            className="h-7 text-xs"
            data-testid="button-save"
          >
            {saving ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Save className="w-3 h-3 mr-1" />
            )}
            {saving ? "Saving..." : "Save"}
          </Button>
        )}
        {actions}
      </div>
    </div>
  );
}
