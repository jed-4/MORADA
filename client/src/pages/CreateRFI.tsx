import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  CalendarIcon,
  Users,
  Upload,
  Paperclip,
  X,
} from "lucide-react";
import { type Project, type Contact, type User } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { format } from "date-fns";

export default function CreateRFI() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [form, setForm] = useState({
    subject: "",
    question: "",
    projectId: "",
    priority: "normal",
    dueDate: null as Date | null,
    directedToType: "contact",
    directedToId: "",
    directedToName: "",
    directedToEmail: "",
    internalNotes: "",
    isExternal: false,
    externalNotes: "",
    followUpEnabled: false,
    followUpDaysBefore: 3,
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

  const createRfiMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      return await apiRequest("/api/rfis", "POST", {
        projectId: data.projectId,
        subject: data.subject,
        question: data.question,
        priority: data.priority,
        dueDate: data.dueDate?.toISOString(),
        directedToType: data.directedToType,
        directedToId: data.directedToId,
        directedToName: data.directedToName,
        directedToEmail: data.directedToEmail,
        internalNotes: data.internalNotes,
        isExternal: data.isExternal,
        externalNotes: data.externalNotes,
        followUpEnabled: data.followUpEnabled,
        followUpDaysBefore: data.followUpDaysBefore,
      });
    },
    onSuccess: (rfi) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfis"] });
      toast({ title: "RFI created", description: `Created "${rfi.rfiNumber}"` });
      setLocation(`/rfis/${rfi.id}`);
    },
    onError: (error: any) => {
      toast({ title: "Failed to create RFI", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!form.subject.trim()) {
      toast({ title: "Subject required", variant: "destructive" });
      return;
    }
    if (!form.projectId) {
      toast({ title: "Project required", variant: "destructive" });
      return;
    }
    if (!form.question.trim()) {
      toast({ title: "Question required", variant: "destructive" });
      return;
    }
    createRfiMutation.mutate(form);
  };

  const getDirectedToOptions = () => {
    if (form.directedToType === "contact") {
      return contacts.map(c => ({ id: c.id, name: c.name, email: c.email }));
    }
    if (form.directedToType === "user") {
      return users.map(u => ({ id: u.id, name: u.name || u.email, email: u.email }));
    }
    return [];
  };

  const handleDirectedToChange = (id: string) => {
    const options = getDirectedToOptions();
    const selected = options.find(o => o.id === id);
    setForm(prev => ({
      ...prev,
      directedToId: id,
      directedToName: selected?.name || "",
      directedToEmail: selected?.email || "",
    }));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-10 px-3 flex items-center justify-between border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation("/rfis")}
            className="h-6 w-6 rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-sm font-semibold">New Request for Information</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLocation("/rfis")}
            className="h-7 text-xs"
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={createRfiMutation.isPending}
            className="h-7 text-xs bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
            data-testid="button-create-rfi"
          >
            {createRfiMutation.isPending ? "Creating..." : "Create RFI"}
          </Button>
        </div>
      </div>

      {/* Content - Two Column Layout */}
      <div className="flex-1 overflow-hidden flex">
        {/* Main Content (Left) */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Subject & Project Row */}
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Subject *</Label>
                <Input
                  value={form.subject}
                  onChange={(e) => setForm(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="e.g., Clarification on foundation specifications"
                  className="h-8 text-sm"
                  data-testid="input-rfi-subject"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Project *</Label>
                <Select
                  value={form.projectId}
                  onValueChange={(v) => setForm(prev => ({ ...prev, projectId: v }))}
                >
                  <SelectTrigger className="h-8 text-sm" data-testid="select-rfi-project">
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
            </div>
          </Card>

          {/* Directed To & Dates Row */}
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Directed To Type */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Directed To (Type)</Label>
                <Select
                  value={form.directedToType}
                  onValueChange={(v) => setForm(prev => ({ ...prev, directedToType: v, directedToId: "", directedToName: "", directedToEmail: "" }))}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contact">Contact</SelectItem>
                    <SelectItem value="user">Team Member</SelectItem>
                    <SelectItem value="architect">Architect</SelectItem>
                    <SelectItem value="engineer">Engineer</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Directed To Person */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Directed To</Label>
                {form.directedToType === "contact" || form.directedToType === "user" ? (
                  <Select
                    value={form.directedToId}
                    onValueChange={handleDirectedToChange}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <Users className="w-4 h-4 mr-2 text-muted-foreground" />
                      <SelectValue placeholder="Select person..." />
                    </SelectTrigger>
                    <SelectContent>
                      {getDirectedToOptions().map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={form.directedToName}
                    onChange={(e) => setForm(prev => ({ ...prev, directedToName: e.target.value }))}
                    placeholder="Contact name"
                    className="h-8 text-sm"
                  />
                )}
              </div>

              {/* Due Date */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Response Due</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-8 justify-start text-sm font-normal">
                      <CalendarIcon className="w-4 h-4 mr-2 text-muted-foreground" />
                      {form.dueDate ? format(form.dueDate, "MMM d, yyyy") : "Set due date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.dueDate || undefined}
                      onSelect={(date) => setForm(prev => ({ ...prev, dueDate: date || null }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Email field for manual entry types */}
            {form.directedToType !== "contact" && form.directedToType !== "user" && (
              <div className="mt-4 space-y-2">
                <Label className="text-xs text-muted-foreground">Email Address</Label>
                <Input
                  value={form.directedToEmail}
                  onChange={(e) => setForm(prev => ({ ...prev, directedToEmail: e.target.value }))}
                  placeholder="email@example.com"
                  type="email"
                  className="h-8 text-sm"
                />
              </div>
            )}
          </Card>

          {/* Question / Request */}
          <Card className="p-4 space-y-2">
            <Label className="text-xs text-muted-foreground">Question / Request *</Label>
            <Textarea
              value={form.question}
              onChange={(e) => setForm(prev => ({ ...prev, question: e.target.value }))}
              placeholder="Describe the information you need in detail. Include relevant references to drawings, specifications, or other documents..."
              className="min-h-[180px] text-sm"
              data-testid="input-question"
            />
          </Card>

          {/* Attachments */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Attachments (0)</Label>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs"
                data-testid="button-add-attachment"
              >
                <Upload className="w-3 h-3 mr-1" />
                Upload
              </Button>
            </div>
            <div className="border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground text-sm">
              <Paperclip className="w-6 h-6 mx-auto mb-2 opacity-50" />
              <p>Drag files here or click Upload</p>
              <p className="text-xs mt-1">Plans, drawings, specifications</p>
            </div>
          </Card>
        </div>

        {/* Sidebar (Right) */}
        <div className="w-80 border-l overflow-auto p-4 space-y-4 bg-muted/10">
          {/* Priority */}
          <Card className="p-3 space-y-2">
            <Label className="text-xs font-medium">Priority</Label>
            <Select
              value={form.priority}
              onValueChange={(v) => setForm(prev => ({ ...prev, priority: v }))}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </Card>

          {/* External/Track Only Toggle */}
          <Card className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium">Track Only Mode</Label>
                <p className="text-[10px] text-muted-foreground">
                  Track RFI sent outside BuildPro
                </p>
              </div>
              <Switch
                checked={form.isExternal}
                onCheckedChange={(checked) => setForm(prev => ({ ...prev, isExternal: checked }))}
              />
            </div>
            {form.isExternal && (
              <Textarea
                value={form.externalNotes}
                onChange={(e) => setForm(prev => ({ ...prev, externalNotes: e.target.value }))}
                placeholder="Where was this RFI sent? (email, phone, etc.)"
                className="text-xs min-h-[60px]"
              />
            )}
          </Card>

          {/* Follow-up Reminders */}
          <Card className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium">Auto Follow-up</Label>
                <p className="text-[10px] text-muted-foreground">
                  Send reminder before due date
                </p>
              </div>
              <Switch
                checked={form.followUpEnabled}
                onCheckedChange={(checked) => setForm(prev => ({ ...prev, followUpEnabled: checked }))}
              />
            </div>
            {form.followUpEnabled && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Days before due date</Label>
                <Select
                  value={form.followUpDaysBefore.toString()}
                  onValueChange={(v) => setForm(prev => ({ ...prev, followUpDaysBefore: parseInt(v) }))}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 day before</SelectItem>
                    <SelectItem value="3">3 days before</SelectItem>
                    <SelectItem value="5">5 days before</SelectItem>
                    <SelectItem value="7">7 days before</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </Card>

          {/* Internal Notes */}
          <Card className="p-3 space-y-2">
            <Label className="text-xs font-medium">Internal Notes</Label>
            <p className="text-[10px] text-muted-foreground">
              Only visible to your team
            </p>
            <Textarea
              value={form.internalNotes}
              onChange={(e) => setForm(prev => ({ ...prev, internalNotes: e.target.value }))}
              placeholder="Notes for your team..."
              className="text-xs min-h-[100px]"
              data-testid="input-internal-notes"
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
