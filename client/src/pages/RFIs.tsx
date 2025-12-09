import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Plus,
  HelpCircle,
  MoreHorizontal,
  Search,
  Clock,
  CheckCircle2,
  Send,
  CalendarIcon,
  AlertCircle,
  FileText,
  Users,
} from "lucide-react";
import { type Rfi, type Project, type Contact, type User } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { useRfiStatusOptions } from "@/hooks/useRfiStatusOptions";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const rfiFormSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  question: z.string().min(10, "Question must be at least 10 characters"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  dueDate: z.date().optional(),
  directedToType: z.enum(["user", "contact", "supplier"]),
  directedToId: z.string().min(1, "Please select who this is directed to"),
});

type RFIFormValues = z.infer<typeof rfiFormSchema>;

export default function RFIs() {
  const [, setLocation] = useLocation();
  const params = useParams<{ projectId?: string }>();
  const projectIdFromUrl = params.projectId || "";
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { statusOptions, getStatusInfo } = useRfiStatusOptions();

  const queryParams: Record<string, string> = {};
  if (projectIdFromUrl) {
    queryParams.projectId = projectIdFromUrl;
  }

  const { data: rfis = [], isLoading } = useQuery<Rfi[]>({
    queryKey: ["/api/rfis", queryParams],
    queryFn: async () => {
      const params = new URLSearchParams(queryParams);
      const queryString = params.toString();
      const url = queryString ? `/api/rfis?${queryString}` : "/api/rfis";
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

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/team-members"],
  });

  const form = useForm<RFIFormValues>({
    resolver: zodResolver(rfiFormSchema),
    defaultValues: {
      subject: "",
      question: "",
      priority: "normal",
      directedToType: "contact",
      directedToId: "",
    },
  });

  const getProject = (projectId: string) => {
    return projects.find((p) => p.id === projectId);
  };

  const filteredRFIs = useMemo(() => {
    return rfis.filter((rfi) => {
      const matchesSearch =
        searchQuery === "" ||
        rfi.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rfi.rfiNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rfi.directedToName?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || rfi.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [rfis, searchQuery, statusFilter]);

  const handleSubmit = async (values: RFIFormValues) => {
    if (!projectIdFromUrl) {
      toast({
        title: "Error",
        description: "Please select a project first",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      let directedToName = "";
      if (values.directedToType === "contact") {
        const contact = contacts.find(c => c.id === values.directedToId);
        directedToName = contact?.name || "";
      } else if (values.directedToType === "user") {
        const user = users.find(u => u.id === values.directedToId);
        directedToName = user?.name || user?.email || "";
      }

      const response = await apiRequest("/api/rfis", "POST", {
        projectId: projectIdFromUrl,
        subject: values.subject,
        question: values.question,
        priority: values.priority,
        dueDate: values.dueDate?.toISOString(),
        directedToType: values.directedToType,
        directedToId: values.directedToId,
        directedToName,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/rfis"] });
      
      toast({
        title: "RFI Created",
        description: `Created RFI "${response.rfiNumber}"`,
      });

      setIsCreateDialogOpen(false);
      form.reset();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create RFI",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRowClick = (rfiId: string) => {
    if (projectIdFromUrl) {
      setLocation(`/projects/${projectIdFromUrl}/rfis/${rfiId}`);
    } else {
      setLocation(`/rfis/${rfiId}`);
    }
  };

  const getDirectedToOptions = () => {
    const directedToType = form.watch("directedToType");
    if (directedToType === "contact") {
      return contacts.map(c => ({ id: c.id, name: c.name, email: c.email }));
    }
    if (directedToType === "user") {
      return users.map(u => ({ id: u.id, name: u.name || u.email, email: u.email }));
    }
    return [];
  };

  const getPriorityBadge = (priority: string) => {
    const config: Record<string, { color: string; label: string }> = {
      low: { color: "bg-gray-100 text-gray-800", label: "Low" },
      normal: { color: "bg-blue-100 text-blue-800", label: "Normal" },
      high: { color: "bg-orange-100 text-orange-800", label: "High" },
      urgent: { color: "bg-red-100 text-red-800", label: "Urgent" },
    };
    const { color, label } = config[priority] || config.normal;
    return <Badge className={color}>{label}</Badge>;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Row 1 - Title & Actions (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            Requests for Information
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-rfi-count">
            {filteredRFIs.length} RFIs
          </Badge>
        </div>
        <button
          className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
          onClick={() => setLocation("/rfis/new")}
          data-testid="button-create-rfi"
        >
          <Plus className="w-3 h-3" />
          <span>Create RFI</span>
        </button>
      </div>

      {/* Row 2 - Search & Filters (36px) */}
      <div className="h-9 bg-background flex items-center px-2 border-b border-border flex-shrink-0 gap-1.5">
        <div className="relative w-48">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="Search RFIs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-7 pr-2 py-0 h-6 text-xs border"
            data-testid="input-search-rfis"
          />
        </div>
        <div className="w-px h-4 bg-border" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-6 w-[130px] text-xs" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statusOptions.map((status) => (
              <SelectItem key={status.key} value={status.key}>
                {status.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">
        {isLoading ? (
          <Card className="p-8 text-center text-muted-foreground">
            Loading RFIs...
          </Card>
        ) : filteredRFIs.length === 0 ? (
          searchQuery || statusFilter !== "all" ? (
            <Card className="p-8 text-center text-muted-foreground">
              No RFIs match your search
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="w-20 h-20 rounded-full bg-[#bba7db]/10 flex items-center justify-center mb-6">
                <HelpCircle className="w-10 h-10 text-[#bba7db]" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No Requests for Information yet</h3>
              <p className="text-muted-foreground text-center max-w-md mb-8">
                Create RFIs to request clarification from architects, engineers, clients, or other stakeholders on your projects.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => setLocation("/rfis/new")}
                  className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white gap-2"
                  data-testid="button-create-rfi-empty"
                >
                  <Plus className="w-4 h-4" />
                  Create New RFI
                </Button>
              </div>
            </div>
          )
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>RFI Number</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Directed To</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRFIs.map((rfi) => {
                  const project = getProject(rfi.projectId);
                  const statusInfo = getStatusInfo(rfi.status);
                  const isOverdue = rfi.dueDate && isPast(new Date(rfi.dueDate)) && rfi.status !== "closed" && rfi.status !== "answered";
                  
                  return (
                    <TableRow
                      key={rfi.id}
                      className="cursor-pointer h-10 hover-elevate active-elevate-2"
                      onClick={() => handleRowClick(rfi.id)}
                      data-testid={`row-rfi-${rfi.id}`}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <HelpCircle className="h-4 w-4 text-muted-foreground" />
                          {rfi.rfiNumber}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{rfi.subject}</div>
                        {rfi.question && (
                          <div className="text-sm text-muted-foreground line-clamp-1">
                            {rfi.question}
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
                        <div className="flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{rfi.directedToName || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {rfi.dueDate ? (
                          <div className={`flex items-center gap-1 text-sm ${isOverdue ? "text-destructive" : ""}`}>
                            {isOverdue && <AlertCircle className="h-3.5 w-3.5" />}
                            {format(new Date(rfi.dueDate), "MMM d, yyyy")}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{getPriorityBadge(rfi.priority || "normal")}</TableCell>
                      <TableCell>
                        <Badge style={{ backgroundColor: statusInfo.color, color: "#fff" }}>
                          {statusInfo.name}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(rfi.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              data-testid={`button-rfi-actions-${rfi.id}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRowClick(rfi.id);
                              }}
                            >
                              <HelpCircle className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            {rfi.status === "draft" && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                              >
                                <Send className="mr-2 h-4 w-4" />
                                Send RFI
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

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New RFI</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                {...form.register("subject")}
                placeholder="e.g., Clarification needed on foundation specs"
                data-testid="input-rfi-subject"
              />
              {form.formState.errors.subject && (
                <p className="text-sm text-destructive">{form.formState.errors.subject.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="question">Question / Details</Label>
              <Textarea
                id="question"
                {...form.register("question")}
                placeholder="Describe the information you need..."
                className="min-h-[120px]"
                data-testid="textarea-rfi-question"
              />
              {form.formState.errors.question && (
                <p className="text-sm text-destructive">{form.formState.errors.question.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={form.watch("priority")}
                  onValueChange={(val) => form.setValue("priority", val as any)}
                >
                  <SelectTrigger data-testid="select-rfi-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Due Date (Optional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      data-testid="button-rfi-due-date"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.watch("dueDate") ? (
                        format(form.watch("dueDate")!, "PPP")
                      ) : (
                        <span>Pick a date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={form.watch("dueDate")}
                      onSelect={(date) => form.setValue("dueDate", date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Directed To (Type)</Label>
                <Select
                  value={form.watch("directedToType")}
                  onValueChange={(val) => {
                    form.setValue("directedToType", val as any);
                    form.setValue("directedToId", "");
                  }}
                >
                  <SelectTrigger data-testid="select-directed-to-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contact">Contact</SelectItem>
                    <SelectItem value="user">Team Member</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Directed To</Label>
                <Select
                  value={form.watch("directedToId")}
                  onValueChange={(val) => form.setValue("directedToId", val)}
                >
                  <SelectTrigger data-testid="select-directed-to-id">
                    <SelectValue placeholder="Select person..." />
                  </SelectTrigger>
                  <SelectContent>
                    {getDirectedToOptions().map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name} {option.email && `(${option.email})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.directedToId && (
                  <p className="text-sm text-destructive">{form.formState.errors.directedToId.message}</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} data-testid="button-submit-rfi">
                {isSubmitting ? "Creating..." : "Create RFI"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
