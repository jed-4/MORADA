import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type ScheduleTemplate, type Project } from "@shared/schema";
import Schedule from "@/pages/Schedule";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Settings, Upload } from "lucide-react";

/**
 * A schedule template, edited on the real project schedule page.
 *
 * The template owns an ordinary schedule (server/services/scheduleTemplates.ts),
 * so everything below the header — Gantt, List, Calendar, the item dialog,
 * dependencies, sub-items, the Edit / Save / Discard session — is the project
 * schedule's own code, in template mode. This page only adds what a template
 * has and a job doesn't: its name and category, and Apply to Project.
 */
export default function ScheduleTemplateDetail() {
  const { templateId } = useParams<{ templateId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "" });
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [applyStartDate, setApplyStartDate] = useState("");

  const { data: template, isLoading } = useQuery<ScheduleTemplate>({
    queryKey: ["/api/schedule-templates", templateId],
    enabled: !!templateId,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: showApplyDialog,
  });

  useEffect(() => {
    if (template) {
      setForm({ name: template.name, description: template.description || "", category: template.category || "" });
    }
  }, [template]);

  const updateMetaMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; category?: string }) =>
      apiRequest(`/api/schedule-templates/${templateId}`, "PATCH", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-templates", templateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-templates"] });
      setShowSettingsDialog(false);
      toast({ title: "Template updated", description: "Template settings have been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update template settings.", variant: "destructive" });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async ({ projectId, startDate }: { projectId: string; startDate?: string }) => {
      const res = await fetch(`/api/projects/${projectId}/schedule`, { credentials: "include" });
      let schedule = res.ok ? await res.json() : null;
      if (!schedule?.id) schedule = await apiRequest("/api/schedules", "POST", { projectId });
      return apiRequest(`/api/schedule-templates/${templateId}/apply`, "POST", { scheduleId: schedule.id, startDate });
    },
    onSuccess: (_, variables) => {
      setShowApplyDialog(false);
      toast({ title: "Template applied", description: "The template's items were added to the project schedule." });
      navigate(`/projects/${variables.projectId}/schedule`);
    },
    onError: (error: Error) => {
      toast({ title: "Couldn't apply the template", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Template not found</p>
        <Button variant="outline" onClick={() => navigate("/templates")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Templates
        </Button>
      </div>
    );
  }

  const header = (
    <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0 border-b border-border">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => navigate("/templates")}
          className="h-6 w-6 flex items-center justify-center rounded-md hover-elevate active-elevate-2"
          data-testid="button-back"
          aria-label="Back to templates"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="text-sm font-semibold truncate" data-testid="text-template-name">{template.name}</h2>
        {template.category && <Badge variant="outline" className="text-xs">{template.category}</Badge>}
        <Badge variant="secondary" className="text-xs">Template</Badge>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2"
          onClick={() => { setSelectedProjectId(""); setApplyStartDate(""); setShowApplyDialog(true); }}
          data-testid="button-apply-template"
        >
          <Upload className="w-3 h-3 inline mr-0.5" />
          Apply to Project
        </button>
        <button
          className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
          onClick={() => setShowSettingsDialog(true)}
          data-testid="button-template-settings"
          aria-label="Template settings"
        >
          <Settings className="w-3 h-3" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex-1 min-h-0">
        <Schedule templateId={template.id} templateHeader={header} />
      </div>

      <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <DialogContent data-testid="dialog-apply-template">
          <DialogHeader>
            <DialogTitle>Apply Template to Project</DialogTitle>
            <DialogDescription>
              The template's items are added after everything already on the project's schedule.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Project <span className="text-destructive">*</span></Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger data-testid="select-project">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.filter((p) => !p.isArchived).map((project) => (
                    <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Start Date (optional)</Label>
              <Input type="date" value={applyStartDate} onChange={(e) => setApplyStartDate(e.target.value)} data-testid="input-start-date" />
              <p className="text-xs text-muted-foreground">
                Day 1 of the template lands on this date. Leave blank to start the next working day after the
                schedule's last item, or on the project's start date if it has none.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApplyDialog(false)}>Cancel</Button>
            <Button
              onClick={() => applyMutation.mutate({ projectId: selectedProjectId, startDate: applyStartDate || undefined })}
              disabled={!selectedProjectId || applyMutation.isPending}
              data-testid="button-confirm-apply"
            >
              {applyMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Applying...</> : "Apply Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent data-testid="dialog-template-settings">
          <DialogHeader>
            <DialogTitle>Template Settings</DialogTitle>
            <DialogDescription>
              Name, description and category. The working week is under Schedule Settings in the ⋮ menu.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Template name"
                data-testid="input-template-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description..."
                rows={3}
                data-testid="textarea-template-description"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g., Residential, Commercial"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!form.name.trim()) {
                  toast({ title: "Validation error", description: "Template name is required.", variant: "destructive" });
                  return;
                }
                updateMetaMutation.mutate({
                  name: form.name.trim(),
                  description: form.description.trim() || undefined,
                  category: form.category || undefined,
                });
              }}
              disabled={updateMetaMutation.isPending}
              data-testid="button-save-template-settings"
            >
              {updateMetaMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save Settings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
