import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProject } from "@/contexts/ProjectContext";
import { useParams } from "wouter";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ClipboardList,
  Plus,
  Search,
  MoreVertical,
  Edit3,
  Trash2,
  Calendar,
  MapPin,
  Users,
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

  // Fetch minutes
  const { data: minutes = [], isLoading } = useQuery<Minute[]>({
    queryKey: ["/api/minutes", contextProjectId || "business"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (contextProjectId) {
        params.append("projectId", contextProjectId);
      }
      const response = await fetch(`/api/minutes?${params}`);
      if (!response.ok) throw new Error("Failed to fetch minutes");
      return response.json();
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: InsertMinute) => {
      return await apiRequest("/api/minutes", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/minutes"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/minutes"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/minutes"] });
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
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Meeting Minutes</h1>
          <p className="text-muted-foreground mt-2">
            Record and track meeting minutes with AI-powered summaries
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingMinute(null); form.reset(); }} data-testid="button-create-minute">
              <Plus className="h-4 w-4 mr-2" />
              New Meeting Minutes
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

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search minutes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : filteredMinutes.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No meeting minutes found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? "Try adjusting your search" : "Get started by creating your first meeting minutes"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Meeting Title</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Attendees</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMinutes.map((minute) => (
                  <TableRow key={minute.id} className="cursor-pointer hover-elevate" onClick={() => window.location.href = `/minutes/${minute.id}`}>
                    <TableCell className="font-medium" data-testid={`minute-title-${minute.id}`}>{minute.title}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(minute.meetingDate), "PPp")}
                      </div>
                    </TableCell>
                    <TableCell>
                      {minute.location && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          {minute.location}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {((minute.attendees as string[]) || []).length > 0 && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Users className="h-4 w-4" />
                          {((minute.attendees as string[]) || []).slice(0, 2).join(", ")}
                          {((minute.attendees as string[]) || []).length > 2 && ` +${((minute.attendees as string[]) || []).length - 2}`}
                        </div>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-actions-${minute.id}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
