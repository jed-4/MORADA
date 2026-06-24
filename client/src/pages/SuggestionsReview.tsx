import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Lightbulb } from "lucide-react";
import type { SuggestionWithMeta } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SUGGESTION_SECTIONS, SUGGESTION_SECTION_LABELS } from "@/lib/suggestionSections";

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "planned", label: "Planned" },
  { value: "done", label: "Done" },
  { value: "declined", label: "Declined" },
];

const PRIORITY_OPTIONS = [
  { value: "none", label: "No priority" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  new: "default",
  reviewing: "secondary",
  planned: "secondary",
  done: "outline",
  declined: "destructive",
};

function formatDate(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SuggestionsReview() {
  const { toast } = useToast();
  const [sectionFilter, setSectionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const queryKey = ["/api/suggestions", { section: sectionFilter, status: statusFilter }] as const;

  const { data: suggestions = [], isLoading } = useQuery<SuggestionWithMeta[]>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sectionFilter !== "all") params.set("section", sectionFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const qs = params.toString();
      const res = await apiRequest(`/api/suggestions${qs ? `?${qs}` : ""}`, "GET");
      return res as unknown as SuggestionWithMeta[];
    },
    staleTime: 0,
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: { status?: string; priority?: string | null; internalNote?: string | null };
    }) => {
      return apiRequest(`/api/suggestions/${id}`, "PATCH", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suggestions"] });
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Couldn't save the change. Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 flex-wrap">
        <Lightbulb className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Suggestions</h1>
        <Badge variant="secondary" data-testid="badge-suggestion-count">
          {suggestions.length}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Feedback submitted by users across all companies.
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-56">
          <Select value={sectionFilter} onValueChange={setSectionFilter}>
            <SelectTrigger data-testid="filter-section">
              <SelectValue placeholder="All areas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All areas</SelectItem>
              {SUGGESTION_SECTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="filter-status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-12 text-center">Loading suggestions...</div>
      ) : suggestions.length === 0 ? (
        <div className="text-sm text-muted-foreground py-12 text-center">
          No suggestions yet.
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => (
            <SuggestionRow
              key={s.id}
              suggestion={s}
              onUpdate={(updates) => updateMutation.mutate({ id: s.id, updates })}
              isSaving={updateMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionRow({
  suggestion,
  onUpdate,
  isSaving,
}: {
  suggestion: SuggestionWithMeta;
  onUpdate: (updates: { status?: string; priority?: string | null; internalNote?: string | null }) => void;
  isSaving: boolean;
}) {
  const [note, setNote] = useState(suggestion.internalNote ?? "");
  const noteDirty = note !== (suggestion.internalNote ?? "");

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">
            {SUGGESTION_SECTION_LABELS[suggestion.section] ?? suggestion.section}
          </CardTitle>
          <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
            <span>{suggestion.userName || suggestion.userEmail || "Unknown user"}</span>
            {suggestion.companyName && <span>· {suggestion.companyName}</span>}
            {suggestion.roleName && <span>· {suggestion.roleName}</span>}
            <span>· {formatDate(suggestion.createdAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Badge variant="outline">{suggestion.platform}</Badge>
          <Badge variant={STATUS_VARIANT[suggestion.status] ?? "default"}>
            {suggestion.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm whitespace-pre-wrap" data-testid={`text-message-${suggestion.id}`}>
          {suggestion.message}
        </p>
        {(suggestion.sourcePage || suggestion.appVersion) && (
          <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
            {suggestion.sourcePage && <span>Page: {suggestion.sourcePage}</span>}
            {suggestion.appVersion && <span>· App v{suggestion.appVersion}</span>}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-40">
            <Select
              value={suggestion.status}
              onValueChange={(value) => onUpdate({ status: value })}
            >
              <SelectTrigger data-testid={`status-${suggestion.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Select
              value={suggestion.priority ?? "none"}
              onValueChange={(value) => onUpdate({ priority: value === "none" ? null : value })}
            >
              <SelectTrigger data-testid={`priority-${suggestion.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Textarea
            placeholder="Internal note (staff only)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="resize-none"
            data-testid={`note-${suggestion.id}`}
          />
          {noteDirty && (
            <div className="flex justify-end gap-2 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNote(suggestion.internalNote ?? "")}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isSaving}
                onClick={() => onUpdate({ internalNote: note })}
                data-testid={`save-note-${suggestion.id}`}
              >
                Save note
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
