import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  HelpCircle,
  Download,
  Send,
  Calendar as CalendarIcon,
  Users,
  Save,
  Loader2,
  Paperclip,
  Upload,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Building2,
} from "lucide-react";
import type { Rfi, Project, Contact } from "@shared/schema";
import { format, isPast } from "date-fns";
import { useRfiStatusOptions } from "@/hooks/useRfiStatusOptions";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export default function RFIDetail() {
  const { id, projectId } = useParams<{ id: string; projectId?: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { statusOptions, getStatusInfo } = useRfiStatusOptions();
  
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);

  const [formData, setFormData] = useState({
    subject: "",
    question: "",
    dueDate: null as Date | null,
    priority: "normal",
    directedToType: "other",
    directedToName: "",
    directedToEmail: "",
    internalNotes: "",
  });

  const { data: rfi, isLoading: rfiLoading } = useQuery<Rfi>({
    queryKey: ["/api/rfis", id],
    enabled: !!id,
  });

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", rfi?.projectId],
    enabled: !!rfi?.projectId,
  });

  useEffect(() => {
    if (rfi) {
      setFormData({
        subject: rfi.subject || "",
        question: rfi.question || "",
        dueDate: rfi.dueDate ? new Date(rfi.dueDate) : null,
        priority: rfi.priority || "normal",
        directedToType: rfi.directedToType || "other",
        directedToName: rfi.directedToName || "",
        directedToEmail: rfi.directedToEmail || "",
        internalNotes: rfi.internalNotes || "",
      });
    }
  }, [rfi]);

  const updateRfiMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const payload = { ...data };
      if (data.dueDate) {
        payload.dueDate = data.dueDate instanceof Date ? data.dueDate.toISOString() : data.dueDate;
      }
      return await apiRequest(`/api/rfis/${id}`, "PATCH", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfis", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfis"] });
      setHasChanges(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      return apiRequest(`/api/rfis/${id}`, "PATCH", { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfis", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfis"] });
      toast({ title: "Status updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update status", variant: "destructive" });
    },
  });

  const handleFieldChange = useCallback(<K extends keyof typeof formData>(field: K, value: typeof formData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      updateRfiMutation.mutate({ [field]: value });
    }, 1000);
  }, [updateRfiMutation]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleSave = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    updateRfiMutation.mutate(formData);
    toast({ title: "RFI saved" });
  };

  const handleSubmitResponse = async () => {
    if (!responseText.trim()) {
      toast({ title: "Error", description: "Please enter a response", variant: "destructive" });
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
      toast({ title: "Response submitted" });
      setResponseText("");
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to submit response", variant: "destructive" });
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

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "Not set";
    const d = typeof date === "string" ? new Date(date) : date;
    return format(d, "MMM d, yyyy");
  };

  if (rfiLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
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

  const statusInfo = getStatusInfo(rfi.status);
  const isOverdue = rfi.dueDate && isPast(new Date(rfi.dueDate)) && rfi.status !== "closed" && rfi.status !== "answered";

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      low: "bg-gray-100 text-gray-800",
      normal: "bg-blue-100 text-blue-800",
      high: "bg-orange-100 text-orange-800",
      urgent: "bg-red-100 text-red-800",
    };
    return colors[priority] || colors.normal;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b bg-background px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleGoBack} className="gap-2" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">RFI #{rfi.rfiNumber}</span>
            </div>
            <Badge style={{ backgroundColor: statusInfo.color, color: "#fff" }}>
              {statusInfo.name}
            </Badge>
            <Badge className={getPriorityColor(rfi.priority || "normal")}>
              {(rfi.priority || "normal").charAt(0).toUpperCase() + (rfi.priority || "normal").slice(1)}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Button size="sm" onClick={handleSave} disabled={updateRfiMutation.isPending} className="h-7 text-xs">
                <Save className="w-3 h-3 mr-1" />
                {updateRfiMutation.isPending ? "Saving..." : "Save"}
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="button-download-pdf">
              <Download className="w-3 h-3 mr-1" />
              PDF
            </Button>
            {rfi.status === "draft" && (
              <Button size="sm" onClick={() => updateStatusMutation.mutate("sent")} data-testid="button-send-rfi" className="h-7 text-xs">
                <Send className="w-3 h-3 mr-1" />
                Send RFI
              </Button>
            )}
            <Select value={rfi.status} onValueChange={(value) => updateStatusMutation.mutate(value)}>
              <SelectTrigger className="w-[140px] h-7 text-xs" data-testid="select-status">
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
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Column - Main Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Subject */}
          <Card className="p-4 space-y-2">
            <Label className="text-xs text-muted-foreground">Subject</Label>
            <Input
              value={formData.subject}
              onChange={(e) => handleFieldChange("subject", e.target.value)}
              placeholder="RFI subject line..."
              className="text-lg font-medium"
              data-testid="input-subject"
            />
          </Card>

          {/* Directed To */}
          <Card className="p-4 space-y-3">
            <Label className="text-xs text-muted-foreground">Directed To</Label>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Type</Label>
                <Select value={formData.directedToType} onValueChange={(v) => handleFieldChange("directedToType", v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Client</SelectItem>
                    <SelectItem value="architect">Architect</SelectItem>
                    <SelectItem value="engineer">Engineer</SelectItem>
                    <SelectItem value="consultant">Consultant</SelectItem>
                    <SelectItem value="subcontractor">Subcontractor</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Name</Label>
                <Input
                  value={formData.directedToName}
                  onChange={(e) => handleFieldChange("directedToName", e.target.value)}
                  placeholder="Contact name"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Email</Label>
                <Input
                  value={formData.directedToEmail}
                  onChange={(e) => handleFieldChange("directedToEmail", e.target.value)}
                  placeholder="email@example.com"
                  className="h-8 text-xs"
                  type="email"
                />
              </div>
            </div>
          </Card>

          {/* Question */}
          <Card className="p-4 space-y-2">
            <Label className="text-xs text-muted-foreground">Question / Request</Label>
            <Textarea
              value={formData.question}
              onChange={(e) => handleFieldChange("question", e.target.value)}
              placeholder="Describe your question or request for information in detail..."
              className="min-h-[150px] text-sm"
              data-testid="input-question"
            />
          </Card>

          {/* Attachments */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Attachments ({rfi.attachmentUrls?.length || 0})
              </Label>
              <Button size="sm" variant="outline" className="h-6 text-xs" data-testid="button-add-attachment">
                <Upload className="w-3 h-3 mr-1" />
                Upload
              </Button>
            </div>
            {(!rfi.attachmentUrls || rfi.attachmentUrls.length === 0) ? (
              <div className="border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground text-sm">
                <Paperclip className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p>Drag files here or click Upload</p>
                <p className="text-xs mt-1">Plans, drawings, specs</p>
              </div>
            ) : (
              <div className="space-y-2">
                {rfi.attachmentFileNames?.map((name, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded bg-muted/30">
                    <Paperclip className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm flex-1">{name}</span>
                    <a href={rfi.attachmentUrls?.[i]} target="_blank" rel="noopener noreferrer">
                      <Button size="icon" variant="ghost" className="h-6 w-6">
                        <Download className="w-3 h-3" />
                      </Button>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Response Section */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Response</Label>
              {rfi.response && (
                <div className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle2 className="w-3 h-3" />
                  Answered {rfi.respondedAt && format(new Date(rfi.respondedAt), "MMM d, yyyy")}
                </div>
              )}
            </div>
            {rfi.response ? (
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
                <p className="text-sm whitespace-pre-wrap">{rfi.response}</p>
                {rfi.respondedByName && (
                  <p className="text-xs text-muted-foreground mt-2">— {rfi.respondedByName}</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <Textarea
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="Enter the response to this RFI..."
                  className="min-h-[120px] text-sm"
                  data-testid="textarea-response"
                />
                <Button
                  size="sm"
                  onClick={handleSubmitResponse}
                  disabled={!responseText.trim() || isSubmittingResponse}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  data-testid="button-submit-response"
                >
                  {isSubmittingResponse ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Submit Response
                    </>
                  )}
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column - Sidebar */}
        <div className="w-[320px] border-l overflow-y-auto p-4 space-y-4 bg-muted/20 flex-shrink-0">
          {/* Project Info */}
          {project && (
            <Card className="p-3 space-y-2">
              <Label className="text-xs text-muted-foreground">Project</Label>
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{project.name}</span>
              </div>
            </Card>
          )}

          {/* Dates */}
          <Card className="p-3 space-y-3">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-8 text-xs",
                      !formData.dueDate && "text-muted-foreground",
                      isOverdue && "border-destructive text-destructive"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3 w-3" />
                    {formData.dueDate ? format(formData.dueDate, "MMM d, yyyy") : "Set due date"}
                    {isOverdue && <AlertCircle className="ml-auto h-3 w-3" />}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.dueDate || undefined}
                    onSelect={(date) => handleFieldChange("dueDate", date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Priority</Label>
              <Select value={formData.priority} onValueChange={(v) => handleFieldChange("priority", v)}>
                <SelectTrigger className="h-8 text-xs">
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
          </Card>

          {/* Internal Notes */}
          <Card className="p-3 space-y-2">
            <Label className="text-xs text-muted-foreground">Internal Notes</Label>
            <Textarea
              value={formData.internalNotes}
              onChange={(e) => handleFieldChange("internalNotes", e.target.value)}
              placeholder="Notes visible only to your team..."
              className="min-h-[80px] text-sm"
              data-testid="input-internal-notes"
            />
          </Card>

          {/* Activity */}
          <Card className="p-3 space-y-3">
            <Label className="text-xs font-medium">Activity</Label>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs">Created</p>
                  <p className="text-[10px] text-muted-foreground">
                    {rfi.createdByName} - {formatDate(rfi.createdAt)}
                  </p>
                </div>
              </div>
              {rfi.sentAt && (
                <div className="flex items-start gap-2">
                  <Send className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs">Sent</p>
                    <p className="text-[10px] text-muted-foreground">
                      To {rfi.directedToName} - {formatDate(rfi.sentAt)}
                    </p>
                  </div>
                </div>
              )}
              {rfi.respondedAt && (
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 text-green-500 mt-0.5" />
                  <div>
                    <p className="text-xs">Response received</p>
                    <p className="text-[10px] text-muted-foreground">
                      {rfi.respondedByName} - {formatDate(rfi.respondedAt)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
