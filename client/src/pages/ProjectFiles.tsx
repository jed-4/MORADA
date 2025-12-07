import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useProject } from "@/contexts/ProjectContext";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Search,
  Upload,
  Download,
  Folder,
  FolderPlus,
  File,
  FileText,
  FileImage,
  FileSpreadsheet,
  FileVideo,
  FileAudio,
  FilePlus,
  MoreVertical,
  Trash2,
  ExternalLink,
  ChevronRight,
  Home,
  RefreshCw,
  Grid3X3,
  List,
  Settings,
  Link2Off,
  Link2,
  Loader2,
  HardDrive,
  FolderOpen,
  Eye,
  X,
  ZoomIn,
  ZoomOut,
  Check,
  FolderCheck,
  ArrowLeft,
  AlertCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { format } from "date-fns";
import { SiGoogledrive } from "react-icons/si";

interface FilesParams {
  projectId: string;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  parents?: string[];
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  iconLink?: string;
  isFolder: boolean;
}

interface DriveStatus {
  connected: boolean;
  email: string | null;
  tokenExpiry: Date | null;
  isExpired: boolean;
  connectedAt: Date | null;
  connectedBy: string | null;
  rootFolderId: string | null;
}

interface FolderPath {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  googleDriveFolderId?: string | null;
  googleDriveFolderName?: string | null;
}

export default function ProjectFiles() {
  const { currentProject, refetchProject } = useProject();
  const { toast } = useToast();
  const pageTitle = usePageTitle({ pageName: "Files" });
  const params = useParams<FilesParams>();
  const projectId = params.projectId || currentProject?.id;

  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<FolderPath[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLinkFolderDialog, setShowLinkFolderDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(100);
  
  // Link folder dialog state
  const [linkFolderId, setLinkFolderId] = useState<string | null>(null);
  const [linkFolderPath, setLinkFolderPath] = useState<FolderPath[]>([]);
  const [linkBrowseFiles, setLinkBrowseFiles] = useState<DriveFile[]>([]);
  const [isLoadingLinkFiles, setIsLoadingLinkFiles] = useState(false);
  const [selectedLinkFolder, setSelectedLinkFolder] = useState<DriveFile | null>(null);
  const [driveConnectionError, setDriveConnectionError] = useState<string | null>(null);

  const { data: driveStatus, isLoading: statusLoading } = useQuery<DriveStatus>({
    queryKey: ["/api/google-drive/status"],
  });

  // Navigate to project's linked folder on mount
  useEffect(() => {
    if (currentProject?.googleDriveFolderId && currentProject?.googleDriveFolderName && driveStatus?.connected) {
      setCurrentFolderId(currentProject.googleDriveFolderId);
      setFolderPath([{ id: currentProject.googleDriveFolderId, name: currentProject.googleDriveFolderName }]);
    }
  }, [currentProject?.googleDriveFolderId, currentProject?.googleDriveFolderName, driveStatus?.connected]);

  const { data: files = [], isLoading: filesLoading, refetch: refetchFiles, error: filesError } = useQuery<DriveFile[]>({
    queryKey: ["/api/google-drive/files", currentFolderId],
    queryFn: async () => {
      const url = currentFolderId 
        ? `/api/google-drive/files?folderId=${currentFolderId}`
        : "/api/google-drive/files";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        const error = await response.json();
        if (error.error === "not_connected" || error.error === "session_expired") {
          // Refetch status to update connection state
          queryClient.invalidateQueries({ queryKey: ["/api/google-drive/status"] });
          const err = new Error(error.message || "Google Drive session expired");
          (err as any).needsReconnect = true;
          throw err;
        }
        throw new Error(error.message || "Failed to fetch files");
      }
      return response.json();
    },
    enabled: driveStatus?.connected === true,
    retry: false,
  });

  const { data: sharedDrives = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/google-drive/shared-drives"],
    enabled: driveStatus?.connected === true,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/google-drive/auth-url", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to get auth URL");
      const { authUrl } = await response.json();
      window.location.href = authUrl;
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to connect",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("/api/google-drive/disconnect", "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/google-drive/status"] });
      toast({
        title: "Disconnected",
        description: "Google Drive has been disconnected.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to disconnect",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest("/api/google-drive/folders", "POST", {
        name,
        parentId: currentFolderId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/google-drive/files", currentFolderId] });
      setShowCreateFolderDialog(false);
      setNewFolderName("");
      toast({
        title: "Folder created",
        description: "New folder has been created in Google Drive.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create folder",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await apiRequest(`/api/google-drive/files/${fileId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/google-drive/files", currentFolderId] });
      setShowDeleteDialog(false);
      setSelectedFile(null);
      toast({
        title: "Deleted",
        description: "File has been deleted from Google Drive.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const linkFolderMutation = useMutation({
    mutationFn: async (folder: { id: string; name: string } | null) => {
      if (!projectId) throw new Error("No project selected");
      return apiRequest(`/api/projects/${projectId}`, "PATCH", {
        googleDriveFolderId: folder?.id || null,
        googleDriveFolderName: folder?.name || null,
      });
    },
    onSuccess: (_, folder) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      if (refetchProject) refetchProject();
      setShowLinkFolderDialog(false);
      
      if (folder) {
        setCurrentFolderId(folder.id);
        setFolderPath([{ id: folder.id, name: folder.name }]);
        toast({
          title: "Folder linked",
          description: `Project now linked to "${folder.name}" in Google Drive.`,
        });
      } else {
        setCurrentFolderId(null);
        setFolderPath([]);
        toast({
          title: "Folder unlinked",
          description: "Project folder link removed.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to link folder",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleUpload = async () => {
    if (!uploadFile) return;
    
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      if (currentFolderId) {
        formData.append("parentId", currentFolderId);
      }

      const response = await fetch("/api/google-drive/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Upload failed");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/google-drive/files", currentFolderId] });
      setShowUploadDialog(false);
      setUploadFile(null);
      toast({
        title: "Uploaded",
        description: `${uploadFile.name} has been uploaded to Google Drive.`,
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (file: DriveFile) => {
    window.open(`/api/google-drive/download/${file.id}`, "_blank");
  };

  const handleFileClick = (file: DriveFile) => {
    if (file.isFolder) {
      navigateToFolder(file.id, file.name);
    } else {
      // Check if it's a Google Doc/Sheet/Slide - open in new tab
      const googleMimeTypes = [
        "application/vnd.google-apps.document",
        "application/vnd.google-apps.spreadsheet",
        "application/vnd.google-apps.presentation",
        "application/vnd.google-apps.form",
        "application/vnd.google-apps.drawing",
      ];
      
      if (googleMimeTypes.includes(file.mimeType)) {
        window.open(file.webViewLink, "_blank");
      } else if (file.mimeType?.startsWith("image/") || file.mimeType === "application/pdf") {
        // Show preview for images and PDFs
        setPreviewFile(file);
        setPreviewZoom(100);
        setShowPreviewDialog(true);
      } else if (file.webViewLink) {
        window.open(file.webViewLink, "_blank");
      }
    }
  };

  const navigateToFolder = (folderId: string, folderName: string) => {
    setFolderPath([...folderPath, { id: folderId, name: folderName }]);
    setCurrentFolderId(folderId);
  };

  const navigateToBreadcrumb = (index: number) => {
    if (index === -1) {
      // If project has linked folder, go to that. Otherwise go to root.
      if (currentProject?.googleDriveFolderId && currentProject?.googleDriveFolderName) {
        setFolderPath([{ id: currentProject.googleDriveFolderId, name: currentProject.googleDriveFolderName }]);
        setCurrentFolderId(currentProject.googleDriveFolderId);
      } else {
        setFolderPath([]);
        setCurrentFolderId(null);
      }
    } else {
      const newPath = folderPath.slice(0, index + 1);
      setFolderPath(newPath);
      setCurrentFolderId(newPath[newPath.length - 1].id);
    }
  };

  // Link folder dialog navigation
  const loadLinkFolderFiles = async (folderId: string | null) => {
    setIsLoadingLinkFiles(true);
    setDriveConnectionError(null);
    try {
      const url = folderId 
        ? `/api/google-drive/files?folderId=${folderId}`
        : "/api/google-drive/files";
      const response = await fetch(url, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setLinkBrowseFiles(data.filter((f: DriveFile) => f.isFolder));
      } else if (response.status === 401) {
        const error = await response.json();
        setDriveConnectionError(error.message || "Google Drive session expired. Please reconnect.");
        setLinkBrowseFiles([]);
      } else {
        const error = await response.json();
        setDriveConnectionError(error.message || "Failed to load folders");
        setLinkBrowseFiles([]);
      }
    } catch (error) {
      console.error("Failed to load folders:", error);
      setDriveConnectionError("Failed to connect to Google Drive. Please check your connection.");
      setLinkBrowseFiles([]);
    } finally {
      setIsLoadingLinkFiles(false);
    }
  };

  const openLinkFolderDialog = () => {
    setLinkFolderId(null);
    setLinkFolderPath([]);
    setSelectedLinkFolder(null);
    setShowLinkFolderDialog(true);
    loadLinkFolderFiles(null);
  };

  const navigateLinkFolder = (folder: DriveFile) => {
    setLinkFolderPath([...linkFolderPath, { id: folder.id, name: folder.name }]);
    setLinkFolderId(folder.id);
    setSelectedLinkFolder(null);
    loadLinkFolderFiles(folder.id);
  };

  const navigateLinkBreadcrumb = (index: number) => {
    if (index === -1) {
      setLinkFolderPath([]);
      setLinkFolderId(null);
      loadLinkFolderFiles(null);
    } else {
      const newPath = linkFolderPath.slice(0, index + 1);
      setLinkFolderPath(newPath);
      setLinkFolderId(newPath[newPath.length - 1].id);
      loadLinkFolderFiles(newPath[newPath.length - 1].id);
    }
    setSelectedLinkFolder(null);
  };

  const confirmLinkFolder = () => {
    if (selectedLinkFolder) {
      linkFolderMutation.mutate({ id: selectedLinkFolder.id, name: selectedLinkFolder.name });
    } else if (linkFolderId && linkFolderPath.length > 0) {
      // Use current browsed folder
      const currentFolder = linkFolderPath[linkFolderPath.length - 1];
      linkFolderMutation.mutate({ id: currentFolder.id, name: currentFolder.name });
    }
  };

  const getFileIcon = (file: DriveFile) => {
    if (file.isFolder) return <Folder className="w-5 h-5 text-[#bba7db]" />;
    
    const mimeType = file.mimeType || "";
    if (mimeType.includes("image")) return <FileImage className="w-5 h-5 text-green-500" />;
    if (mimeType.includes("video")) return <FileVideo className="w-5 h-5 text-purple-500" />;
    if (mimeType.includes("audio")) return <FileAudio className="w-5 h-5 text-orange-500" />;
    if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return <FileSpreadsheet className="w-5 h-5 text-green-600" />;
    if (mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("word")) return <FileText className="w-5 h-5 text-blue-500" />;
    return <File className="w-5 h-5 text-gray-500" />;
  };

  const formatFileSize = (bytes?: string) => {
    if (!bytes) return "-";
    const num = parseInt(bytes);
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
    return `${(num / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const filteredFiles = useMemo(() => {
    if (!searchQuery) return files;
    return files.filter((file) =>
      file.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [files, searchQuery]);

  const folders = filteredFiles.filter((f) => f.isFolder);
  const regularFiles = filteredFiles.filter((f) => !f.isFolder);
  const sortedFiles = [...folders, ...regularFiles];

  if (!driveStatus?.connected) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
          <h2 className="text-sm font-semibold">{pageTitle}</h2>
        </div>
        
        <div className="flex-1 flex items-center justify-center">
          <Card className="p-8 max-w-md text-center">
            <SiGoogledrive className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Connect Google Drive</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Connect your company's Google Drive to browse, upload, and manage project files directly from BuildPro.
            </p>
            <Button
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
              data-testid="button-connect-drive"
            >
              {connectMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <SiGoogledrive className="w-4 h-4 mr-2" />
              )}
              Connect Google Drive
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Row 1 - Page Title & Actions (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <SiGoogledrive className="w-4 h-4 text-[#4285F4]" />
            <h2 className="text-sm font-semibold">{pageTitle}</h2>
          </div>
          {driveStatus?.email && (
            <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" />
              Connected
            </Badge>
          )}
          {currentProject?.googleDriveFolderName && (
            <Badge variant="outline" className="text-xs">
              <FolderCheck className="w-3 h-3 mr-1" />
              {currentProject.googleDriveFolderName}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2"
            onClick={openLinkFolderDialog}
            data-testid="button-link-folder"
          >
            <Link2 className="w-3 h-3 inline mr-0.5" />
            {currentProject?.googleDriveFolderId ? "Change Folder" : "Link Folder"}
          </button>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2"
            onClick={() => setShowUploadDialog(true)}
            data-testid="button-upload-file"
          >
            <Upload className="w-3 h-3 inline mr-0.5" />
            Upload
          </button>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2"
            onClick={() => setShowCreateFolderDialog(true)}
            data-testid="button-create-folder"
          >
            <FolderPlus className="w-3 h-3 inline mr-0.5" />
            New Folder
          </button>
          <button
            className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
            onClick={() => refetchFiles()}
            data-testid="button-refresh"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                data-testid="button-settings"
              >
                <Settings className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {currentProject?.googleDriveFolderId && (
                <>
                  <DropdownMenuItem
                    onClick={() => linkFolderMutation.mutate(null)}
                  >
                    <Link2Off className="w-4 h-4 mr-2" />
                    Unlink Folder
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                onClick={() => disconnectMutation.mutate()}
                className="text-red-600"
              >
                <Link2Off className="w-4 h-4 mr-2" />
                Disconnect Google Drive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Row 2 - View Toggle & Shared Drives (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setViewMode("list")}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${viewMode === 'list' ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' : 'hover-elevate'} active-elevate-2`}
            data-testid="button-view-list"
          >
            <List className="w-3 h-3 inline mr-0.5" />
            List
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${viewMode === 'grid' ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' : 'hover-elevate'} active-elevate-2`}
            data-testid="button-view-grid"
          >
            <Grid3X3 className="w-3 h-3 inline mr-0.5" />
            Grid
          </button>
        </div>

        {sharedDrives.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2">
                <HardDrive className="w-3 h-3 inline mr-0.5" />
                Shared Drives
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {sharedDrives.map((drive) => (
                <DropdownMenuItem
                  key={drive.id}
                  onClick={() => navigateToFolder(drive.id, drive.name)}
                >
                  <Folder className="w-4 h-4 mr-2 text-[#bba7db]" />
                  {drive.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Row 3 - Search & Breadcrumbs (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 flex-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <button
              onClick={() => navigateToBreadcrumb(-1)}
              className="hover:text-foreground transition-colors flex items-center gap-0.5"
              data-testid="breadcrumb-root"
            >
              <SiGoogledrive className="w-3 h-3" />
              <span>{currentProject?.googleDriveFolderName || "Drive"}</span>
            </button>
            {folderPath.slice(currentProject?.googleDriveFolderId ? 1 : 0).map((folder, index) => (
              <span key={folder.id} className="flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />
                <button
                  onClick={() => navigateToBreadcrumb(index + (currentProject?.googleDriveFolderId ? 1 : 0))}
                  className="hover:text-foreground transition-colors"
                  data-testid={`breadcrumb-${index}`}
                >
                  {folder.name}
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="relative w-48">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-7 pr-2 py-0 h-6 text-xs border"
            data-testid="input-search-files"
          />
        </div>
      </div>

      {/* File Browser Content */}
      <div className="flex-1 overflow-auto p-2">
        {filesLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-[#bba7db]" />
          </div>
        ) : filesError ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <AlertCircle className="w-16 h-16 mb-4 text-amber-500" />
            <p className="text-sm mb-2">{(filesError as any).message || "Failed to load files"}</p>
            <p className="text-xs mb-4 text-muted-foreground">Your Google Drive session may have expired</p>
            <Button
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90"
            >
              {connectMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Reconnect Google Drive
            </Button>
          </div>
        ) : sortedFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <FolderOpen className="w-16 h-16 mb-4" />
            <p className="text-sm">
              {searchQuery ? "No files match your search" : "This folder is empty"}
            </p>
            <button
              onClick={() => setShowUploadDialog(true)}
              className="mt-4 text-sm text-[#bba7db] hover:underline"
            >
              Upload a file to Google Drive
            </button>
          </div>
        ) : viewMode === "list" ? (
          <div className="space-y-0.5">
            <div className="grid grid-cols-[1fr_100px_120px_40px] gap-2 px-2 py-1 text-xs text-muted-foreground font-medium border-b">
              <span>Name</span>
              <span>Size</span>
              <span>Modified</span>
              <span></span>
            </div>
            {sortedFiles.map((file) => (
              <div
                key={file.id}
                className="grid grid-cols-[1fr_100px_120px_40px] gap-2 px-2 py-1.5 rounded-md hover-elevate cursor-pointer items-center"
                onClick={() => handleFileClick(file)}
                data-testid={`file-${file.id}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {getFileIcon(file)}
                  <span className="text-sm truncate">{file.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {file.isFolder ? "-" : formatFileSize(file.size)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {file.modifiedTime
                    ? format(new Date(file.modifiedTime), "MMM d, yyyy")
                    : "-"}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!file.isFolder && (file.mimeType?.startsWith("image/") || file.mimeType === "application/pdf") && (
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        setPreviewFile(file);
                        setPreviewZoom(100);
                        setShowPreviewDialog(true);
                      }}>
                        <Eye className="w-4 h-4 mr-2" />
                        Preview
                      </DropdownMenuItem>
                    )}
                    {file.webViewLink && (
                      <DropdownMenuItem onClick={() => window.open(file.webViewLink, "_blank")}>
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Open in Google Drive
                      </DropdownMenuItem>
                    )}
                    {!file.isFolder && (
                      <DropdownMenuItem onClick={() => handleDownload(file)}>
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedFile(file);
                        setShowDeleteDialog(true);
                      }}
                      className="text-red-600"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {sortedFiles.map((file) => (
              <div
                key={file.id}
                className="p-3 rounded-lg border hover-elevate cursor-pointer flex flex-col items-center gap-2"
                onClick={() => handleFileClick(file)}
                data-testid={`file-grid-${file.id}`}
              >
                {file.thumbnailLink && !file.isFolder ? (
                  <img
                    src={file.thumbnailLink}
                    alt={file.name}
                    className="w-12 h-12 object-cover rounded"
                  />
                ) : (
                  <div className="w-12 h-12 flex items-center justify-center">
                    {file.isFolder ? (
                      <Folder className="w-10 h-10 text-[#bba7db]" />
                    ) : (
                      getFileIcon(file)
                    )}
                  </div>
                )}
                <span className="text-xs text-center truncate w-full" title={file.name}>
                  {file.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Link Folder Dialog */}
      <Dialog open={showLinkFolderDialog} onOpenChange={setShowLinkFolderDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SiGoogledrive className="w-5 h-5 text-[#4285F4]" />
              Link Google Drive Folder
            </DialogTitle>
            <DialogDescription>
              Select a folder from Google Drive to link to this project. All files in this folder will be accessible from the Files tab.
            </DialogDescription>
          </DialogHeader>
          
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground border-b pb-2">
            <button
              onClick={() => navigateLinkBreadcrumb(-1)}
              className="hover:text-foreground transition-colors flex items-center gap-0.5"
            >
              <SiGoogledrive className="w-3 h-3" />
              <span>Drive</span>
            </button>
            {linkFolderPath.map((folder, index) => (
              <span key={folder.id} className="flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />
                <button
                  onClick={() => navigateLinkBreadcrumb(index)}
                  className="hover:text-foreground transition-colors"
                >
                  {folder.name}
                </button>
              </span>
            ))}
          </div>
          
          {/* Folder List */}
          <ScrollArea className="h-64 border rounded-md">
            {isLoadingLinkFiles ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-[#bba7db]" />
              </div>
            ) : driveConnectionError ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
                <AlertCircle className="w-10 h-10 mb-2 text-amber-500" />
                <p className="text-sm text-center mb-3">{driveConnectionError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowLinkFolderDialog(false);
                    connectMutation.mutate();
                  }}
                  className="gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reconnect Google Drive
                </Button>
              </div>
            ) : linkBrowseFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
                <FolderOpen className="w-10 h-10 mb-2" />
                <p className="text-sm">No subfolders</p>
                {linkFolderPath.length > 0 && (
                  <p className="text-xs mt-1">You can select this folder</p>
                )}
              </div>
            ) : (
              <div className="p-1">
                {linkBrowseFiles.map((folder) => (
                  <div
                    key={folder.id}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                      selectedLinkFolder?.id === folder.id 
                        ? 'bg-[#bba7db]/20 border border-[#bba7db]' 
                        : 'hover-elevate'
                    }`}
                    onClick={() => setSelectedLinkFolder(folder)}
                    onDoubleClick={() => navigateLinkFolder(folder)}
                  >
                    <Folder className="w-5 h-5 text-[#bba7db]" />
                    <span className="text-sm flex-1">{folder.name}</span>
                    {selectedLinkFolder?.id === folder.id && (
                      <Check className="w-4 h-4 text-[#bba7db]" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateLinkFolder(folder);
                      }}
                      className="p-1 hover:bg-muted rounded"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          
          {(selectedLinkFolder || linkFolderPath.length > 0) && (
            <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
              Selected: <span className="font-medium text-foreground">
                {selectedLinkFolder?.name || linkFolderPath[linkFolderPath.length - 1]?.name}
              </span>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkFolderDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmLinkFolder}
              disabled={driveConnectionError !== null || (!selectedLinkFolder && linkFolderPath.length === 0) || linkFolderMutation.isPending}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90"
            >
              {linkFolderMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Link2 className="w-4 h-4 mr-2" />
              )}
              Link Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <div className="flex items-center justify-between p-3 border-b">
            <div className="flex items-center gap-2">
              {previewFile && getFileIcon(previewFile)}
              <span className="font-medium">{previewFile?.name}</span>
            </div>
            <div className="flex items-center gap-2">
              {previewFile?.mimeType?.startsWith("image/") && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewZoom(Math.max(25, previewZoom - 25))}
                    disabled={previewZoom <= 25}
                  >
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <span className="text-sm w-12 text-center">{previewZoom}%</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewZoom(Math.min(200, previewZoom + 25))}
                    disabled={previewZoom >= 200}
                  >
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                </>
              )}
              {previewFile?.webViewLink && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(previewFile.webViewLink, "_blank")}
                >
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Open in Drive
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => previewFile && handleDownload(previewFile)}
              >
                <Download className="w-4 h-4 mr-1" />
                Download
              </Button>
            </div>
          </div>
          <div className="overflow-auto p-4 flex items-center justify-center min-h-[400px] max-h-[calc(90vh-80px)]">
            {previewFile?.mimeType?.startsWith("image/") ? (
              <img
                src={`/api/google-drive/download/${previewFile.id}`}
                alt={previewFile.name}
                style={{ transform: `scale(${previewZoom / 100})` }}
                className="max-w-full transition-transform"
              />
            ) : previewFile?.mimeType === "application/pdf" ? (
              <iframe
                src={`/api/google-drive/download/${previewFile.id}#toolbar=1`}
                className="w-full h-[70vh]"
                title={previewFile.name}
              />
            ) : (
              <div className="text-center text-muted-foreground">
                <File className="w-16 h-16 mx-auto mb-4" />
                <p>Preview not available for this file type</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => previewFile?.webViewLink && window.open(previewFile.webViewLink, "_blank")}
                >
                  Open in Google Drive
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Folder Dialog */}
      <Dialog open={showCreateFolderDialog} onOpenChange={setShowCreateFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Enter a name for the new folder in Google Drive.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            data-testid="input-folder-name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateFolderDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createFolderMutation.mutate(newFolderName)}
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90"
            >
              {createFolderMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload to Google Drive</DialogTitle>
            <DialogDescription>
              Select a file to upload to {folderPath.length > 0 ? folderPath[folderPath.length - 1].name : "Google Drive"}.
            </DialogDescription>
          </DialogHeader>
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            {uploadFile ? (
              <div className="flex items-center gap-2 justify-center">
                <File className="w-5 h-5 text-[#bba7db]" />
                <span className="text-sm">{uploadFile.name}</span>
                <button
                  onClick={() => setUploadFile(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="cursor-pointer">
                <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Click to select a file
                </p>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  data-testid="input-file-upload"
                />
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowUploadDialog(false);
              setUploadFile(null);
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!uploadFile || isUploading}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Upload to Drive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedFile?.isFolder ? "Folder" : "File"}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedFile?.name}" from Google Drive? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedFile && deleteMutation.mutate(selectedFile.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
