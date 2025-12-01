import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Plus, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle,
  LayoutList,
  Columns3,
  Search,
  DollarSign,
  Calendar
} from "lucide-react";
import { type Variation, type Project } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { format } from "date-fns";

const STATUS_OPTIONS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "action", label: "Action" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

export default function Variations() {
  const [, setLocation] = useLocation();
  const params = useParams<{ projectId?: string }>();
  const projectIdFromUrl = params.projectId || "";
  const pageTitle = usePageTitle({ pageName: "Variations" });

  const [currentView, setCurrentView] = useState<"table" | "kanban">("table");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const queryParams: Record<string, string> = {};
  if (projectIdFromUrl) {
    queryParams.projectId = projectIdFromUrl;
  }
  if (selectedStatus !== "all") {
    queryParams.status = selectedStatus;
  }

  const { data: variations = [], isLoading: variationsLoading } = useQuery<Variation[]>({
    queryKey: ["/api/variations", queryParams],
    queryFn: async () => {
      const params = new URLSearchParams(queryParams);
      const queryString = params.toString();
      const url = queryString ? `/api/variations?${queryString}` : "/api/variations";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const getProjectName = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    return project?.name || "Unknown Project";
  };

  const formatCurrency = (amount: number) => {
    const dollars = amount / 100;
    const isWholeNumber = dollars % 1 === 0;
    
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: isWholeNumber ? 0 : 2,
      maximumFractionDigits: 2
    }).format(dollars);
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "-";
    return format(new Date(date), "dd MMM yyyy");
  };

  const getStatusBadge = (status: string, size: "sm" | "md" = "md") => {
    const sizeClass = size === "sm" ? "h-4 px-1.5 text-[10px]" : "";
    
    switch (status) {
      case "draft":
        return (
          <Badge variant="secondary" className={sizeClass} data-testid={`badge-status-draft`}>
            <FileText className={size === "sm" ? "w-2.5 h-2.5 mr-0.5" : "w-3 h-3 mr-1"} />
            Draft
          </Badge>
        );
      case "action":
        return (
          <Badge variant="destructive" className={sizeClass} data-testid={`badge-status-action`}>
            <AlertCircle className={size === "sm" ? "w-2.5 h-2.5 mr-0.5" : "w-3 h-3 mr-1"} />
            Action
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="default" className={sizeClass} data-testid={`badge-status-pending`}>
            <Clock className={size === "sm" ? "w-2.5 h-2.5 mr-0.5" : "w-3 h-3 mr-1"} />
            Pending
          </Badge>
        );
      case "approved":
        return (
          <Badge variant="outline" className={`border-green-500 text-green-700 ${sizeClass}`} data-testid={`badge-status-approved`}>
            <CheckCircle className={size === "sm" ? "w-2.5 h-2.5 mr-0.5" : "w-3 h-3 mr-1"} />
            Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="outline" className={`border-red-500 text-red-700 ${sizeClass}`} data-testid={`badge-status-rejected`}>
            <XCircle className={size === "sm" ? "w-2.5 h-2.5 mr-0.5" : "w-3 h-3 mr-1"} />
            Rejected
          </Badge>
        );
      default:
        return <Badge variant="outline" className={sizeClass} data-testid={`badge-status-${status}`}>{status}</Badge>;
    }
  };

  const handleRowClick = (variationId: string) => {
    if (projectIdFromUrl) {
      setLocation(`/projects/${projectIdFromUrl}/variations/${variationId}`);
    } else {
      setLocation(`/variations/${variationId}`);
    }
  };

  const handleAddVariation = () => {
    if (projectIdFromUrl) {
      setLocation(`/projects/${projectIdFromUrl}/variations/new`);
    } else {
      setLocation(`/variations/new`);
    }
  };

  const statusCounts = useMemo(() => {
    return {
      all: variations.length,
      draft: variations.filter((v) => v.status === "draft").length,
      action: variations.filter((v) => v.status === "action").length,
      pending: variations.filter((v) => v.status === "pending").length,
      approved: variations.filter((v) => v.status === "approved").length,
      rejected: variations.filter((v) => v.status === "rejected").length,
    };
  }, [variations]);

  const filteredVariations = useMemo(() => {
    return variations.filter((v) => {
      const matchesSearch = 
        v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.variationNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.description?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });
  }, [variations, searchTerm]);

  const TableView = () => (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead data-testid="table-header-number">Number</TableHead>
            <TableHead data-testid="table-header-name">Name</TableHead>
            {!projectIdFromUrl && <TableHead data-testid="table-header-project">Project</TableHead>}
            <TableHead data-testid="table-header-status">Status</TableHead>
            <TableHead data-testid="table-header-total">Total</TableHead>
            <TableHead data-testid="table-header-deadline">Approval Deadline</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {variationsLoading ? (
            <TableRow>
              <TableCell colSpan={projectIdFromUrl ? 5 : 6} className="text-center py-8">
                <span className="text-muted-foreground text-sm" data-testid="text-loading">Loading variations...</span>
              </TableCell>
            </TableRow>
          ) : filteredVariations.length === 0 ? (
            <TableRow>
              <TableCell colSpan={projectIdFromUrl ? 5 : 6} className="text-center py-8">
                <span className="text-muted-foreground text-sm" data-testid="text-no-variations">
                  {variations.length === 0 ? "No variations found" : "No matching variations"}
                </span>
              </TableCell>
            </TableRow>
          ) : (
            filteredVariations.map((variation) => (
              <TableRow
                key={variation.id}
                className="cursor-pointer hover-elevate"
                onClick={() => handleRowClick(variation.id)}
                data-testid={`row-variation-${variation.id}`}
              >
                <TableCell data-testid={`cell-number-${variation.id}`}>
                  {variation.variationNumber}
                </TableCell>
                <TableCell data-testid={`cell-name-${variation.id}`}>
                  {variation.name}
                </TableCell>
                {!projectIdFromUrl && (
                  <TableCell data-testid={`cell-project-${variation.id}`}>
                    <div className="flex items-center gap-2">
                      <ProjectIcon
                        icon={projects.find(p => p.id === variation.projectId)?.icon || 'Briefcase'}
                        color={projects.find(p => p.id === variation.projectId)?.color || '#3b82f6'}
                        className="w-4 h-4"
                      />
                      <span>{getProjectName(variation.projectId)}</span>
                    </div>
                  </TableCell>
                )}
                <TableCell data-testid={`cell-status-${variation.id}`}>
                  {getStatusBadge(variation.status)}
                </TableCell>
                <TableCell data-testid={`cell-total-${variation.id}`}>
                  {formatCurrency(variation.totalAmount)}
                </TableCell>
                <TableCell data-testid={`cell-deadline-${variation.id}`}>
                  {formatDate(variation.approvalDeadline)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  const KanbanView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4" data-testid="kanban-view">
      {STATUS_OPTIONS.slice(1).map((statusOption) => {
        const columnVariations = filteredVariations.filter((v) => v.status === statusOption.key);
        return (
          <div key={statusOption.key} className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-3 py-2 bg-muted rounded-md">
              <h3 className="font-medium text-sm" data-testid={`kanban-column-${statusOption.key}`}>
                {statusOption.label}
              </h3>
              <Badge variant="secondary" data-testid={`kanban-count-${statusOption.key}`}>
                {columnVariations.length}
              </Badge>
            </div>
            <div className="flex flex-col gap-2">
              {columnVariations.map((variation) => (
                <Card
                  key={variation.id}
                  className="p-3 cursor-pointer hover-elevate"
                  onClick={() => handleRowClick(variation.id)}
                  data-testid={`kanban-card-${variation.id}`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate" data-testid={`kanban-card-name-${variation.id}`}>
                          {variation.name}
                        </p>
                        <p className="text-xs text-muted-foreground" data-testid={`kanban-card-number-${variation.id}`}>
                          {variation.variationNumber}
                        </p>
                      </div>
                    </div>
                    {!projectIdFromUrl && (
                      <div className="flex items-center gap-2" data-testid={`kanban-card-project-${variation.id}`}>
                        <ProjectIcon
                          icon={projects.find(p => p.id === variation.projectId)?.icon || 'Briefcase'}
                          color={projects.find(p => p.id === variation.projectId)?.color || '#3b82f6'}
                          className="w-4 h-4"
                        />
                        <span className="text-xs text-muted-foreground truncate">
                          {getProjectName(variation.projectId)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-sm font-semibold" data-testid={`kanban-card-total-${variation.id}`}>
                        {formatCurrency(variation.totalAmount)}
                      </span>
                      {variation.approvalDeadline && (
                        <span className="text-xs text-muted-foreground" data-testid={`kanban-card-deadline-${variation.id}`}>
                          {formatDate(variation.approvalDeadline)}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  const CardListView = () => (
    <div className="space-y-1">
      {filteredVariations.map((variation) => (
        <div
          key={variation.id}
          className="group border rounded-md p-2 bg-card hover-elevate transition-all cursor-pointer"
          onClick={() => handleRowClick(variation.id)}
          data-testid={`variation-card-${variation.id}`}
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm line-clamp-1" data-testid={`variation-name-${variation.id}`}>
                  {variation.name}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {variation.variationNumber}
                </span>
              </div>
              {variation.description && (
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {variation.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {!projectIdFromUrl && (
                <Badge variant="default" className="h-4 px-1.5 text-[10px]" data-testid={`variation-project-${variation.id}`}>
                  {getProjectName(variation.projectId)}
                </Badge>
              )}

              {getStatusBadge(variation.status, "sm")}

              <div className="flex items-center gap-1 text-[10px] text-muted-foreground" data-testid={`variation-total-${variation.id}`}>
                <DollarSign className="h-3 w-3" />
                <span className="font-medium">{formatCurrency(variation.totalAmount)}</span>
              </div>

              {variation.approvalDeadline && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground" data-testid={`variation-deadline-${variation.id}`}>
                  <Calendar className="h-3 w-3" />
                  <span>{formatDate(variation.approvalDeadline)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col h-full" data-testid="page-variations">
      {/* Row 1 - Title & Actions (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            {pageTitle}
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-variation-count">
            {filteredVariations.length} variations
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={handleAddVariation}
            data-testid="button-add-variation"
          >
            <Plus className="w-3 h-3" />
            <span>Add Variation</span>
          </button>
        </div>
      </div>

      {/* Row 2 - View Tabs & Filters (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          {/* View Tabs */}
          <button
            onClick={() => setCurrentView('table')}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              currentView === 'table' 
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="button-table-view"
          >
            <LayoutList className="w-3 h-3" />
            <span>Table</span>
          </button>
          <button
            onClick={() => setCurrentView('kanban')}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              currentView === 'kanban' 
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="button-kanban-view"
          >
            <Columns3 className="w-3 h-3" />
            <span>Kanban</span>
          </button>

          <div className="w-px h-4 bg-border mx-1" />

          {/* Search */}
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search variations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="variations-search-input"
            />
          </div>

          {/* Status Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <button 
                className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                data-testid="filter-status-popover"
              >
                <span>Status</span>
                {selectedStatus !== "all" && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                    1
                  </Badge>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="space-y-1">
                {STATUS_OPTIONS.map((status) => (
                  <button
                    key={status.key}
                    onClick={() => setSelectedStatus(status.key)}
                    className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-between ${
                      selectedStatus === status.key ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
                    }`}
                    data-testid={`filter-status-${status.key}`}
                  >
                    <span>{status.label}</span>
                    {statusCounts[status.key as keyof typeof statusCounts] > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {statusCounts[status.key as keyof typeof statusCounts]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">
        {variationsLoading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground text-sm">Loading variations...</p>
          </div>
        ) : filteredVariations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <p className="text-muted-foreground text-sm">
              {variations.length === 0 ? "No variations found" : "No matching variations"}
            </p>
            {variations.length === 0 && (
              <button
                className="h-7 px-3 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-1"
                onClick={handleAddVariation}
                data-testid="button-add-first-variation"
              >
                <Plus className="w-3.5 h-3.5" />
                Add First Variation
              </button>
            )}
          </div>
        ) : currentView === "table" ? (
          <TableView />
        ) : (
          <KanbanView />
        )}
      </div>
    </div>
  );
}
