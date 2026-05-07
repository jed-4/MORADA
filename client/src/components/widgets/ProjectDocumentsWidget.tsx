import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { FolderOpen, FileText, ExternalLink, Folder } from "lucide-react";
import type { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { formatDate } from "@/lib/formatters";
import { Button } from "@/components/ui/button";

interface DriveFile {
  id: string;
  name: string;
  isFolder?: boolean;
  mimeType?: string;
  webViewLink?: string;
  modifiedTime?: string;
  size?: string | number | null;
}

export default function ProjectDocumentsWidget({ widget }: WidgetProps) {
  const { currentProject } = useProject();
  const [, setLocation] = useLocation();
  const folderId = currentProject?.googleDriveFolderId;
  const folderName = currentProject?.googleDriveFolderName;

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

  return (
    <div className="flex flex-col h-full" data-testid="widget-documents">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="h-3.5 w-3.5 text-bp-purple flex-shrink-0" />
          <span className="text-xs font-medium truncate">{folderName || "Project files"}</span>
        </div>
        <Button
          asChild
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs flex-shrink-0"
          data-testid="button-open-drive-folder"
        >
          <a
            href={`https://drive.google.com/drive/folders/${folderId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open <ExternalLink className="h-3 w-3 ml-1" />
          </a>
        </Button>
      </div>
      <div className="flex-1 overflow-auto px-2 pb-3 space-y-0.5">
        {files.map((f) => (
          <a
            key={f.id}
            href={f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover-elevate"
            data-testid={`document-${f.id}`}
          >
            {f.isFolder ? (
              <Folder className="h-3.5 w-3.5 text-bp-amber flex-shrink-0" />
            ) : (
              <FileText className="h-3.5 w-3.5 text-bp-muted flex-shrink-0" />
            )}
            <span className="text-sm flex-1 truncate">{f.name}</span>
            {f.modifiedTime && (
              <span className="text-[11px] text-muted-foreground flex-shrink-0">
                {formatDate(f.modifiedTime)}
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
