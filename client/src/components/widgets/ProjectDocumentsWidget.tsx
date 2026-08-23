import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { FileText, ExternalLink, Folder } from "lucide-react";
import type { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { formatDate } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface DriveFile {
  id: string;
  name: string;
  isFolder?: boolean;
  mimeType?: string;
  webViewLink?: string;
  modifiedTime?: string;
  size?: string | number | null;
}

export default function ProjectDocumentsWidget({ widget, onSetHeaderActions }: WidgetProps) {
  const { currentProject } = useProject();
  const [, setLocation] = useLocation();
  const folderId = currentProject?.googleDriveFolderId;

  const { data, isLoading, isError, refetch } = useQuery<DriveFile[]>({
    queryKey: ["/api/google-drive/files", folderId],
    queryFn: async () => {
      if (!folderId) return [];
      const r = await fetch(`/api/google-drive/files?folderId=${encodeURIComponent(folderId)}`, {
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.message || `${r.status}`);
      }
      return r.json();
    },
    enabled: !!folderId,
  });

  // Header row: hover link out to the Drive folder
  useEffect(() => {
    onSetHeaderActions?.(
      currentProject && folderId ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              size="icon"
              variant="ghost"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              data-testid="button-open-drive-folder"
              aria-label="Open Drive folder"
            >
              <a
                href={`https://drive.google.com/drive/folders/${folderId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Open in Drive</TooltipContent>
        </Tooltip>
      ) : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id, folderId]);

  if (!currentProject) return <WidgetEmpty message="Select a project to view documents" />;

  if (!folderId) {
    return (
      <WidgetEmpty
        message="No Google Drive folder linked to this project"
        action={{
          label: "Connect Drive folder",
          onClick: () => setLocation(`/projects/${currentProject.id}/settings`),
        }}
      />
    );
  }

  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => refetch()} message="Couldn't load documents." />;

  const files = (data || []).slice(0, (widget.config?.maxItems as number) || 8);

  if (files.length === 0) {
    return (
      <WidgetEmpty
        message="No files in the linked Drive folder yet"
        action={{
          label: "Open in Drive",
          onClick: () =>
            window.open(`https://drive.google.com/drive/folders/${folderId}`, "_blank", "noopener"),
        }}
      />
    );
  }

  // Simple Notion-style rows: icon + name + date, nothing else
  return (
    <div className="space-y-0.5" data-testid="widget-documents">
      {files.map((f) => (
        <a
          key={f.id}
          href={f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-muted/60"
          data-testid={`document-${f.id}`}
        >
          <span className="flex-shrink-0 w-5 text-center">
            {f.isFolder ? (
              <Folder className="h-4 w-4 inline" style={{ color: "hsl(var(--amber))" }} />
            ) : (
              <FileText className="h-4 w-4 text-muted-foreground inline" />
            )}
          </span>
          <span className="text-sm flex-1 min-w-0 truncate">{f.name}</span>
          {f.modifiedTime && (
            <span className="text-[11px] text-muted-foreground flex-shrink-0">
              {formatDate(f.modifiedTime)}
            </span>
          )}
        </a>
      ))}
    </div>
  );
}
