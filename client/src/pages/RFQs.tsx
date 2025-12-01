import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  FileText,
  MoreHorizontal,
  Search,
  Filter,
  Download,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { type Rfq, type Project } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { format } from "date-fns";

export default function RFQs() {
  const [, setLocation] = useLocation();
  const params = useParams<{ projectId?: string }>();
  const projectIdFromUrl = params.projectId || "";

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const queryParams: Record<string, string> = {};
  if (projectIdFromUrl) {
    queryParams.projectId = projectIdFromUrl;
  }

  const { data: rfqs = [], isLoading } = useQuery<Rfq[]>({
    queryKey: ["/api/rfqs", queryParams],
    queryFn: async () => {
      const params = new URLSearchParams(queryParams);
      const queryString = params.toString();
      const url = queryString ? `/api/rfqs?${queryString}` : "/api/rfqs";
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

  const getProject = (projectId: string) => {
    return projects.find((p) => p.id === projectId);
  };

  const filteredRFQs = useMemo(() => {
    return rfqs.filter((rfq) => {
      const matchesSearch =
        searchQuery === "" ||
        rfq.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rfq.rfqNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rfq.supplierNames.some((name) =>
          name.toLowerCase().includes(searchQuery.toLowerCase())
        );

      const matchesStatus =
        statusFilter === "all" || rfq.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [rfqs, searchQuery, statusFilter]);

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { label: "Draft", variant: "secondary" as const, icon: FileText },
      sent: { label: "Sent", variant: "default" as const, icon: Send },
      pending: { label: "Pending", variant: "outline" as const, icon: Clock },
      quoted: { label: "Quoted", variant: "default" as const, icon: CheckCircle2 },
      accepted: { label: "Accepted", variant: "default" as const, icon: CheckCircle2 },
      declined: { label: "Declined", variant: "destructive" as const, icon: XCircle },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const handleRowClick = (rfqId: string) => {
    setLocation(`/rfqs/${rfqId}`);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Row 1 - Title & Actions (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            Requests for Quote
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-rfq-count">
            {filteredRFQs.length} RFQs
          </Badge>
        </div>
        <button
          className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
          onClick={() => setLocation("/estimates")}
          data-testid="button-create-rfq"
        >
          <Plus className="w-3 h-3" />
          <span>Create RFQ</span>
        </button>
      </div>

      {/* Row 2 - Search & Filters (36px) */}
      <div className="h-9 bg-background flex items-center px-2 border-b border-border flex-shrink-0 gap-1.5">
        <div className="relative w-48">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="Search RFQs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-7 pr-2 py-0 h-6 text-xs border"
            data-testid="input-search-rfqs"
          />
        </div>
        <div className="w-px h-4 bg-border" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-6 w-[130px] text-xs" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="quoted">Quoted</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="declined">Declined</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">
        {isLoading ? (
          <Card className="p-8 text-center text-muted-foreground">
            Loading RFQs...
          </Card>
        ) : filteredRFQs.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            {searchQuery || statusFilter !== "all"
              ? "No RFQs match your search"
              : "No RFQs yet. Create one from an estimate to get started."}
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>RFQ Number</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Suppliers</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRFQs.map((rfq) => {
                  const project = getProject(rfq.projectId);
                  return (
                    <TableRow
                      key={rfq.id}
                      className="cursor-pointer h-10 hover-elevate active-elevate-2"
                      onClick={() => handleRowClick(rfq.id)}
                      data-testid={`row-rfq-${rfq.id}`}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          {rfq.rfqNumber}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{rfq.title}</div>
                        {rfq.description && (
                          <div className="text-sm text-muted-foreground line-clamp-1">
                            {rfq.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {project && (
                          <div className="flex items-center gap-2">
                            <ProjectIcon
                              color={project.color}
                              size="sm"
                              className="shrink-0"
                            />
                            <span className="truncate">{project.name}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {rfq.supplierNames.slice(0, 2).map((name, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {name}
                            </Badge>
                          ))}
                          {rfq.supplierNames.length > 2 && (
                            <Badge variant="secondary" className="text-xs">
                              +{rfq.supplierNames.length - 2} more
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {rfq.dueDate ? (
                          <span className="text-sm">
                            {format(new Date(rfq.dueDate), "MMM d, yyyy")}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(rfq.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(rfq.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              data-testid={`button-rfq-actions-${rfq.id}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRowClick(rfq.id);
                              }}
                            >
                              <FileText className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                // TODO: Download PDF
                              }}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Download PDF
                            </DropdownMenuItem>
                            {rfq.status === "draft" && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // TODO: Send RFQ
                                }}
                              >
                                <Send className="mr-2 h-4 w-4" />
                                Send RFQ
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
