import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { RichTextEditor } from "@/components/RichTextEditor";
import type { Minute } from "@shared/schema";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  Save,
  Sparkles,
  Loader2,
  Edit3,
  Check,
  X,
} from "lucide-react";
import { format } from "date-fns";

export default function MinuteDetail() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [contentHtml, setContentHtml] = useState("");
  const [contentText, setContentText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedDate, setEditedDate] = useState("");
  const [editedLocation, setEditedLocation] = useState("");
  const [editedAttendees, setEditedAttendees] = useState<string[]>([]);

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
      setEditedDate(new Date(minute.meetingDate).toISOString().slice(0, 16));
      setEditedLocation(minute.location || "");
      setEditedAttendees((minute.attendees as string[]) || []);
    }
  }, [minute]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Minute>) => {
      const response = await apiRequest(`/api/minutes/${id}`, "PATCH", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/minutes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/minutes", id] });
      toast({ title: "Meeting minutes updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update meeting minutes", variant: "destructive" });
    },
  });

  // Generate AI summary mutation
  const generateSummaryMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/minutes/${id}/summary`, "POST", {});
      return response.json();
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

  const handleSave = () => {
    if (!minute) return;
    
    updateMutation.mutate({
      contentHtml,
      contentText,
    });
  };

  const handleSaveMetadata = () => {
    if (!minute) return;

    updateMutation.mutate({
      title: editedTitle,
      meetingDate: new Date(editedDate),
      location: editedLocation,
      attendees: editedAttendees,
    });
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    if (minute) {
      setEditedTitle(minute.title);
      setEditedDate(new Date(minute.meetingDate).toISOString().slice(0, 16));
      setEditedLocation(minute.location || "");
      setEditedAttendees((minute.attendees as string[]) || []);
    }
    setIsEditing(false);
  };

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
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!minute) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <h2 className="text-2xl font-bold">Meeting minutes not found</h2>
        <Button onClick={() => navigate("/minutes")} data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Minutes
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/minutes")} data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Minutes
        </Button>
        <div className="flex gap-2">
          {!isEditing && (
            <Button variant="outline" onClick={() => setIsEditing(true)} data-testid="button-edit-metadata">
              <Edit3 className="h-4 w-4 mr-2" />
              Edit Details
            </Button>
          )}
          <Button 
            onClick={handleSave} 
            disabled={updateMutation.isPending}
            data-testid="button-save"
          >
            <Save className="h-4 w-4 mr-2" />
            Save Content
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Meeting Title</label>
                <Input 
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  data-testid="input-edit-title"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Meeting Date</label>
                  <Input 
                    type="datetime-local"
                    value={editedDate}
                    onChange={(e) => setEditedDate(e.target.value)}
                    data-testid="input-edit-date"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Location</label>
                  <Input 
                    value={editedLocation}
                    onChange={(e) => setEditedLocation(e.target.value)}
                    data-testid="input-edit-location"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Attendees (comma-separated)</label>
                <Input 
                  value={editedAttendees.join(", ")}
                  onChange={(e) => setEditedAttendees(e.target.value.split(",").map(s => s.trim()).filter(s => s))}
                  data-testid="input-edit-attendees"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveMetadata} size="sm" data-testid="button-save-metadata">
                  <Check className="h-4 w-4 mr-2" />
                  Save
                </Button>
                <Button onClick={handleCancelEdit} variant="outline" size="sm" data-testid="button-cancel-edit">
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <CardTitle className="text-3xl" data-testid="text-title">{minute.title}</CardTitle>
              <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span data-testid="text-date">{format(new Date(minute.meetingDate), "PPpp")}</span>
                </div>
                {minute.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span data-testid="text-location">{minute.location}</span>
                  </div>
                )}
                {((minute.attendees as string[]) || []).length > 0 && (
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span data-testid="text-attendees">{((minute.attendees as string[]) || []).join(", ")}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Meeting Notes</h3>
            </div>
            <RichTextEditor
              content={contentHtml}
              onChange={handleContentChange}
              placeholder="Enter meeting notes, discussion points, action items..."
              data-testid="editor-content"
            />
          </div>

          <Separator />

          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">AI Summary</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateSummary}
                disabled={generateSummaryMutation.isPending || !contentText.trim()}
                data-testid="button-generate-summary"
              >
                {generateSummaryMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate AI Summary
                  </>
                )}
              </Button>
            </div>
            {minute.aiSummary ? (
              <Card className="bg-muted/50">
                <CardContent className="pt-6">
                  <p className="whitespace-pre-wrap text-sm" data-testid="text-ai-summary">
                    {minute.aiSummary}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-muted/50">
                <CardContent className="pt-6 text-center">
                  <p className="text-muted-foreground text-sm">
                    No AI summary generated yet. Click the button above to generate one.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
