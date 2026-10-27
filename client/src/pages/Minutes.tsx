import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { useProject } from "@/contexts/ProjectContext";
import { useParams, useLocation } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { ProjectSelect } from "@/components/ProjectSelect";
import { HybridAttendeeSelector, type Attendee } from "@/components/HybridAttendeeSelector";
import { attendeeNames } from "@shared/minuteAttendees";

/** A Date as the value a <input type="datetime-local"> expects, in LOCAL time. */
function toLocalDateTimeInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
import { z } from "zod";

export default function Minutes({ embedded }: { embedded?: boolean } = {}) {
  const { id: projectId } = useParams();
  // Cards used to navigate with window.location.href, which reloads the whole
  // SPA — about 25 seconds on this app before anything appears. It reads as
  // "the minute won't open". Client-side routing is instant.
  const [, navigate] = useLocation();
  const { currentProject } = useProject();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMinute, setEditingMinute] = useState<Minute | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ title: string; description?: string; confirmLabel?: string; destructive?: boolean; run: () => void } | null>(null);
  const { toast } = useToast();
  const pageTitle = usePageTitle({ pageName: "Minutes" });

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
  const { data: allProjects = [] } = useQuery<Array<{ id: string; name: string }>>({
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
      attendees: (minute.attendees as Attendee[]) || [],
      contentHtml: minute.contentHtml || "",
      contentText: minute.contentText || "",
      projectId: minute.projectId || undefined,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setConfirmAction({
      title: "Delete these meeting minutes?",
      description: "This cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
      run: () => deleteMutation.mutate(id),
    });
  };

  const filteredMinutes = minutes.filter((minute) => {
    const search = searchQuery.toLowerCase();
    return (
      minute.title.toLowerCase().includes(search) ||
      minute.location?.toLowerCase().includes(search) ||
      // Through attendeeNames, because an attendee is not always a string. It
      // can be {name, userId} or {name, contactId}, and `a.toLowerCase()` on
      // one of those threw — taking the whole minutes list down with it.
      attendeeNames(minute.attendees).some((a) => a.toLowerCase().includes(search))
    );
  });

  return (
    <div className="flex flex-col h-full">
      {!embedded && (
        <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">
            {projectId && currentProject ? currentProject.name : "All Projects"}
          </span>
          <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
          <span className="text-xs font-medium text-foreground" data-testid="text-page-title">Minutes</span>
        </div>
      )}
      {/* One toolbar row, matching Bills and the other list pages: search on the
          left, actions on the right. The page title used to be repeated here as
          an <h2> showing usePageTitle's "All Projects · Minutes", directly under
          the breadcrumb that already said the same thing — so the page read
          "All Projects / Minutes" and then "All Projects · Minutes" again. */}
      <div className="h-9 bg-background flex items-center gap-2 px-3 border-b border-border flex-shrink-0">
        <div className="relative flex-shrink-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="Search minutes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-7 pr-2 py-0 h-6 text-xs w-44 border border-border/50"
            data-testid="input-search"
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
          {filteredMinutes.length} {filteredMinutes.length === 1 ? 'minute' : 'minutes'}
        </span>

        <div className="flex-1" />

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <button
                onClick={() => { setEditingMinute(null); form.reset(); }}
                className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5 flex-shrink-0"
                data-testid="button-create-minute"
              >
                <Plus className="w-3 h-3" />
                <span>New Minutes</span>
              </button>
            </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editingMinute ? "Edit meeting details" : "New meeting minutes"}</DialogTitle>
              <DialogDescription>
                {editingMinute
                  ? "The notes themselves are written in the minutes — save this and open it."
                  : "Set the meeting up here, then open it to write the notes."}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Meeting title</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Weekly site meeting" className="h-8 text-sm" {...field} data-testid="input-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="meetingDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Date and time</FormLabel>
                        <FormControl>
                          {/* Formatted in LOCAL time. This used to render with
                              toISOString(), which is UTC — so an Australian
                              meeting showed 11 hours out and saving it moved
                              the meeting. */}
                          <Input
                            type="datetime-local"
                            className="h-8 text-sm"
                            value={toLocalDateTimeInput(field.value as any)}
                            onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : null)}
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
                        <FormLabel className="text-xs">Location</FormLabel>
                        <FormControl>
                          <Input placeholder="Site office, Zoom…" className="h-8 text-sm" {...field} value={field.value || ""} data-testid="input-location" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Which job these belong to. There was no way to set this at
                    all: minutes silently took whatever page you happened to be
                    on, and could never be moved afterwards. */}
                <FormField
                  control={form.control}
                  name="projectId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Project</FormLabel>
                      <FormControl>
                        <ProjectSelect
                          value={field.value || undefined}
                          onValueChange={(v) => field.onChange(v || null)}
                          placeholder="Business (no project)"
                          allowNone
                          className="h-8 text-sm"
                          data-testid="select-project"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="attendees"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Attendees</FormLabel>
                      <FormControl>
                        {/* The same selector the minutes themselves use, so a
                            name typed here can be a real contact instead of a
                            string in a comma-separated list. */}
                        <HybridAttendeeSelector
                          value={(field.value as Attendee[]) || []}
                          onChange={(next) => field.onChange(next)}
                          projectId={(form.watch("projectId") as string) || undefined}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel">
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit">
                    {editingMinute ? "Save" : "Create minutes"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Content Area - Card Grid */}
      <div className="flex-1 overflow-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Loading...
          </div>
        ) : filteredMinutes.length === 0 ? (
          <EmptyState
            variant="card"
            icon={ClipboardList}
            title="No meeting minutes found"
            description={searchQuery ? "Try adjusting your search" : "Get started by creating your first meeting minutes"}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filteredMinutes.map((minute) => (
              <MinuteCard
                key={minute.id}
                minute={minute}
                navigate={navigate}
                getProjectName={getProjectName}
                contextProjectId={contextProjectId}
                handleEdit={handleEdit}
                handleDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(o) => { if (!o) setConfirmAction(null); }}
        title={confirmAction?.title ?? ""}
        description={confirmAction?.description}
        confirmLabel={confirmAction?.confirmLabel ?? "Confirm"}
        destructive={confirmAction?.destructive}
        onConfirm={() => { confirmAction?.run(); setConfirmAction(null); }}
      />
    </div>
  );
}

// Minute Card Component
function MinuteCard({ 
  minute, 
  getProjectName, 
  contextProjectId, 
  handleEdit, 
  handleDelete,
  navigate,
}: {
  minute: Minute;
  getProjectName: (projectId: string | null) => string;
  contextProjectId: string | null;
  handleEdit: (minute: Minute) => void;
  handleDelete: (id: string) => void;
  navigate: (to: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const attendees = attendeeNames(minute.attendees);
  
  return (
    <Card
      className={`h-20 transition-all duration-200 cursor-pointer rounded-xl border-border/50 ${
        isHovered ? 'shadow-xl scale-[1.01]' : 'shadow-sm'
      }`}
      onClick={() => navigate(`/minutes/${minute.id}`)}
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
                className="text-data px-1.5 py-0 h-4 rounded-full border no-default-hover-elevate no-default-active-elevate shrink-0"
                style={{
                  backgroundColor: 'hsl(var(--primary) / 0.08)',
                  color: 'hsl(var(--primary))',
                  borderColor: 'hsl(var(--primary) / 0.19)'
                }}
              >
                <CalendarIcon className="h-2 w-2 mr-0.5" />
                {format(new Date(minute.meetingDate), 'MMM d')}
              </Badge>
            </div>

            {/* Metadata line below title */}
            <div className="flex items-center gap-2 mt-0.5 text-data text-muted-foreground">
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
            <Pencil className="h-3 w-3 text-primary shrink-0" />
          )}
        </div>

        {/* Bottom row: Project Badge + Actions */}
        <div className="flex items-center justify-between">
          {/* Project badge */}
          {!contextProjectId && (
            <Badge 
              variant="outline" 
              className="text-data px-1.5 py-0 h-4 rounded-full bg-background border-border/50 no-default-hover-elevate no-default-active-elevate truncate max-w-[180px]"
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
