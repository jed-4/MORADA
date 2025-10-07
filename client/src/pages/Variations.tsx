import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, FileText, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
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

  const [activeTab, setActiveTab] = useState("table");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

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

  const getProject = (projectId: string) => {
    return projects.find((p) => p.id === projectId);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(amount / 100);
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "-";
    return format(new Date(date), "dd MMM yyyy");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return (
          <Badge variant="secondary" data-testid={`badge-status-draft`}>
            <FileText className="w-3 h-3 mr-1" />
            Draft
          </Badge>
        );
      case "action":
        return (
          <Badge variant="destructive" data-testid={`badge-status-action`}>
            <AlertCircle className="w-3 h-3 mr-1" />
            Action
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="default" data-testid={`badge-status-pending`}>
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      case "approved":
        return (
          <Badge variant="outline" className="border-green-500 text-green-700" data-testid={`badge-status-approved`}>
            <CheckCircle className="w-3 h-3 mr-1" />
            Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="outline" className="border-red-500 text-red-700" data-testid={`badge-status-rejected`}>
            <XCircle className="w-3 h-3 mr-1" />
            Rejected
          </Badge>
        );
      default:
        return <Badge variant="outline" data-testid={`badge-status-${status}`}>{status}</Badge>;
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
                <span className="text-muted-foreground" data-testid="text-loading">Loading variations...</span>
              </TableCell>
            </TableRow>
          ) : variations.length === 0 ? (
            <TableRow>
              <TableCell colSpan={projectIdFromUrl ? 5 : 6} className="text-center py-8">
                <span className="text-muted-foreground" data-testid="text-no-variations">No variations found</span>
              </TableCell>
            </TableRow>
          ) : (
            variations.map((variation) => (
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
      {STATUS_OPTIONS.slice(1).map((statusOption) => (
        <div key={statusOption.key} className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-3 py-2 bg-muted rounded-md">
            <h3 className="font-medium text-sm" data-testid={`kanban-column-${statusOption.key}`}>
              {statusOption.label}
            </h3>
            <Badge variant="secondary" data-testid={`kanban-count-${statusOption.key}`}>
              {variations.filter((v) => v.status === statusOption.key).length}
            </Badge>
          </div>
          <div className="flex flex-col gap-2">
            {variations
              .filter((v) => v.status === statusOption.key)
              .map((variation) => (
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
      ))}
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="page-variations">
      <div className="flex-none p-6 border-b">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            Variations
          </h1>
          <Button onClick={handleAddVariation} data-testid="button-add-variation">
            <Plus className="h-4 w-4 mr-2" />
            Add Variation
          </Button>
        </div>
      </div>

      <div className="flex-none px-6 pt-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="tabs-view">
          <TabsList data-testid="tabs-list">
            <TabsTrigger value="table" data-testid="tab-trigger-table">
              Table
            </TabsTrigger>
            <TabsTrigger value="kanban" data-testid="tab-trigger-kanban">
              Kanban
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap gap-2 mt-4">
            {STATUS_OPTIONS.map((status) => (
              <Badge
                key={status.key}
                variant={selectedStatus === status.key ? "default" : "outline"}
                className="cursor-pointer hover-elevate"
                onClick={() => setSelectedStatus(status.key)}
                data-testid={`filter-status-${status.key}`}
              >
                {status.label}
                {statusCounts[status.key as keyof typeof statusCounts] > 0 && (
                  <span className="ml-1.5">
                    ({statusCounts[status.key as keyof typeof statusCounts]})
                  </span>
                )}
              </Badge>
            ))}
          </div>

          <div className="mt-6">
            <TabsContent value="table" className="mt-0" data-testid="tab-content-table">
              <TableView />
            </TabsContent>

            <TabsContent value="kanban" className="mt-0" data-testid="tab-content-kanban">
              <KanbanView />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
