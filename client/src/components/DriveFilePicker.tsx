import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Folder,
  FileText,
  Image,
  File,
  FileSpreadsheet,
  Presentation,
  ChevronRight,
  Home,
  Loader2,
  Check,
  X,
  CloudOff,
} from "lucide-react";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime?: string;
  webViewLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
}

interface DriveFilePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (files: DriveFile[]) => void;
  projectId?: string;
  multiple?: boolean;
  title?: string;
}

export function DriveFilePicker({
  open,
  onOpenChange,
  onSelect,
  projectId,
  multiple = false,
  title = "Attach File from Google Drive",
}: DriveFilePickerProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined);
  const [folderPath, setFolderPath] = useState<{ id: string; name: string }[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<DriveFile[]>([]);
  const { toast } = useToast();

  const { data: driveStatus } = useQuery<{ connected: boolean; email?: string }>({
    queryKey: ["/api/google-drive/status"],
  });

  const { data: project } = useQuery<any>({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const response = await fetch(`/api/projects/${projectId}`, { credentials: "include" });
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!projectId,
  });

  const startFolderId = project?.googleDriveFolderId || undefined;

  const { data: files = [], isLoading } = useQuery<DriveFile[]>({
    queryKey: ["/api/google-drive/files", currentFolderId || startFolderId || "root"],
    queryFn: async () => {
      const folderId = currentFolderId || startFolderId;
      const url = folderId 
        ? `/api/google-drive/files?folderId=${folderId}`
        : "/api/google-drive/files";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load files");
      return response.json();
    },
    enabled: open && driveStatus?.connected === true,
  });

  const navigateToFolder = (folderId: string, folderName: string) => {
    setFolderPath([...folderPath, { id: folderId, name: folderName }]);
    setCurrentFolderId(folderId);
  };

  const navigateBack = (index: number) => {
    if (index === -1) {
      setFolderPath([]);
      setCurrentFolderId(startFolderId);
    } else {
      const newPath = folderPath.slice(0, index + 1);
      setFolderPath(newPath);
      setCurrentFolderId(newPath[newPath.length - 1]?.id || startFolderId);
    }
  };

  const toggleFileSelection = (file: DriveFile) => {
    if (file.mimeType === "application/vnd.google-apps.folder") {
      navigateToFolder(file.id, file.name);
      return;
    }

    if (multiple) {
      const isSelected = selectedFiles.some(f => f.id === file.id);
      if (isSelected) {
        setSelectedFiles(selectedFiles.filter(f => f.id !== file.id));
      } else {
        setSelectedFiles([...selectedFiles, file]);
      }
    } else {
      setSelectedFiles([file]);
    }
  };

  const handleConfirm = () => {
    if (selectedFiles.length > 0) {
      onSelect(selectedFiles);
      setSelectedFiles([]);
      setFolderPath([]);
      setCurrentFolderId(startFolderId);
      onOpenChange(false);
    }
  };

  const handleClose = () => {
    setSelectedFiles([]);
    setFolderPath([]);
    setCurrentFolderId(startFolderId);
    onOpenChange(false);
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType === "application/vnd.google-apps.folder") {
      return <Folder className="h-5 w-5 text-amber-500" />;
    }
    if (mimeType.includes("image")) {
      return <Image className="h-5 w-5 text-green-500" />;
    }
    if (mimeType.includes("pdf") || mimeType.includes("document")) {
      return <FileText className="h-5 w-5 text-blue-500" />;
    }
    if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
      return <FileSpreadsheet className="h-5 w-5 text-emerald-500" />;
    }
    if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) {
      return <Presentation className="h-5 w-5 text-orange-500" />;
    }
    return <File className="h-5 w-5 text-gray-500" />;
  };

  const isSelected = (file: DriveFile) => selectedFiles.some(f => f.id === file.id);

  if (!driveStatus?.connected) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Connect Google Drive to attach files
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CloudOff className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              Google Drive is not connected. Please connect it in Settings to attach files.
            </p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {multiple ? "Select files to attach" : "Select a file to attach"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 text-sm text-muted-foreground border-b pb-2 mb-2 flex-wrap">
          <button
            onClick={() => navigateBack(-1)}
            className="hover:text-foreground flex items-center gap-1"
            data-testid="button-drive-home"
          >
            <Home className="h-4 w-4" />
            {project?.googleDriveFolderName || "Drive"}
          </button>
          {folderPath.map((folder, index) => (
            <div key={folder.id} className="flex items-center">
              <ChevronRight className="h-4 w-4 mx-1" />
              <button
                onClick={() => navigateBack(index)}
                className="hover:text-foreground hover:underline"
                data-testid={`button-folder-path-${index}`}
              >
                {folder.name}
              </button>
            </div>
          ))}
        </div>

        <ScrollArea className="h-[400px] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Folder className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">This folder is empty</p>
            </div>
          ) : (
            <div className="space-y-1">
              {files.map((file) => {
                const selected = isSelected(file);
                const isFolder = file.mimeType === "application/vnd.google-apps.folder";
                
                return (
                  <button
                    key={file.id}
                    onClick={() => toggleFileSelection(file)}
                    className={`w-full flex items-center gap-3 p-2 rounded-md hover:bg-accent text-left transition-colors ${
                      selected ? "bg-accent ring-2 ring-primary" : ""
                    }`}
                    data-testid={`drive-file-${file.id}`}
                  >
                    <div className="flex-shrink-0">
                      {getFileIcon(file.mimeType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      {file.modifiedTime && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(file.modifiedTime).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    {isFolder ? (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    ) : selected ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-between items-center border-t pt-4">
          <div className="text-sm text-muted-foreground">
            {selectedFiles.length > 0 && (
              <span>{selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""} selected</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} data-testid="button-cancel-picker">
              Cancel
            </Button>
            <Button 
              onClick={handleConfirm} 
              disabled={selectedFiles.length === 0}
              data-testid="button-confirm-attach"
            >
              Attach {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
