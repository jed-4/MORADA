import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  HelpCircle,
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  Send,
  ArrowLeft,
  AlertCircle,
  MessageSquare,
  FileText,
  Edit2,
} from "lucide-react";
import type { Rfi, Project } from "@shared/schema";
import { format, isPast } from "date-fns";
import { useRfiStatusOptions } from "@/hooks/useRfiStatusOptions";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function RFIDetail() {
  const { id, projectId } = useParams<{ id: string; projectId?: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { statusOptions, getStatusInfo } = useRfiStatusOptions();

  const [responseText, setResponseText] = useState("");
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);

  const { data: rfi, isLoading: rfiLoading } = useQuery<Rfi>({
    queryKey: ["/api/rfis", id],
    enabled: !!id,
  });

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", rfi?.projectId],
    enabled: !!rfi?.projectId,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      return apiRequest(`/api/rfis/${id}`, "PATCH", { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfis", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfis"] });
      toast({
        title: "Status Updated",
        description: "RFI status has been updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    },
  });

  const handleSubmitResponse = async () => {
    if (!responseText.trim()) {
      toast({
        title: "Error",
        description: "Please enter a response",
        variant: "destructive",
      });
      return;
    }

    setIsSubmittingResponse(true);
    try {
      await apiRequest(`/api/rfis/${id}`, "PATCH", {
        response: responseText,
        respondedAt: new Date().toISOString(),
        status: "answered",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/rfis", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfis"] });

      toast({
        title: "Response Submitted",
        description: "Your response has been recorded",
      });

      setResponseText("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit response",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingResponse(false);
    }
  };

  const handleGoBack = () => {
    if (projectId) {
      navigate(`/projects/${projectId}/rfis`);
    } else {
      navigate("/rfis");
    }
  };

  if (rfiLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading RFI...</div>
      </div>
    );
  }

  if (!rfi) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">RFI not found</div>
      </div>
    );
  }

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "N/A";
    const d = typeof date === "string" ? new Date(date) : date;
    return format(d, "MMM d, yyyy 'at' h:mm a");
  };

  const statusInfo = getStatusInfo(rfi.status);
  const isOverdue = rfi.dueDate && isPast(new Date(rfi.dueDate)) && rfi.status !== "closed" && rfi.status !== "answered";

  const getPriorityBadge = (priority: string) => {
    const config: Record<string, { color: string; label: string }> = {
      low: { color: "bg-gray-100 text-gray-800", label: "Low" },
      normal: { color: "bg-blue-100 text-blue-800", label: "Normal" },
      high: { color: "bg-orange-100 text-orange-800", label: "High" },
      urgent: { color: "bg-red-100 text-red-800", label: "Urgent" },
    };
    const { color, label } = config[priority || "normal"] || config.normal;
    return <Badge className={color}>{label}</Badge>;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGoBack}
              className="gap-2"
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-semibold">{rfi.subject}</h1>
                <Badge style={{ backgroundColor: statusInfo.color, color: "#fff" }}>
                  {statusInfo.name}
                </Badge>
                {getPriorityBadge(rfi.priority || "normal")}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <HelpCircle className="h-4 w-4" />
                  RFI #{rfi.rfiNumber}
                </span>
                {rfi.dueDate && (
                  <span className={`flex items-center gap-1 ${isOverdue ? "text-destructive" : ""}`}>
                    {isOverdue && <AlertCircle className="h-4 w-4" />}
                    <Calendar className="h-4 w-4" />
                    Due {format(new Date(rfi.dueDate), "MMM d, yyyy")}
                  </span>
                )}
                {rfi.directedToName && (
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    Directed to: {rfi.directedToName}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={rfi.status}
              onValueChange={(value) => updateStatusMutation.mutate(value)}
            >
              <SelectTrigger className="w-[160px]" data-testid="select-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((status) => (
                  <SelectItem key={status.key} value={status.key}>
                    {status.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {rfi.status === "draft" && (
              <Button
                onClick={() => updateStatusMutation.mutate("sent")}
                data-testid="button-send-rfi"
              >
                <Send className="h-4 w-4 mr-2" />
                Send RFI
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6">
        <Tabs defaultValue="details" className="h-full flex flex-col">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="response">Response</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="flex-1 overflow-auto space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Question / Request</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 rounded-lg bg-muted/30 border">
                  <p className="text-sm whitespace-pre-wrap">{rfi.question}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>RFI Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">Created By</div>
                    <div className="text-sm">{rfi.createdByName || "Unknown"}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">Created At</div>
                    <div className="text-sm">{formatDate(rfi.createdAt)}</div>
                  </div>
                  {project && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">Project</div>
                      <div className="text-sm">{project.name}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">Priority</div>
                    <div>{getPriorityBadge(rfi.priority || "normal")}</div>
                  </div>
                  {rfi.sentAt && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">Sent At</div>
                      <div className="text-sm">{formatDate(rfi.sentAt)}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">Due Date</div>
                    <div className={`text-sm ${isOverdue ? "text-destructive font-medium" : ""}`}>
                      {rfi.dueDate ? format(new Date(rfi.dueDate), "MMM d, yyyy") : "N/A"}
                      {isOverdue && " (Overdue)"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Directed To</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium">{rfi.directedToName || "Not specified"}</div>
                    <div className="text-sm text-muted-foreground capitalize">
                      {rfi.directedToType || "Contact"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {rfi.attachmentUrls && rfi.attachmentUrls.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Attachments</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {rfi.attachmentUrls.map((url, index) => (
                      <a
                        key={index}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 transition-colors"
                      >
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-primary underline">Attachment {index + 1}</span>
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="response" className="flex-1 overflow-auto space-y-6">
            {rfi.response ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Response</CardTitle>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Responded {rfi.respondedAt && formatDate(rfi.respondedAt)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
                    <p className="text-sm whitespace-pre-wrap">{rfi.response}</p>
                  </div>
                  {rfi.respondedByName && (
                    <div className="mt-4 text-sm text-muted-foreground">
                      Responded by: {rfi.respondedByName}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Submit Response</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="response">Your Response</Label>
                    <Textarea
                      id="response"
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      placeholder="Enter your response to this RFI..."
                      className="min-h-[150px]"
                      data-testid="textarea-response"
                    />
                  </div>
                  <Button
                    onClick={handleSubmitResponse}
                    disabled={isSubmittingResponse || !responseText.trim()}
                    data-testid="button-submit-response"
                  >
                    {isSubmittingResponse ? "Submitting..." : "Submit Response"}
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="activity" className="flex-1 overflow-auto">
            <Card>
              <CardHeader>
                <CardTitle>Activity Log</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">RFI Created</div>
                      <div className="text-xs text-muted-foreground">
                        {rfi.createdByName || "Unknown"} • {formatDate(rfi.createdAt)}
                      </div>
                    </div>
                  </div>
                  
                  {rfi.sentAt && (
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        <Send className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">RFI Sent</div>
                        <div className="text-xs text-muted-foreground">
                          Sent to {rfi.directedToName} • {formatDate(rfi.sentAt)}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {rfi.respondedAt && (
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        <MessageSquare className="h-5 w-5 text-green-500" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">Response Received</div>
                        <div className="text-xs text-muted-foreground">
                          {rfi.respondedByName || "Unknown"} • {formatDate(rfi.respondedAt)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
