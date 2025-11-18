import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useProject } from "@/contexts/ProjectContext";
import { useParams } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  insertMinuteSchema, 
  type Minute, 
  type InsertMinute 
} from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ClipboardList,
  Plus,
  Search,
  MoreVertical,
  Edit3,
  Trash2,
  Calendar as CalendarIcon,
  MapPin,
  Users as UsersIcon,
  Building2,
  Pencil,
} from "lucide-react";
import { format } from "date-fns";
import { z } from "zod";

export default function Minutes() {
  const { id: projectId } = useParams();
  const { currentProject } = useProject();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMinute, setEditingMinute] = useState<Minute | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  // Determine context: use URL projectId, or current project context, or null for business
  const contextProjectId = projectId || currentProject?.id || null;

  // Form setup
  const form = useForm<InsertMinute>({
    resolver: zodResolver(insertMinuteSchema),
    defaultValues: {
      title: "",
      meetingDate: new Date(),
      location: "",
      attendees: [],
      contentHtml: "",
      contentText: "",
      projectId: contextProjectId || undefined,
    },
  });

  // Fetch all projects for display
  const { data: allProjects = [] } = useQuery({
    queryKey: ["/api/projects"],
  });

  // Fetch minutes
  const { data: minutes = [], isLoading } = useQuery<Minute[]>({
    queryKey: ["/api/minutes", contextProjectId || "business"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (contextProjectId) {
        params.append("projectId", contextProjectId);
      }
      const response = await fetch(`/api/minutes?${params}`, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!response.ok) throw new Error("Failed to fetch minutes");
      return response.json();
    },
  });

  // Helper to get project name by ID
  const getProjectName = (projectId: string | null) => {
    if (!projectId) return "Business";
    const project = allProjects.find((p: any) => p.id === projectId);
    return project?.name || "Unknown Project";
  };

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: InsertMinute) => {
      return await apiRequest("/api/minutes", "POST", data);
    },
    onSuccess: () => {
      // Invalidate all minute queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/minutes"] });
      // Force refetch of the current context
      queryClient.refetchQueries({ queryKey: ["/api/minutes", contextProjectId || "business"] });
      toast({ title: "Meeting minutes created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to create meeting minutes", variant: "destructive" });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertMinute> }) => {
      return await apiRequest(`/api/minutes/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      // Invalidate all minute queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/minutes"] });
      // Force refetch of the current context
      queryClient.refetchQueries({ queryKey: ["/api/minutes", contextProjectId || "business"] });
      toast({ title: "Meeting minutes updated successfully" });
      setIsDialogOpen(false);
      setEditingMinute(null);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to update meeting minutes", variant: "destructive" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/minutes/${id}`, "DELETE");
    },
    onSuccess: () => {
      // Invalidate all minute queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/minutes"] });
      // Force refetch of the current context
      queryClient.refetchQueries({ queryKey: ["/api/minutes", contextProjectId || "business"] });
      toast({ title: "Meeting minutes deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete meeting minutes", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertMinute) => {
    if (editingMinute) {
      updateMutation.mutate({ id: editingMinute.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (minute: Minute) => {
    setEditingMinute(minute);
    form.reset({
      title: minute.title,
      meetingDate: new Date(minute.meetingDate),
      location: minute.location || "",
      attendees: (minute.attendees as string[]) || [],
      contentHtml: minute.contentHtml || "",
      contentText: minute.contentText || "",
      projectId: minute.projectId || undefined,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete these meeting minutes?")) {
      deleteMutation.mutate(id);
    }
  };

  const filteredMinutes = minutes.filter((minute) => {
    const search = searchQuery.toLowerCase();
    return (
      minute.title.toLowerCase().includes(search) ||
      minute.location?.toLowerCase().includes(search) ||
      ((minute.attendees as string[]) || []).some((a: string) => a.toLowerCase().includes(search))
    );
  });

  return (
    <div className="flex flex-col h-full">
      {/* Single h-9 Header Row */}
      <div className="h-9 bg-background dark:bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        {/* Left: Title + Count */}
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Meeting Minutes</h2>
          <Badge variant="secondary" className="text-xs">
            {filteredMinutes.length} {filteredMinutes.length === 1 ? 'minute' : 'minutes'}
          </Badge>
        </div>

        {/* Right: Search + Add Button */}
        <div className="flex items-center gap-1.5">
          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search minutes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-6 pl-7 text-xs border rounded-md"
              data-testid="input-search"
            />
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                onClick={() => { setEditingMinute(null); form.reset(); }}
                size="sm"
                className="h-6 px-2 text-xs bg-[#bba7db] text-white hover:bg-[#bba7db]/90 gap-0.5"
                data-testid="button-create-minute"
              >
                <Plus className="w-3 h-3" />
                <span>Add Minutes</span>
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingMinute ? "Edit Meeting Minutes" : "New Meeting Minutes"}</DialogTitle>
              <DialogDescription>
                Record the details of your meeting. You can add an AI summary later from the detail view.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Meeting Title</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Weekly Site Meeting" {...field} data-testid="input-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="meetingDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Meeting Date</FormLabel>
                        <FormControl>
                          <Input 
                            type="datetime-local" 
                            {...field} 
                            value={field.value ? new Date(field.value).toISOString().slice(0, 16) : ''}
                            onChange={(e) => field.onChange(new Date(e.target.value))}
                            data-testid="input-meeting-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Site Office" {...field} value={field.value || ""} data-testid="input-location" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="attendees"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Attendees</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Comma-separated names" 
                          {...field}
                          value={Array.isArray(field.value) ? field.value.join(", ") : ""}
                          onChange={(e) => field.onChange(e.target.value.split(",").map((s: string) => s.trim()).filter((s: string) => s))}
                          data-testid="input-attendees"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contentText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Meeting Notes</FormLabel>
                      <FormControl>
                        <textarea 
                          className="w-full min-h-[200px] p-3 border rounded-md" 
                          placeholder="Enter meeting notes and discussion points..."
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => {
                            field.onChange(e.target.value);
                            form.setValue("contentHtml", `<p>${e.target.value}</p>`);
                          }}
                          data-testid="input-content"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit">
                    {editingMinute ? "Update" : "Create"} Minutes
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Content Area - Card Grid */}
      <div className="flex-1 overflow-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Loading...
          </div>
        ) : filteredMinutes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No meeting minutes found</h3>
            <p className="text-muted-foreground text-sm">
              {searchQuery ? "Try adjusting your search" : "Get started by creating your first meeting minutes"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filteredMinutes.map((minute) => (
              <MinuteCard
                key={minute.id}
                minute={minute}
                getProjectName={getProjectName}
                contextProjectId={contextProjectId}
                handleEdit={handleEdit}
                handleDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Minute Card Component
function MinuteCard({ 
  minute, 
  getProjectName, 
  contextProjectId, 
  handleEdit, 
  handleDelete 
}: {
  minute: Minute;
  getProjectName: (projectId: string | null) => string;
  contextProjectId: string | null;
  handleEdit: (minute: Minute) => void;
  handleDelete: (id: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const attendees = (minute.attendees as string[]) || [];
  
  return (
    <Card
      className={`h-20 transition-all duration-200 cursor-pointer rounded-xl border-border/50 ${
        isHovered ? 'shadow-xl scale-[1.01]' : 'shadow-sm'
      }`}
      onClick={() => window.location.href = `/minutes/${minute.id}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={`minute-card-${minute.id}`}
    >
      <CardContent className="p-2 h-full flex flex-col justify-between">
        {/* Top row: Title + Date Badge */}
        <div className="flex items-start gap-1.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-1">
              <h3 className="text-sm leading-5 truncate flex-1 text-foreground font-medium" data-testid={`minute-title-${minute.id}`}>
                {minute.title}
              </h3>
              
              {/* Date badge */}
              <Badge 
                className="text-[10px] px-1.5 py-0 h-4 rounded-full border no-default-hover-elevate no-default-active-elevate shrink-0"
                style={{
                  backgroundColor: '#bba7db15',
                  color: '#bba7db',
                  borderColor: '#bba7db30'
                }}
              >
                <CalendarIcon className="h-2 w-2 mr-0.5" />
                {format(new Date(minute.meetingDate), 'MMM d')}
              </Badge>
            </div>

            {/* Metadata line below title */}
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
              {minute.location && (
                <span className="flex items-center gap-0.5 truncate">
                  <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
                  {minute.location}
                </span>
              )}
              {attendees.length > 0 && (
                <span className="flex items-center gap-0.5">
                  <UsersIcon className="h-2.5 w-2.5" />
                  {attendees.length} {attendees.length === 1 ? 'attendee' : 'attendees'}
                </span>
              )}
            </div>
          </div>

          {/* Pencil icon on hover */}
          {isHovered && (
            <Pencil className="h-3 w-3 text-[#bba7db] shrink-0" />
          )}
        </div>

        {/* Bottom row: Project Badge + Actions */}
        <div className="flex items-center justify-between">
          {/* Project badge */}
          {!contextProjectId && (
            <Badge 
              variant="outline" 
              className="text-[10px] px-1.5 py-0 h-4 rounded-full bg-background border-border/50 no-default-hover-elevate no-default-active-elevate truncate max-w-[180px]"
            >
              <Building2 className="h-2 w-2 mr-0.5" />
              <span className="truncate">{getProjectName(minute.projectId)}</span>
            </Badge>
          )}
          {contextProjectId && <div />}

          {/* Actions dropdown */}
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-5 w-5 rounded-md hover-elevate active-elevate-2 flex items-center justify-center" data-testid={`button-actions-${minute.id}`}>
                  <MoreVertical className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEdit(minute)} data-testid={`menu-edit-${minute.id}`}>
                  <Edit3 className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDelete(minute.id)} data-testid={`menu-delete-${minute.id}`} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
