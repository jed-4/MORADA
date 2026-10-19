import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { RichTextEditor } from "@/components/RichTextEditor";
import { DetailPageHeader } from "@/components/detail/DetailPageHeader";
import { DetailLayout } from "@/components/detail/DetailLayout";
import { DocumentSection } from "@/components/detail/DocumentSection";
import { HybridAttendeeSelector, type Attendee } from "@/components/HybridAttendeeSelector";
import type { Minute } from "@shared/schema";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  Save,
  Sparkles,
  Loader2,
  ChevronRight,
  Check,
  Link as LinkIcon,
} from "lucide-react";
import { format } from "date-fns";


/** Compare notes by their TEXT, not their HTML. The editor normalises markup it
 *  is given (`<li>x</li>` becomes `<li><p>x</p></li>`), so an HTML comparison
 *  reports a change the moment the page loads — which is how Save came to be lit
 *  permanently, telling the user nothing. The words are what changed or did not. */
function normaliseText(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

/** A Date as <input type="datetime-local"> wants it, in LOCAL time. Using
 *  toISOString() here showed an Australian meeting 11 hours out, and saving
 *  that value moved the meeting. */
function toLocalDateTimeInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


/** One action item. Completing it here is the same write the To-Dos list makes,
 *  because it is the same task — there is no second copy to keep in step. */
function ActionRow({ task, onToggle, carried }: { task: any; onToggle: () => void; carried?: boolean }) {
  const done = task.status === "done" || !!task.completedAt;
  const names: string[] = Array.isArray(task.assigneeNames) ? task.assigneeNames : [];
  return (
    <div className="flex items-start gap-2 group" data-testid={`action-item-${task.id}`}>
      <button
        onClick={onToggle}
        className="mt-0.5 h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 hover-elevate"
        aria-label={done ? "Mark as not done" : "Mark as done"}
        data-testid={`toggle-action-${task.id}`}
      >
        {done && <Check className="h-3 w-3" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-5 ${done ? "line-through text-muted-foreground" : ""}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {names.length > 0 && <span className="truncate">{names.join(", ")}</span>}
          {task.dueDate && <span>due {format(new Date(task.dueDate), "d MMM")}</span>}
          {carried && <span className="italic">from an earlier meeting</span>}
        </div>
      </div>
    </div>
  );
}

export default function MinuteDetail() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [contentHtml, setContentHtml] = useState("");
  const [contentText, setContentText] = useState("");
  const [editedTitle, setEditedTitle] = useState("");
  const [editedDate, setEditedDate] = useState("");
  const [editedLocation, setEditedLocation] = useState("");
  const [editedRecordingUrl, setEditedRecordingUrl] = useState("");
  const [editedAttendees, setEditedAttendees] = useState<Attendee[]>([]);
  // RichTextEditor captures its content ONCE, at mount (initialContentRef), and
  // this page fills its state from a useEffect that runs after that first
  // render — so a minute that already had notes showed an empty editor and the
  // notes looked lost. Flipping this remounts the editor once, with the content
  // present. Local to this page: the editor is shared, and changing when it
  // adopts a new `content` would reach every screen that uses it.
  const [hydrated, setHydrated] = useState(false);

  // Fetch minute
  const { data: minute, isLoading } = useQuery<Minute>({
    queryKey: ["/api/minutes", id],
    queryFn: async () => {
      const response = await fetch(`/api/minutes/${id}`);
      if (!response.ok) throw new Error("Failed to fetch minute");
      return response.json();
    },
    enabled: !!id,
  });

  // Initialize content when minute is loaded
  useEffect(() => {
    if (minute) {
      setContentHtml(minute.contentHtml || "");
      setContentText(minute.contentText || "");
      setEditedTitle(minute.title);
      setEditedDate(toLocalDateTimeInput(minute.meetingDate));
      setEditedLocation(minute.location || "");
      setEditedRecordingUrl(minute.recordingUrl || "");
      setEditedAttendees((minute.attendees as Attendee[]) || []);
      setHydrated(true);
    }
  }, [minute]);

  // The project's name for the breadcrumb, so a project-scoped minute reads the
  // same as every other page in that project rather than always "All Projects".
  const { data: projects = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/projects"],
  });
  const projectName = minute?.projectId
    ? (projects.find(p => p.id === minute.projectId)?.name ?? null)
    : null;

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Minute>) => {
      return await apiRequest(`/api/minutes/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/minutes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/minutes", id] });
      toast({ title: "Minutes saved" });
    },
    onError: () => {
      toast({ title: "Failed to update meeting minutes", variant: "destructive" });
    },
  });

  // Action items are tasks (notes with type "task") linked back to this minute,
  // so they appear in To-Dos and are completed from either place — see
  // shared/minuteActionItems.ts.
  const { data: actions = { items: [], carriedForward: [] } } = useQuery<{ items: any[]; carriedForward: any[] }>({
    queryKey: ["/api/minutes", id, "action-items"],
    queryFn: async () => {
      const r = await fetch(`/api/minutes/${id}/action-items`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch action items");
      return r.json();
    },
    enabled: !!id,
  });

  const [newAction, setNewAction] = useState("");
  const addActionMutation = useMutation({
    mutationFn: async (title: string) => apiRequest(`/api/minutes/${id}/action-items`, "POST", { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/minutes", id, "action-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      setNewAction("");
    },
    onError: () => toast({ title: "Could not add the action item", variant: "destructive" }),
  });

  const toggleActionMutation = useMutation({
    mutationFn: async (task: any) =>
      apiRequest(`/api/notes/${task.id}`, "PATCH", {
        status: task.status === "done" ? "todo" : "done",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/minutes", id, "action-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
    },
    onError: () => toast({ title: "Could not update the action item", variant: "destructive" }),
  });

  // Generate AI summary mutation
  const generateSummaryMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/minutes/${id}/summarize`, "POST", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/minutes", id] });
      toast({ title: "AI summary generated successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to generate summary", 
        description: error.message || "An error occurred",
        variant: "destructive" 
      });
    },
  });

  const handleContentChange = (html: string, text: string) => {
    setContentHtml(html);
    setContentText(text);
  };

  // Everything the page can change, saved by the one Save button. There used to
  // be two: "Save Content" for the notes and a separate Edit Details mode for
  // the rest, so a user who changed the location and the notes had to find both.
  const handleSave = () => {
    if (!minute) return;
    updateMutation.mutate({
      title: editedTitle,
      meetingDate: new Date(editedDate),
      location: editedLocation,
      recordingUrl: editedRecordingUrl,
      attendees: editedAttendees as any,
      contentHtml,
      contentText,
    } as any);
  };

  // Drives whether Save is shown at all. The old button was lit from the moment
  // the page loaded, so it never told you anything.
  const isDirty = !!minute && (
    editedTitle !== minute.title ||
    editedDate !== toLocalDateTimeInput(minute.meetingDate) ||
    editedLocation !== (minute.location || "") ||
    editedRecordingUrl !== (minute.recordingUrl || "") ||
    normaliseText(contentText) !== normaliseText(minute.contentText) ||
    JSON.stringify(editedAttendees) !== JSON.stringify((minute.attendees as Attendee[]) || [])
  );

  const handleGenerateSummary = () => {
    if (!contentText.trim()) {
      toast({
        title: "No content to summarize",
        description: "Please add meeting notes before generating a summary",
        variant: "destructive",
      });
      return;
    }
    generateSummaryMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!minute) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-muted-foreground">These meeting minutes could not be found.</p>
        <Button size="sm" variant="outline" onClick={() => navigate("/minutes")} data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Minutes
        </Button>
      </div>
    );
  }

  const meetingDate = new Date(minute.meetingDate);

  return (
    <div className="flex flex-col h-full">
      {/* The same breadcrumb row every other page has. */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
        <span className="text-xs text-muted-foreground">
          {projectName ?? "All Projects"}
        </span>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <button
          onClick={() => navigate(minute.projectId ? `/projects/${minute.projectId}/minutes` : "/minutes")}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Minutes
        </button>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <span className="text-xs font-medium text-foreground truncate" data-testid="text-page-title">
          {minute.title}
        </span>
      </div>

      {/* The shared detail header. Replaces three floating buttons, a separate
          "Edit Details" mode and a Save that was lit whether or not anything
          had changed. Everything is editable in place; Save appears when it
          has something to do, the way Variations and RFQs already work. */}
      <DetailPageHeader
        backTo="/minutes"
        projectId={minute.projectId}
        title={editedTitle}
        onTitleChange={setEditedTitle}
        titlePlaceholder="Meeting title"
        titleClassName="w-[320px]"
        badges={
          <Badge variant="outline" className="text-xs flex-shrink-0">
            {format(meetingDate, "d MMM yyyy")}
          </Badge>
        }
        dirty={isDirty}
        saving={updateMutation.isPending}
        onSave={handleSave}
      />

      <DetailLayout
        sidebar={
          <>
            {/* The meeting's facts. These used to be one cramped line of icons
                under the title, with nowhere for attendees to grow. */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Date and time</label>
              <Input
                type="datetime-local"
                className="h-8 text-sm"
                value={editedDate}
                onChange={(e) => setEditedDate(e.target.value)}
                data-testid="input-edit-date"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Location</label>
              <Input
                className="h-8 text-sm"
                placeholder="Site office, Zoom…"
                value={editedLocation}
                onChange={(e) => setEditedLocation(e.target.value)}
                data-testid="input-edit-location"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Attendees</label>
              <HybridAttendeeSelector
                value={editedAttendees}
                onChange={setEditedAttendees}
                projectId={minute.projectId ?? undefined}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Recording link</label>
              <Input
                className="h-8 text-sm"
                placeholder="https://…"
                value={editedRecordingUrl}
                onChange={(e) => setEditedRecordingUrl(e.target.value)}
                data-testid="input-edit-recording-url"
              />
              {minute.recordingUrl && (
                <a
                  href={minute.recordingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  data-testid="link-recording"
                >
                  <LinkIcon className="h-3 w-3" />
                  Open recording
                </a>
              )}
            </div>

            <div className="pt-1 border-t space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Users className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">Taken by {minute.ownerName || "—"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3 flex-shrink-0" />
                <span>{format(meetingDate, "EEEE d MMMM yyyy, h:mm a")}</span>
              </div>
            </div>
          </>
        }
      >
        <DocumentSection
          title="Notes"
          role="manual"
          collapsible={false}
          divider={false}
          data-testid="section-notes"
        >
          <div className="px-3.5 py-3">
            <RichTextEditor
              key={`${minute.id}:${hydrated ? "ready" : "loading"}`}
              content={contentHtml}
              onChange={handleContentChange}
              placeholder="Discussion, decisions, who is doing what…"
              data-testid="editor-content"
            />
          </div>
        </DocumentSection>

        <DocumentSection
          title="Action items"
          role="manual"
          count={actions.items.length}
          divider={false}
          isEmpty={actions.items.length === 0 && actions.carriedForward.length === 0}
          data-testid="section-action-items"
        >
          <div className="px-3.5 py-3 space-y-3">
            <div className="space-y-1">
              {actions.items.map((t: any) => (
                <ActionRow key={t.id} task={t} onToggle={() => toggleActionMutation.mutate(t)} />
              ))}
              {actions.items.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nothing assigned yet. Anything added here becomes a task, so it shows up in the
                  assignee's To&nbsp;Dos.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Input
                className="h-8 text-sm"
                placeholder="Who is doing what…"
                value={newAction}
                onChange={(e) => setNewAction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newAction.trim()) {
                    e.preventDefault();
                    addActionMutation.mutate(newAction.trim());
                  }
                }}
                data-testid="input-new-action-item"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs flex-shrink-0"
                disabled={!newAction.trim() || addActionMutation.isPending}
                onClick={() => addActionMutation.mutate(newAction.trim())}
                data-testid="button-add-action-item"
              >
                Add
              </Button>
            </div>

            {/* What the last meetings agreed and nobody has finished. A meeting
                that never revisits its own actions is how they stop meaning
                anything. */}
            {actions.carriedForward.length > 0 && (
              <div className="pt-2 border-t space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Still open from earlier meetings
                </p>
                {actions.carriedForward.map((t: any) => (
                  <ActionRow key={t.id} task={t} onToggle={() => toggleActionMutation.mutate(t)} carried />
                ))}
              </div>
            )}
          </div>
        </DocumentSection>

        <DocumentSection
          title="AI summary"
          role="meta"
          divider={false}
          isEmpty={!minute.aiSummary}
          actions={
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={handleGenerateSummary}
              disabled={generateSummaryMutation.isPending || !contentText.trim()}
              data-testid="button-generate-summary"
            >
              {generateSummaryMutation.isPending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              {minute.aiSummary ? "Regenerate" : "Generate"}
            </Button>
          }
          data-testid="section-ai-summary"
        >
          <div className="px-3.5 py-3">
            {minute.aiSummary ? (
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{minute.aiSummary}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Write the notes, then generate a summary of the decisions and actions.
              </p>
            )}
          </div>
        </DocumentSection>
      </DetailLayout>
    </div>
  );
}
