import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { usePageTitle } from "@/hooks/usePageTitle";
import { 
  BookOpen, 
  Plus, 
  Calendar as CalendarIcon,
  FileText,
  Upload,
  X,
  Edit,
  Trash2,
  Eye,
  Search,
  LayoutList,
  MoreVertical,
  Clock,
  User,
  Cloud,
  Thermometer,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Newspaper,
  Wind,
  Droplets,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, getDay, startOfWeek, endOfWeek } from "date-fns";
import { useUpload } from "@/hooks/use-upload";
import type { 
  Project, 
  SiteDiaryTemplate, 
  SiteDiaryEntry, 
  InsertSiteDiaryEntry,
  TemplateFieldDefinition 
} from "@shared/schema";
import { insertSiteDiaryEntrySchema } from "@shared/schema";
import { z } from "zod";
import { Image as ImageIcon } from "lucide-react";

export default function SiteDiaryEntries() {
  const { toast } = useToast();
  const { user } = useAuth();
  const params = useParams();
  const projectIdFromUrl = params.projectId;
  const pageTitle = usePageTitle({ pageName: "Site Diary" });
  
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [creatingForProjectId, setCreatingForProjectId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewingEntry, setViewingEntry] = useState<SiteDiaryEntry | null>(null);
  const [editingEntry, setEditingEntry] = useState<SiteDiaryEntry | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "calendar" | "feed">("feed");
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const isProjectFromUrl = !!projectIdFromUrl;
  const isStandalone = !isProjectFromUrl;

  useEffect(() => {
    if (projectIdFromUrl) {
      setSelectedProjectId(projectIdFromUrl);
    }
  }, [projectIdFromUrl]);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: templates = [] } = useQuery<SiteDiaryTemplate[]>({
    queryKey: ["/api/site-diary-templates"],
  });

  const { data: projectEntries = [], isLoading: isLoadingProject } = useQuery<SiteDiaryEntry[]>({
    queryKey: ["/api/projects", selectedProjectId, "site-diary-entries"],
    enabled: !!selectedProjectId && isProjectFromUrl,
  });

  const { data: companyEntries = [], isLoading: isLoadingCompany } = useQuery<SiteDiaryEntry[]>({
    queryKey: ["/api/company/site-diary-entries"],
    enabled: isStandalone,
  });

  const entries = isStandalone ? companyEntries : projectEntries;
  const isLoading = isStandalone ? isLoadingCompany : isLoadingProject;

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const effectiveProjectId = isStandalone ? (creatingForProjectId || selectedProjectId) : selectedProjectId;

  const filteredEntries = entries.filter((entry) => {
    if (isStandalone && selectedProjectId && selectedProjectId !== "all") {
      if (entry.projectId !== selectedProjectId) return false;
    }
    return true;
  }).filter((entry) => {
    if (!selectedTemplateId || selectedTemplateId === "all") return true;
    return entry.templateId === selectedTemplateId;
  }).filter((entry) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    if (
      entry.title.toLowerCase().includes(searchLower) ||
      entry.templateName?.toLowerCase().includes(searchLower)
    ) return true;
    const fieldValues = entry.fieldValues as Record<string, any> || {};
    for (const value of Object.values(fieldValues)) {
      if (!value) continue;
      if (typeof value === 'string' || typeof value === 'number') {
        if (String(value).toLowerCase().includes(searchLower)) return true;
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string' && item.toLowerCase().includes(searchLower)) return true;
          if (typeof item === 'number' && String(item).includes(searchLower)) return true;
          if (typeof item === 'object' && item !== null) {
            const label = item.label || item.value || item.name || '';
            if (String(label).toLowerCase().includes(searchLower)) return true;
          }
        }
      } else if (typeof value === 'object' && 'checkedByName' in value) {
        if (value.checkedByName && String(value.checkedByName).toLowerCase().includes(searchLower)) return true;
      } else if (typeof value === 'object' && value !== null) {
        if ('value' in value && typeof value.value === 'string' && value.value.toLowerCase().includes(searchLower)) return true;
      }
    }
    return false;
  });

  const handleAddEntry = (forProjectId?: string) => {
    if (templates.length === 0) {
      toast({
        title: "No templates available",
        description: "Please create a site diary template first",
        variant: "destructive",
      });
      return;
    }
    if (isStandalone && forProjectId) {
      setCreatingForProjectId(forProjectId);
    }
    setIsCreating(true);
  };

  const handleExportPdf = async () => {
    if (filteredEntries.length === 0) return;
    setIsExportingPdf(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { SiteDiaryPdfDocument } = await import("@/components/site-diary/SiteDiaryPdfDocument");
      const projectName = selectedProject?.name || "Site Diary";
      const blob = await pdf(
        SiteDiaryPdfDocument({ entries: filteredEntries, templates, projectName })
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `site-diary-${projectName.replace(/\s+/g, "-").toLowerCase()}-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "PDF exported successfully" });
    } catch (error: any) {
      console.error("PDF export error:", error);
      toast({ title: "Failed to export PDF", description: error.message, variant: "destructive" });
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (viewingEntry) {
    const entryTemplate = templates.find(t => t.id === viewingEntry.templateId);
    return (
      <div className="flex flex-col h-full p-2">
        <EntryViewDetail
          entry={viewingEntry}
          template={entryTemplate || null}
          onClose={() => setViewingEntry(null)}
          onEdit={() => { setEditingEntry(viewingEntry); setViewingEntry(null); }}
        />
      </div>
    );
  }

  if (editingEntry) {
    const editProjectId = editingEntry.projectId || selectedProjectId;
    const entryTemplate = templates.find(t => t.id === editingEntry.templateId);
    return (
      <div className="flex flex-col h-full p-2">
        <EntryEditForm
          entry={editingEntry}
          template={entryTemplate || null}
          onCancel={() => setEditingEntry(null)}
          onSuccess={() => {
            setEditingEntry(null);
            if (isStandalone) {
              queryClient.invalidateQueries({ queryKey: ["/api/company/site-diary-entries"] });
            }
            queryClient.invalidateQueries({ 
              queryKey: ["/api/projects", editProjectId, "site-diary-entries"] 
            });
          }}
        />
      </div>
    );
  }

  if (isCreating) {
    const createProjectId = effectiveProjectId;
    const createProject = projects.find(p => p.id === createProjectId);

    if (!createProjectId && isStandalone) {
      return (
        <div className="flex flex-col h-full p-2">
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">New Site Diary Entry</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => { setIsCreating(false); setCreatingForProjectId(""); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Select a project for this entry</p>
            </CardHeader>
            <CardContent className="py-2">
              <div className="space-y-1">
                {projects.filter(p => p.isActive !== false).map((project) => (
                  <button
                    key={project.id}
                    onClick={() => setCreatingForProjectId(project.id)}
                    className="w-full text-left px-3 py-2.5 text-sm rounded-md border hover-elevate active-elevate-2 flex items-center gap-2"
                    data-testid={`select-project-${project.id}`}
                  >
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span>{project.name}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full p-2">
        <EntryFormWithTemplateSelector
          templates={templates}
          projectId={createProjectId}
          projectName={createProject?.name || selectedProject?.name || ""}
          onCancel={() => { setIsCreating(false); setCreatingForProjectId(""); }}
          onSuccess={() => {
            setIsCreating(false);
            setCreatingForProjectId("");
            if (isStandalone) {
              queryClient.invalidateQueries({ queryKey: ["/api/company/site-diary-entries"] });
            }
            queryClient.invalidateQueries({ 
              queryKey: ["/api/projects", createProjectId, "site-diary-entries"] 
            });
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="page-site-diary">
      {/* Row 1 - Title & Actions (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            {pageTitle}
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-entry-count">
            {filteredEntries.length} entries
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          {filteredEntries.length > 0 && (
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
              onClick={() => handleExportPdf()}
              disabled={isExportingPdf}
              data-testid="button-export-pdf"
            >
              {isExportingPdf ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              <span>PDF</span>
            </button>
          )}
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={() => handleAddEntry()}
            disabled={!isStandalone && !selectedProjectId}
            data-testid="button-add-site-diary"
          >
            <Plus className="w-3 h-3" />
            <span>Add Site Diary</span>
          </button>
        </div>
      </div>

      {/* Row 2 - Filters & Search (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            className={`h-6 w-auto px-2 text-xs border rounded-md flex items-center gap-1 ${viewMode === "list" ? "bg-[#bba7db] text-white border-[#bba7db]/20" : "hover-elevate active-elevate-2"}`}
            onClick={() => setViewMode("list")}
            data-testid="button-list-view"
          >
            <LayoutList className="w-3 h-3" />
            <span>List</span>
          </button>
          <button
            className={`h-6 w-auto px-2 text-xs border rounded-md flex items-center gap-1 ${viewMode === "calendar" ? "bg-[#bba7db] text-white border-[#bba7db]/20" : "hover-elevate active-elevate-2"}`}
            onClick={() => setViewMode("calendar")}
            data-testid="button-calendar-view"
          >
            <CalendarIcon className="w-3 h-3" />
            <span>Calendar</span>
          </button>
          <button
            className={`h-6 w-auto px-2 text-xs border rounded-md flex items-center gap-1 ${viewMode === "feed" ? "bg-[#bba7db] text-white border-[#bba7db]/20" : "hover-elevate active-elevate-2"}`}
            onClick={() => setViewMode("feed")}
            data-testid="button-feed-view"
          >
            <Newspaper className="w-3 h-3" />
            <span>Feed</span>
          </button>

          <div className="w-px h-4 bg-border mx-1" />

          {/* Search */}
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search entries..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="site-diary-search-input"
            />
          </div>

          {/* Project Filter (only when not in project context) */}
          {isStandalone && (
            <Popover>
              <PopoverTrigger asChild>
                <button 
                  className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                  data-testid="filter-project-popover"
                >
                  <span>{selectedProjectId && selectedProjectId !== "all" ? (projects.find(p => p.id === selectedProjectId)?.name || "Project") : "All Projects"}</span>
                  {selectedProjectId && selectedProjectId !== "all" && (
                    <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                      1
                    </Badge>
                  )}
                  <ChevronDown className="w-3 h-3 ml-0.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <div className="space-y-1">
                  <button
                    onClick={() => setSelectedProjectId("")}
                    className={`w-full text-left px-2 py-1.5 text-sm rounded hover-elevate ${
                      !selectedProjectId || selectedProjectId === "all" ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
                    }`}
                    data-testid="filter-project-all"
                  >
                    All Projects
                  </button>
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`w-full text-left px-2 py-1.5 text-sm rounded hover-elevate ${
                        selectedProjectId === project.id ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
                      }`}
                      data-testid={`filter-project-${project.id}`}
                    >
                      {project.name}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Template Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <button 
                className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                data-testid="filter-template-popover"
              >
                <span>Template</span>
                {selectedTemplateId && selectedTemplateId !== "all" && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                    1
                  </Badge>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="space-y-1">
                <button
                  onClick={() => setSelectedTemplateId("all")}
                  className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                    selectedTemplateId === "all" || !selectedTemplateId ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
                  }`}
                  data-testid="filter-template-all"
                >
                  All Templates
                </button>
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                      selectedTemplateId === template.id ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
                    }`}
                    data-testid={`filter-template-${template.id}`}
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">
        {!isStandalone && !selectedProjectId ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <BookOpen className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">No site diary entries</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground text-sm">Loading entries...</p>
          </div>
        ) : viewMode === "calendar" ? (
          <SiteDiaryCalendarView
            entries={filteredEntries}
            currentMonth={calendarMonth}
            onMonthChange={setCalendarMonth}
            onViewEntry={setViewingEntry}
          />
        ) : viewMode === "feed" && filteredEntries.length > 0 ? (
          <SiteDiaryFeedView
            entries={filteredEntries}
            projects={projects}
            isStandalone={isStandalone}
            onView={setViewingEntry}
            onEdit={setEditingEntry}
          />
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">
              {entries.length === 0 ? "No site diary entries yet" : "No matching entries"}
            </p>
            {entries.length === 0 && (
              <button
                className="h-7 px-3 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-1"
                onClick={() => handleAddEntry()}
                data-testid="button-add-first-entry"
              >
                <Plus className="w-3.5 h-3.5" />
                Add First Entry
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredEntries.map((entry) => {
              const entryProject = isStandalone ? projects.find(p => p.id === entry.projectId) : undefined;
              return (
                <SiteDiaryCard 
                  key={entry.id} 
                  entry={entry} 
                  projectName={entryProject?.name}
                  onView={() => setViewingEntry(entry)}
                  onEdit={() => setEditingEntry(entry)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SiteDiaryCalendarView({
  entries,
  currentMonth,
  onMonthChange,
  onViewEntry,
}: {
  entries: SiteDiaryEntry[];
  currentMonth: Date;
  onMonthChange: (d: Date) => void;
  onViewEntry: (entry: SiteDiaryEntry) => void;
}) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getEntriesForDay = (day: Date) => {
    return entries.filter((entry) => {
      const entryDate = new Date(entry.entryDateTime);
      return isSameDay(entryDate, day);
    });
  };

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="flex flex-col h-full" data-testid="calendar-view">
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="icon" onClick={() => onMonthChange(subMonths(currentMonth, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-semibold">{format(currentMonth, "MMMM yyyy")}</h3>
        <Button variant="ghost" size="icon" onClick={() => onMonthChange(addMonths(currentMonth, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-visible flex-1">
        {weekDays.map((day) => (
          <div key={day} className="bg-muted px-2 py-1.5 text-center text-[10px] font-medium text-muted-foreground">
            {day}
          </div>
        ))}
        {days.map((day) => {
          const dayEntries = getEntriesForDay(day);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={day.toISOString()}
              className={`bg-card min-h-[80px] p-1 ${!isCurrentMonth ? "opacity-40" : ""}`}
            >
              <div className={`text-[10px] font-medium mb-0.5 w-5 h-5 flex items-center justify-center rounded-full ${isToday ? "bg-[#bba7db] text-white" : "text-muted-foreground"}`}>
                {format(day, "d")}
              </div>
              <div className="space-y-0.5">
                {dayEntries.slice(0, 3).map((entry) => (
                  <Badge
                    key={entry.id}
                    variant="secondary"
                    className="w-full justify-start text-[9px] px-1 py-0 cursor-pointer truncate bg-[#bba7db]/10 text-[#bba7db] border-0"
                    onClick={() => onViewEntry(entry)}
                    title={entry.title}
                  >
                    {entry.title}
                  </Badge>
                ))}
                {dayEntries.length > 3 && (
                  <span className="text-[9px] text-muted-foreground px-1">
                    +{dayEntries.length - 3} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SiteDiaryFeedView({
  entries,
  projects,
  isStandalone,
  onView,
  onEdit,
}: {
  entries: SiteDiaryEntry[];
  projects: Project[];
  isStandalone: boolean;
  onView: (entry: SiteDiaryEntry) => void;
  onEdit: (entry: SiteDiaryEntry) => void;
}) {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.entryDateTime).getTime() - new Date(a.entryDateTime).getTime()
  );

  const groups: { dateLabel: string; entries: SiteDiaryEntry[] }[] = [];
  sorted.forEach((entry) => {
    const label = format(new Date(entry.entryDateTime), "EEEE, MMMM d, yyyy");
    const last = groups[groups.length - 1];
    if (last && last.dateLabel === label) {
      last.entries.push(entry);
    } else {
      groups.push({ dateLabel: label, entries: [entry] });
    }
  });

  return (
    <div className="max-w-2xl mx-auto py-4 px-2 space-y-6">
      {groups.map((group) => (
        <div key={group.dateLabel}>
          {/* Date divider */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs font-medium text-muted-foreground shrink-0 px-1">
              {group.dateLabel}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="space-y-3">
            {group.entries.map((entry) => (
              <SiteDiaryFeedCard
                key={entry.id}
                entry={entry}
                projectName={isStandalone ? projects.find(p => p.id === entry.projectId)?.name : undefined}
                onView={() => onView(entry)}
                onEdit={() => onEdit(entry)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SiteDiaryFeedCard({
  entry,
  projectName,
  onView,
  onEdit,
}: {
  entry: SiteDiaryEntry;
  projectName?: string;
  onView: () => void;
  onEdit: () => void;
}) {
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fieldValues = entry.fieldValues as Record<string, any> || {};
  const overallPhotos = (entry.overallPhotos as string[]) || [];

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(`/api/site-diary-entries/${entry.id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", entry.projectId, "site-diary-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/company/site-diary-entries"] });
      toast({ title: "Entry deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete entry", description: error?.message || "", variant: "destructive" });
    },
  });

  const weather = entry.weather as Record<string, any> | null;

  const displayFields = Object.entries(fieldValues)
    .filter(([, v]) => {
      if (v === null || v === undefined || v === "") return false;
      if (Array.isArray(v) && v.length === 0) return false;
      if (typeof v === "object" && "value" in v) return v.value === true;
      return true;
    })
    .slice(0, 4);

  const allPhotos = [
    ...overallPhotos,
    ...Object.values(fieldValues).filter(v => Array.isArray(v)).flat().filter(v => typeof v === "string" && (v.startsWith("http") || v.startsWith("/"))),
  ].slice(0, 8);

  return (
    <>
    <Card className="cursor-pointer" onClick={onView}>
      <CardContent className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base leading-tight line-clamp-2">{entry.title}</h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <Badge variant="default" className="text-[10px] px-1.5">{entry.templateName}</Badge>
              {projectName && (
                <Badge variant="outline" className="text-[10px] px-1.5">{projectName}</Badge>
              )}
              {entry.shareWithClient && (
                <Badge variant="secondary" className="text-[10px] px-1.5">Shared</Badge>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(); }}>
                <Eye className="h-4 w-4 mr-2" />View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                <Edit className="h-4 w-4 mr-2" />Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
              >
                <Trash2 className="h-4 w-4 mr-2" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Weather strip */}
        {weather && (weather.condition || weather.temp) && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground py-1.5 px-3 rounded-md bg-muted/50">
            <Cloud className="w-3.5 h-3.5 shrink-0" />
            {weather.condition && <span>{weather.condition}</span>}
            {weather.temp != null && (
              <span className="flex items-center gap-1">
                <Thermometer className="w-3 h-3" />{weather.temp}°C
              </span>
            )}
            {weather.wind != null && (
              <span className="flex items-center gap-1">
                <Wind className="w-3 h-3" />{weather.wind} km/h
              </span>
            )}
            {weather.humidity != null && (
              <span className="flex items-center gap-1">
                <Droplets className="w-3 h-3" />{weather.humidity}%
              </span>
            )}
          </div>
        )}

        {/* Field values preview */}
        {displayFields.length > 0 && (
          <div className="space-y-1.5">
            {displayFields.map(([key, val]) => {
              let displayVal: string;
              if (typeof val === "object" && "value" in val) {
                displayVal = val.value === true ? (val.checkedByName ? `Yes — ${val.checkedByName}` : "Yes") : "No";
              } else if (Array.isArray(val)) {
                displayVal = val.join(", ");
              } else {
                displayVal = String(val);
              }
              const label = key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());
              return (
                <div key={key} className="flex gap-2 text-xs">
                  <span className="text-muted-foreground shrink-0 min-w-[80px]">{label}</span>
                  <span className="line-clamp-2 text-foreground/80">{displayVal}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Photo strip */}
        {allPhotos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {allPhotos.map((url, i) => (
              <img
                key={i}
                src={url}
                alt=""
                className="h-20 w-auto rounded-md object-cover shrink-0"
                onClick={(e) => e.stopPropagation()}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1 border-t border-border">
          {entry.createdByName && (
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />{entry.createdByName}
            </span>
          )}
          <span className="flex items-center gap-1 ml-auto">
            <Clock className="w-3 h-3" />
            {format(new Date(entry.entryDateTime), "h:mm a")}
          </span>
        </div>
      </CardContent>
    </Card>

    {showDeleteConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDeleteConfirm(false)}>
        <div className="bg-background border rounded-lg p-4 max-w-sm mx-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
          <h3 className="font-semibold text-sm mb-2">Delete Site Diary Entry</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Are you sure you want to delete "{entry.title}"? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { deleteMutation.mutate(); setShowDeleteConfirm(false); }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function SiteDiaryCard({ entry, projectName, onView, onEdit }: { entry: SiteDiaryEntry; projectName?: string; onView: () => void; onEdit: () => void }) {
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fieldValues = entry.fieldValues as Record<string, any> || {};
  
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(`/api/site-diary-entries/${entry.id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", entry.projectId, "site-diary-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/company/site-diary-entries"] });
      toast({ title: "Entry deleted" });
    },
    onError: (error: any) => {
      const msg = error?.message || "";
      if (msg.includes("403") || msg.includes("permission")) {
        toast({ title: "Permission denied", description: "You don't have permission to delete site diary entries.", variant: "destructive" });
      } else {
        toast({ title: "Failed to delete entry", description: msg, variant: "destructive" });
      }
    },
  });

  const getWeatherDisplay = () => {
    const weather = fieldValues.weather || fieldValues.weatherConditions;
    if (weather) return weather;
    return null;
  };

  const getTemperatureDisplay = () => {
    const temp = fieldValues.temperature || fieldValues.temp;
    if (temp) return `${temp}°C`;
    return null;
  };

  const weather = getWeatherDisplay();
  const temperature = getTemperatureDisplay();

  return (
    <>
    <div 
      className="group border rounded-md p-2 bg-card hover-elevate transition-all cursor-pointer"
      onClick={onView}
      data-testid={`site-diary-card-${entry.id}`}
    >
      <div className="flex items-start gap-2">
        {/* Title and Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm mb-1 line-clamp-1" data-testid={`entry-title-${entry.id}`}>
            {entry.title}
          </h3>
          {fieldValues.notes || fieldValues.description || fieldValues.summary ? (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {fieldValues.notes || fieldValues.description || fieldValues.summary}
            </p>
          ) : null}
          {/* Checkbox accountability indicators */}
          {(() => {
            const checkboxEntries = Object.entries(fieldValues).filter(
              ([, v]) => v && typeof v === 'object' && 'checkedBy' in v && v.value === true
            );
            if (checkboxEntries.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-1 mt-1">
                {checkboxEntries.map(([key, v]: [string, any]) => (
                  <span key={key} className="text-[9px] text-muted-foreground">
                    {v.checkedByName} {v.checkedAt ? format(new Date(v.checkedAt), "h:mm a") : ""}
                  </span>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Metadata Column */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Project Name (standalone mode) */}
          {projectName && (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px]" data-testid={`entry-project-${entry.id}`}>
              {projectName}
            </Badge>
          )}

          {/* Template */}
          <Badge variant="default" className="h-4 px-1.5 text-[10px]" data-testid={`entry-template-${entry.id}`}>
            {entry.templateName}
          </Badge>

          {/* Weather */}
          {weather && (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px]" data-testid={`entry-weather-${entry.id}`}>
              <Cloud className="w-2.5 h-2.5 mr-0.5" />
              {weather}
            </Badge>
          )}

          {/* Temperature */}
          {temperature && (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px]" data-testid={`entry-temp-${entry.id}`}>
              <Thermometer className="w-2.5 h-2.5 mr-0.5" />
              {temperature}
            </Badge>
          )}

          {/* Date */}
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground" data-testid={`entry-date-${entry.id}`}>
            <CalendarIcon className="h-3 w-3" />
            <span>{format(new Date(entry.entryDateTime), "MMM d, yyyy")}</span>
          </div>

          {/* Share indicator */}
          {entry.shareWithClient && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              Shared
            </Badge>
          )}

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" data-testid={`entry-menu-trigger-${entry.id}`}>
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(); }} data-testid={`entry-view-${entry.id}`}>
                <Eye className="h-4 w-4 mr-2" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }} data-testid={`entry-edit-${entry.id}`}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="text-destructive" 
                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
                data-testid={`entry-delete-${entry.id}`}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>

    {/* Delete Confirmation Dialog */}
    {showDeleteConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDeleteConfirm(false)}>
        <div className="bg-background border rounded-lg p-4 max-w-sm mx-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
          <h3 className="font-semibold text-sm mb-2">Delete Site Diary Entry</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Are you sure you want to delete "{entry.title}"? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={() => { deleteMutation.mutate(); setShowDeleteConfirm(false); }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function EntryFormWithTemplateSelector({ 
  templates,
  projectId, 
  projectName,
  onCancel, 
  onSuccess 
}: { 
  templates: SiteDiaryTemplate[];
  projectId: string;
  projectName: string;
  onCancel: () => void; 
  onSuccess: () => void;
}) {
  const { user } = useAuth();
  
  // Find default template or use first available
  const defaultTemplate = templates.find(t => t.isDefault) || templates[0];
  const [selectedTemplateId, setSelectedTemplateId] = useState(defaultTemplate?.id || "");
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  if (!selectedTemplate) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No templates available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <CardTitle className="text-base">New Site Diary Entry</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{projectName}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel} data-testid="button-cancel-entry">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {/* Template Selector */}
        <div className="mt-3">
          <Label className="text-xs font-medium">Template</Label>
          <TemplatePopoverSelector
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            onSelect={setSelectedTemplateId}
          />
        </div>
      </CardHeader>
      <CardContent className="py-2">
        <EntryFormFields
          key={selectedTemplate.id}
          template={selectedTemplate}
          projectId={projectId}
          onSuccess={onSuccess}
        />
      </CardContent>
    </Card>
  );
}

function TemplatePopoverSelector({
  templates,
  selectedTemplateId,
  onSelect,
}: {
  templates: SiteDiaryTemplate[];
  selectedTemplateId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-full items-center justify-between rounded-md border-2 border-input bg-background px-3 py-2 text-sm mt-1 hover-elevate"
          data-testid="select-template"
        >
          <span className="flex items-center gap-2 truncate">
            {selectedTemplate?.name || "Select template"}
            {selectedTemplate?.isDefault && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1">Default</Badge>
            )}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-1" align="start">
        <div className="space-y-0.5">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => { onSelect(template.id); setOpen(false); }}
              className={`w-full text-left px-2 py-1.5 text-sm rounded hover-elevate flex items-center gap-2 ${
                selectedTemplateId === template.id ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
              }`}
              data-testid={`template-option-${template.id}`}
            >
              <span>{template.name}</span>
              {template.isDefault && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1">Default</Badge>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface UploadedFile {
  name: string;
  objectPath: string;
  size: number;
  contentType: string;
  uploadedAt: string;
}

function SiteDiaryFileUpload({
  fieldId,
  type,
  value,
  onChange,
  maxFiles,
}: {
  fieldId: string;
  type: 'file' | 'photo-gallery';
  value: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  maxFiles: number;
}) {
  const { toast } = useToast();
  const [uploadingCount, setUploadingCount] = useState(0);
  const { uploadFile, isUploading, progress } = useUpload({
    onSuccess: (response) => {
      const newFile: UploadedFile = {
        name: response.metadata.name,
        objectPath: response.objectPath,
        size: response.metadata.size,
        contentType: response.metadata.contentType,
        uploadedAt: new Date().toISOString(),
      };
      onChange([...(value || []), newFile]);
    },
    onError: (error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const currentCount = (value || []).length;
    const remainingSlots = maxFiles - currentCount;
    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    setUploadingCount(filesToUpload.length);
    for (const file of filesToUpload) {
      await uploadFile(file);
    }
    setUploadingCount(0);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    const updated = [...(value || [])];
    updated.splice(index, 1);
    onChange(updated);
  };

  const currentFiles = value || [];
  const canAddMore = currentFiles.length < maxFiles;
  const isPhoto = type === 'photo-gallery';
  const acceptAttr = isPhoto ? "image/*" : undefined;

  return (
    <div className="space-y-2" data-testid={`upload-field-${fieldId}`}>
      {currentFiles.length > 0 && (
        <div className={isPhoto ? "grid grid-cols-3 gap-2" : "space-y-1"}>
          {currentFiles.map((f, i) => (
            <div key={i} className="relative group border rounded-md overflow-hidden">
              {isPhoto ? (
                <div className="aspect-square bg-muted flex items-center justify-center">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] px-1 py-0.5 truncate">
                    {f.name}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-1.5 text-xs">
                  <FileText className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1">{f.name}</span>
                  <span className="text-muted-foreground text-[10px]">{(f.size / 1024).toFixed(0)}KB</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {canAddMore && (
        <label className="border-2 border-dashed rounded-md p-3 text-center cursor-pointer block hover-elevate">
          <input
            type="file"
            className="hidden"
            accept={acceptAttr}
            multiple={maxFiles > 1}
            onChange={handleFileSelect}
            disabled={isUploading}
          />
          {isUploading ? (
            <>
              <div className="h-1 bg-muted rounded-full overflow-hidden mb-1">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">Uploading... {progress}%</p>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-xs text-muted-foreground">
                {isPhoto 
                  ? `Upload photos (${currentFiles.length}/${maxFiles})` 
                  : "Upload file"}
              </p>
            </>
          )}
        </label>
      )}
    </div>
  );
}

function EntryFormFields({ 
  template, 
  projectId, 
  onSuccess 
}: { 
  template: SiteDiaryTemplate; 
  projectId: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const templateFields = (template.fields as TemplateFieldDefinition[]) || [];

  const buildFormSchema = () => {
    const fieldSchemas: Record<string, z.ZodTypeAny> = {};
    
    templateFields.forEach(field => {
      if (field.type === 'file' || field.type === 'photo-gallery') {
        const fileSchema = z.object({
          name: z.string(),
          objectPath: z.string(),
          size: z.number(),
          contentType: z.string(),
          uploadedAt: z.string(),
        });
        fieldSchemas[field.id] = field.required 
          ? z.array(fileSchema).min(1, "At least one file is required")
          : z.array(fileSchema).optional();
      } else if (field.required) {
        if (field.type === 'number') {
          fieldSchemas[field.id] = z.string()
            .min(1, "Required")
            .transform(val => Number(val))
            .pipe(z.number());
        } else if (field.type === 'checkbox') {
          fieldSchemas[field.id] = z.any()
            .transform(val => val === true || val === "true")
            .pipe(z.boolean().refine(val => val === true, {
              message: "This field must be checked"
            }));
        } else if (field.type === 'date') {
          fieldSchemas[field.id] = z.string().min(1, "Required");
        } else {
          fieldSchemas[field.id] = z.string().min(1, "Required");
        }
      } else {
        if (field.type === 'number') {
          fieldSchemas[field.id] = z.string()
            .transform(val => val === '' ? undefined : Number(val))
            .pipe(z.number().optional());
        } else if (field.type === 'checkbox') {
          fieldSchemas[field.id] = z.any()
            .transform(val => val === true || val === "true")
            .pipe(z.boolean().optional());
        } else {
          fieldSchemas[field.id] = z.string().optional();
        }
      }
    });

    return z.object({
      title: z.string().min(1, "Title is required"),
      entryDateTime: z.string().min(1, "Date is required"),
      ...fieldSchemas,
    });
  };

  const formSchema = buildFormSchema();
  type FormData = z.infer<typeof formSchema>;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      entryDateTime: format(new Date(), 'yyyy-MM-dd'),
      ...templateFields.reduce((acc, field) => {
        if (field.type === 'checkbox') acc[field.id] = false;
        else if (field.type === 'file' || field.type === 'photo-gallery') acc[field.id] = [];
        else acc[field.id] = '';
        return acc;
      }, {} as Record<string, any>),
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const fieldValues: Record<string, any> = {};
      templateFields.forEach(field => {
        const val = data[field.id as keyof FormData];
        if (field.type === 'checkbox') {
          fieldValues[field.id] = {
            value: val === true || val === "true",
            checkedBy: val ? currentUser?.id : null,
            checkedByName: val ? (currentUser?.fullName || currentUser?.email || "Unknown") : null,
            checkedAt: val ? new Date().toISOString() : null,
          };
        } else {
          fieldValues[field.id] = val;
        }
      });

      const entryData: InsertSiteDiaryEntry = {
        templateId: template.id,
        templateName: template.name,
        projectId,
        title: data.title,
        entryDateTime: new Date(data.entryDateTime),
        fieldValues,
        attachments: [],
        overallPhotos: [],
        shareWithClient: false,
      };

      const response = await apiRequest("/api/site-diary-entries", "POST", entryData);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Site diary entry created successfully" });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create entry",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    createMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Entry Title *</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Daily Progress - Framing" className="h-8 text-sm" {...field} data-testid="input-entry-title" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="entryDateTime"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Entry Date *</FormLabel>
              <FormControl>
                <Input type="date" className="h-8 text-sm" {...field} data-testid="input-entry-date" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {templateFields.map((templateField) => (
          <FormField
            key={templateField.id}
            control={form.control}
            name={templateField.id as any}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">
                  {templateField.title}
                  {templateField.required && " *"}
                </FormLabel>
                {templateField.type === 'text' && (
                  <FormControl>
                    <Input 
                      {...field} 
                      value={field.value as string || ''} 
                      className="h-8 text-sm"
                      data-testid={`input-field-${templateField.id}`}
                    />
                  </FormControl>
                )}
                {templateField.type === 'textarea' && (
                  <FormControl>
                    <Textarea 
                      {...field} 
                      value={field.value as string || ''} 
                      className="text-sm min-h-[60px]"
                      data-testid={`textarea-field-${templateField.id}`}
                    />
                  </FormControl>
                )}
                {templateField.type === 'number' && (
                  <FormControl>
                    <Input 
                      type="number" 
                      {...field} 
                      value={field.value as number || ''} 
                      className="h-8 text-sm"
                      data-testid={`input-number-${templateField.id}`}
                    />
                  </FormControl>
                )}
                {templateField.type === 'date' && (
                  <FormControl>
                    <Input 
                      type="date" 
                      {...field} 
                      value={field.value as string || ''} 
                      className="h-8 text-sm"
                      data-testid={`input-date-${templateField.id}`}
                    />
                  </FormControl>
                )}
                {templateField.type === 'select' && (
                  <FormControl>
                    <Select 
                      value={field.value as string || ''} 
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger className="h-8 text-sm" data-testid={`select-field-${templateField.id}`}>
                        <SelectValue placeholder="Select an option" />
                      </SelectTrigger>
                      <SelectContent>
                        {templateField.options?.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                )}
                {templateField.type === 'checkbox' && (
                  <FormControl>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={field.value as boolean || false}
                        onCheckedChange={field.onChange}
                        data-testid={`checkbox-field-${templateField.id}`}
                      />
                    </div>
                  </FormControl>
                )}
                {(templateField.type === 'file' || templateField.type === 'photo-gallery') && (
                  <FormControl>
                    <SiteDiaryFileUpload
                      fieldId={templateField.id}
                      type={templateField.type}
                      value={field.value as any[] || []}
                      onChange={field.onChange}
                      maxFiles={templateField.type === 'photo-gallery' ? 3 : 1}
                    />
                  </FormControl>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        ))}

        <div className="flex gap-2 pt-2">
          <Button 
            type="submit" 
            size="sm"
            disabled={createMutation.isPending}
            data-testid="button-submit-entry"
          >
            {createMutation.isPending ? "Creating..." : "Create Entry"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function EntryViewDetail({
  entry,
  template,
  onClose,
  onEdit,
}: {
  entry: SiteDiaryEntry;
  template: SiteDiaryTemplate | null;
  onClose: () => void;
  onEdit: () => void;
}) {
  const fieldValues = (entry.fieldValues as Record<string, any>) || {};
  const templateFields = (template?.fields as TemplateFieldDefinition[]) || [];

  const renderFieldValue = (field: TemplateFieldDefinition) => {
    const val = fieldValues[field.id];
    if (val === undefined || val === null || val === "") {
      return <span className="text-muted-foreground italic text-xs">Not set</span>;
    }

    if (field.type === "checkbox") {
      if (typeof val === "object" && "value" in val) {
        return (
          <div className="flex items-center gap-2">
            <Checkbox checked={val.value} disabled />
            {val.value && val.checkedByName && (
              <span className="text-xs text-muted-foreground">
                by {val.checkedByName}
                {val.checkedAt && ` at ${format(new Date(val.checkedAt), "MMM d, h:mm a")}`}
              </span>
            )}
          </div>
        );
      }
      return <Checkbox checked={!!val} disabled />;
    }

    if (field.type === "file" || field.type === "photo-gallery") {
      const files = Array.isArray(val) ? val : [];
      if (files.length === 0) return <span className="text-muted-foreground italic text-xs">No files</span>;
      return (
        <div className="space-y-1">
          {files.map((file: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-xs border rounded-md p-1.5">
              {field.type === "photo-gallery" && file.objectPath ? (
                <img src={`/api/uploads/file/${encodeURIComponent(file.objectPath)}`} alt={file.name} className="h-10 w-10 rounded object-cover" />
              ) : (
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
              <span className="truncate">{file.name}</span>
            </div>
          ))}
        </div>
      );
    }

    if (field.type === "textarea") {
      return <p className="text-sm whitespace-pre-wrap">{String(val)}</p>;
    }

    if (field.type === "date") {
      try {
        return <span className="text-sm">{format(new Date(val), "MMM d, yyyy")}</span>;
      } catch {
        return <span className="text-sm">{String(val)}</span>;
      }
    }

    return <span className="text-sm">{String(val)}</span>;
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate">{entry.title}</CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="default" className="text-[10px]">{entry.templateName}</Badge>
              <span className="text-xs text-muted-foreground">
                {format(new Date(entry.entryDateTime), "EEEE, MMM d, yyyy")}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={onEdit} data-testid="button-edit-entry">
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-view">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="py-2 space-y-4">
        {templateFields.length > 0 ? (
          templateFields.map((field) => (
            <div key={field.id} className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">{field.title}</Label>
              {renderFieldValue(field)}
            </div>
          ))
        ) : (
          Object.entries(fieldValues).map(([key, val]) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</Label>
              <p className="text-sm">{typeof val === "object" ? JSON.stringify(val) : String(val)}</p>
            </div>
          ))
        )}
        {entry.createdBy && (
          <div className="pt-2 border-t">
            <span className="text-xs text-muted-foreground">
              Created by {entry.createdByName || entry.createdBy}
              {entry.createdAt && ` on ${format(new Date(entry.createdAt), "MMM d, yyyy h:mm a")}`}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EntryEditForm({
  entry,
  template,
  onCancel,
  onSuccess,
}: {
  entry: SiteDiaryEntry;
  template: SiteDiaryTemplate | null;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const fieldValues = (entry.fieldValues as Record<string, any>) || {};
  const templateFields = (template?.fields as TemplateFieldDefinition[]) || [];

  const buildFormSchema = () => {
    const fieldSchemas: Record<string, z.ZodTypeAny> = {};
    templateFields.forEach((field) => {
      if (field.type === "file" || field.type === "photo-gallery") {
        const fileSchema = z.object({
          name: z.string(),
          objectPath: z.string(),
          size: z.number(),
          contentType: z.string(),
          uploadedAt: z.string(),
        });
        fieldSchemas[field.id] = field.required
          ? z.array(fileSchema).min(1, "At least one file is required")
          : z.array(fileSchema).optional();
      } else if (field.required) {
        if (field.type === "number") {
          fieldSchemas[field.id] = z.string().min(1, "Required").transform((val) => Number(val)).pipe(z.number());
        } else if (field.type === "checkbox") {
          fieldSchemas[field.id] = z.any().transform((val) => val === true || val === "true").pipe(z.boolean());
        } else {
          fieldSchemas[field.id] = z.string().min(1, "Required");
        }
      } else {
        if (field.type === "number") {
          fieldSchemas[field.id] = z.string().transform((val) => (val === "" ? undefined : Number(val))).pipe(z.number().optional());
        } else if (field.type === "checkbox") {
          fieldSchemas[field.id] = z.any().transform((val) => val === true || val === "true").pipe(z.boolean().optional());
        } else {
          fieldSchemas[field.id] = z.string().optional();
        }
      }
    });
    return z.object({
      title: z.string().min(1, "Title is required"),
      entryDateTime: z.string().min(1, "Date is required"),
      ...fieldSchemas,
    });
  };

  const formSchema = buildFormSchema();
  type FormData = z.infer<typeof formSchema>;

  const getDefaultValue = (field: TemplateFieldDefinition) => {
    const val = fieldValues[field.id];
    if (field.type === "checkbox") {
      if (typeof val === "object" && "value" in val) return val.value;
      return !!val;
    }
    if (field.type === "file" || field.type === "photo-gallery") {
      return Array.isArray(val) ? val : [];
    }
    if (field.type === "number") {
      return val !== undefined && val !== null ? String(val) : "";
    }
    return val !== undefined && val !== null ? String(val) : "";
  };

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: entry.title,
      entryDateTime: entry.entryDateTime
        ? format(new Date(entry.entryDateTime), 'yyyy-MM-dd')
        : format(new Date(), 'yyyy-MM-dd'),
      ...templateFields.reduce((acc, field) => {
        acc[field.id] = getDefaultValue(field);
        return acc;
      }, {} as Record<string, any>),
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const newFieldValues: Record<string, any> = {};
      templateFields.forEach((field) => {
        const val = data[field.id as keyof FormData];
        if (field.type === "checkbox") {
          const existingVal = fieldValues[field.id];
          const wasChecked = typeof existingVal === "object" && existingVal?.value === true
            ? true
            : existingVal === true;
          const isNowChecked = val === true || val === "true";
          if (isNowChecked && !wasChecked) {
            newFieldValues[field.id] = {
              value: true,
              checkedBy: currentUser?.id,
              checkedByName: currentUser?.fullName || currentUser?.email || "Unknown",
              checkedAt: new Date().toISOString(),
            };
          } else if (!isNowChecked) {
            newFieldValues[field.id] = { value: false, checkedBy: null, checkedByName: null, checkedAt: null };
          } else if (typeof existingVal === "object" && "value" in existingVal) {
            newFieldValues[field.id] = existingVal;
          } else {
            newFieldValues[field.id] = {
              value: true,
              checkedBy: currentUser?.id,
              checkedByName: currentUser?.fullName || currentUser?.email || "Unknown",
              checkedAt: new Date().toISOString(),
            };
          }
        } else {
          newFieldValues[field.id] = val;
        }
      });

      const response = await apiRequest(`/api/site-diary-entries/${entry.id}`, "PATCH", {
        title: data.title,
        entryDateTime: new Date(data.entryDateTime),
        fieldValues: newFieldValues,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Entry updated successfully" });
      onSuccess();
    },
    onError: (error: any) => {
      toast({ title: "Failed to update entry", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: FormData) => {
    updateMutation.mutate(data);
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="text-base">Edit Site Diary Entry</CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="default" className="text-[10px]">{entry.templateName}</Badge>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel} data-testid="button-cancel-edit">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="py-2">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Entry Title *</FormLabel>
                  <FormControl>
                    <Input className="h-8 text-sm" {...field} data-testid="input-edit-title" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="entryDateTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Entry Date *</FormLabel>
                  <FormControl>
                    <Input type="date" className="h-8 text-sm" {...field} data-testid="input-edit-date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {templateFields.map((templateField) => (
              <FormField
                key={templateField.id}
                control={form.control}
                name={templateField.id as any}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">
                      {templateField.title}
                      {templateField.required && " *"}
                    </FormLabel>
                    {templateField.type === "text" && (
                      <FormControl>
                        <Input {...field} value={(field.value as string) || ""} className="h-8 text-sm" />
                      </FormControl>
                    )}
                    {templateField.type === "textarea" && (
                      <FormControl>
                        <Textarea {...field} value={(field.value as string) || ""} className="text-sm min-h-[60px]" />
                      </FormControl>
                    )}
                    {templateField.type === "number" && (
                      <FormControl>
                        <Input type="number" {...field} value={(field.value as number) || ""} className="h-8 text-sm" />
                      </FormControl>
                    )}
                    {templateField.type === "date" && (
                      <FormControl>
                        <Input type="date" {...field} value={(field.value as string) || ""} className="h-8 text-sm" />
                      </FormControl>
                    )}
                    {templateField.type === "select" && (
                      <FormControl>
                        <Select value={(field.value as string) || ""} onValueChange={field.onChange}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Select an option" />
                          </SelectTrigger>
                          <SelectContent>
                            {templateField.options?.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                    )}
                    {templateField.type === "checkbox" && (
                      <FormControl>
                        <div className="flex items-center space-x-2">
                          <Checkbox checked={(field.value as boolean) || false} onCheckedChange={field.onChange} />
                        </div>
                      </FormControl>
                    )}
                    {(templateField.type === "file" || templateField.type === "photo-gallery") && (
                      <FormControl>
                        <SiteDiaryFileUpload
                          fieldId={templateField.id}
                          type={templateField.type}
                          value={(field.value as any[]) || []}
                          onChange={field.onChange}
                          maxFiles={templateField.type === "photo-gallery" ? 3 : 1}
                        />
                      </FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <div className="flex gap-2 pt-2">
              <Button type="submit" size="sm" disabled={updateMutation.isPending} data-testid="button-save-entry">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
