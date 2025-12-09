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
  ClipboardList,
  ArrowRight,
} from "lucide-react";
import { type Rfq, type Project, type Supplier } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { format } from "date-fns";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Building2, Trash2 } from "lucide-react";

export default function RFQs() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const params = useParams<{ projectId?: string }>();
  const projectIdFromUrl = params.projectId || "";

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  
  // Standalone RFQ form state
  const [rfqForm, setRfqForm] = useState({
    title: "",
    description: "",
    projectId: "",
    supplierIds: [] as string[],
    scope: "",
    dueDate: null as Date | null,
    items: [] as { description: string; quantity: string; unit: string }[],
  });

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

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const resetRfqForm = () => {
    setRfqForm({
      title: "",
      description: "",
      projectId: "",
      supplierIds: [],
      scope: "",
      dueDate: null,
      items: [],
    });
  };

  const createRfqMutation = useMutation({
    mutationFn: async (data: typeof rfqForm) => {
      const selectedSuppliers = suppliers.filter(s => data.supplierIds.includes(s.id));
      const supplierNames = selectedSuppliers.map(s => s.name);
      
      const rfq = await apiRequest("/api/rfqs", "POST", {
        projectId: data.projectId,
        title: data.title,
        description: data.description,
        scope: data.scope,
        dueDate: data.dueDate?.toISOString(),
        supplierIds: data.supplierIds,
        supplierNames,
        attachmentUrls: [],
      });

      if (data.items.length > 0) {
        await Promise.all(data.items.map((item, index) =>
          apiRequest("/api/rfq-items", "POST", {
            rfqId: rfq.id,
            description: item.description,
            quantity: parseFloat(item.quantity) || 0,
            unit: item.unit,
            notes: "",
            displayOrder: index,
          })
        ));
      }

      return rfq;
    },
    onSuccess: (rfq) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs"] });
      toast({ title: "RFQ created", description: `Created "${rfq.title}"` });
      setShowCreateDialog(false);
      resetRfqForm();
      setLocation(`/rfqs/${rfq.id}`);
    },
    onError: (error: any) => {
      toast({ title: "Failed to create RFQ", description: error.message, variant: "destructive" });
    },
  });

  const handleCreateRfq = () => {
    if (!rfqForm.title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    if (!rfqForm.projectId) {
      toast({ title: "Project required", variant: "destructive" });
      return;
    }
    if (rfqForm.supplierIds.length === 0) {
      toast({ title: "Select at least one supplier", variant: "destructive" });
      return;
    }
    createRfqMutation.mutate(rfqForm);
  };

  const addItem = () => {
    setRfqForm(prev => ({
      ...prev,
      items: [...prev.items, { description: "", quantity: "", unit: "each" }],
    }));
  };

  const updateItem = (index: number, field: string, value: string) => {
    setRfqForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, [field]: value } : item),
    }));
  };

  const removeItem = (index: number) => {
    setRfqForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const toggleSupplier = (supplierId: string) => {
    setRfqForm(prev => ({
      ...prev,
      supplierIds: prev.supplierIds.includes(supplierId)
        ? prev.supplierIds.filter(id => id !== supplierId)
        : [...prev.supplierIds, supplierId],
    }));
  };

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
          onClick={() => setShowCreateDialog(true)}
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
          searchQuery || statusFilter !== "all" ? (
            <Card className="p-8 text-center text-muted-foreground">
              No RFQs match your search
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="w-20 h-20 rounded-full bg-[#bba7db]/10 flex items-center justify-center mb-6">
                <ClipboardList className="w-10 h-10 text-[#bba7db]" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No Requests for Quote yet</h3>
              <p className="text-muted-foreground text-center max-w-md mb-8">
                Request quotes from your suppliers to get competitive pricing on materials and services for your projects.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white gap-2"
                  data-testid="button-create-rfq-empty"
                >
                  <Plus className="w-4 h-4" />
                  Create New RFQ
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setLocation("/estimates")}
                  className="gap-2"
                  data-testid="button-rfq-from-estimate"
                >
                  <FileText className="w-4 h-4" />
                  Create from Estimate
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )
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

      {/* Create RFQ Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        if (!open) resetRfqForm();
        setShowCreateDialog(open);
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Request for Quote</DialogTitle>
            <DialogDescription>
              Request pricing from your suppliers
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="rfq-title" className="text-xs">Title *</Label>
              <Input
                id="rfq-title"
                value={rfqForm.title}
                onChange={(e) => setRfqForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Timber Supply for Kitchen Renovation"
                className="h-8 text-sm"
                data-testid="input-rfq-title"
              />
            </div>

            {/* Project */}
            <div className="space-y-1.5">
              <Label className="text-xs">Project *</Label>
              <Select 
                value={rfqForm.projectId} 
                onValueChange={(v) => setRfqForm(prev => ({ ...prev, projectId: v }))}
              >
                <SelectTrigger className="h-8 text-sm" data-testid="select-rfq-project">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      <div className="flex items-center gap-2">
                        <ProjectIcon color={project.color} size="sm" />
                        {project.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="rfq-description" className="text-xs">Description</Label>
              <Textarea
                id="rfq-description"
                value={rfqForm.description}
                onChange={(e) => setRfqForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of what you're requesting"
                className="text-sm min-h-[60px]"
                data-testid="input-rfq-description"
              />
            </div>

            {/* Scope */}
            <div className="space-y-1.5">
              <Label htmlFor="rfq-scope" className="text-xs">Scope of Work</Label>
              <Textarea
                id="rfq-scope"
                value={rfqForm.scope}
                onChange={(e) => setRfqForm(prev => ({ ...prev, scope: e.target.value }))}
                placeholder="Detailed scope including specifications, quantities, delivery requirements..."
                className="text-sm min-h-[80px]"
                data-testid="input-rfq-scope"
              />
            </div>

            {/* Due Date */}
            <div className="space-y-1.5">
              <Label className="text-xs">Response Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-8 text-sm justify-start font-normal" data-testid="button-rfq-due-date">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {rfqForm.dueDate ? format(rfqForm.dueDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={rfqForm.dueDate || undefined}
                    onSelect={(date) => setRfqForm(prev => ({ ...prev, dueDate: date || null }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Suppliers */}
            <div className="space-y-1.5">
              <Label className="text-xs">Suppliers * (select one or more)</Label>
              <div className="border rounded-md p-2 max-h-[120px] overflow-y-auto space-y-1">
                {suppliers.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No suppliers found. Add suppliers first.
                  </p>
                ) : (
                  suppliers.map((supplier) => (
                    <label
                      key={supplier.id}
                      className="flex items-center gap-2 p-1.5 rounded hover-elevate cursor-pointer"
                      data-testid={`checkbox-supplier-${supplier.id}`}
                    >
                      <Checkbox
                        checked={rfqForm.supplierIds.includes(supplier.id)}
                        onCheckedChange={() => toggleSupplier(supplier.id)}
                      />
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">{supplier.name}</span>
                    </label>
                  ))
                )}
              </div>
              {rfqForm.supplierIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {rfqForm.supplierIds.length} supplier(s) selected
                </p>
              )}
            </div>

            {/* Line Items */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Line Items (optional)</Label>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  onClick={addItem}
                  className="h-6 text-xs"
                  data-testid="button-add-rfq-item"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Item
                </Button>
              </div>
              {rfqForm.items.length > 0 && (
                <div className="space-y-2">
                  {rfqForm.items.map((item, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <Input
                        value={item.description}
                        onChange={(e) => updateItem(index, "description", e.target.value)}
                        placeholder="Description"
                        className="flex-1 h-7 text-xs"
                        data-testid={`input-item-description-${index}`}
                      />
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, "quantity", e.target.value)}
                        placeholder="Qty"
                        className="w-16 h-7 text-xs"
                        data-testid={`input-item-quantity-${index}`}
                      />
                      <Select value={item.unit} onValueChange={(v) => updateItem(index, "unit", v)}>
                        <SelectTrigger className="w-20 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="each">each</SelectItem>
                          <SelectItem value="m">m</SelectItem>
                          <SelectItem value="m2">m2</SelectItem>
                          <SelectItem value="m3">m3</SelectItem>
                          <SelectItem value="lm">lm</SelectItem>
                          <SelectItem value="kg">kg</SelectItem>
                          <SelectItem value="hr">hr</SelectItem>
                          <SelectItem value="lot">lot</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeItem(index)}
                        data-testid={`button-remove-item-${index}`}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowCreateDialog(false)}
              data-testid="button-cancel-rfq"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateRfq}
              disabled={createRfqMutation.isPending}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
              data-testid="button-submit-rfq"
            >
              {createRfqMutation.isPending ? "Creating..." : "Create RFQ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
