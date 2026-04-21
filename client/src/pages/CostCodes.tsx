import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  DataTableColumnPicker,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  Upload,
  MoreVertical,
  Pencil,
  Archive,
  GitMerge,
  Clock,
  Ban,
  Maximize2,
  Minimize2,
  X,
  FolderInput,
  Columns3,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import type { CostCategory, CostCode } from "@shared/schema";
import AddCategoryDialog from "@/components/AddCategoryDialog";
import AddCostCodeDialog from "@/components/AddCostCodeDialog";
import ImportCostCodesDialog from "@/components/ImportCostCodesDialog";
import MergeCostCodeDialog from "@/components/MergeCostCodeDialog";
import EditCategoryDialog from "@/components/EditCategoryDialog";
import MergeCategoryDialog from "@/components/MergeCategoryDialog";
import EditCostCodeDialog from "@/components/EditCostCodeDialog";
import BulkXeroMappingDialog from "@/components/BulkXeroMappingDialog";

const TABLE_STORAGE_KEY = "cost-codes";
const LEGACY_STORAGE_KEY = "cost-codes-column-config-v1";

type CostCodeRow = CostCode & { xeroTrackingOptionName?: string };

export default function CostCodes() {
  const { toast } = useToast();
  const pageTitle = usePageTitle({ pageName: "Cost Codes" });
  const [searchTerm, setSearchTerm] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [isAddCostCodeOpen, setIsAddCostCodeOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [selectedCodeForMerge, setSelectedCodeForMerge] = useState<CostCode | null>(null);
  const [isEditCategoryOpen, setIsEditCategoryOpen] = useState(false);
  const [selectedCategoryForEdit, setSelectedCategoryForEdit] = useState<CostCategory | null>(null);
  const [isMergeCategoryOpen, setIsMergeCategoryOpen] = useState(false);
  const [selectedCategoryForMerge, setSelectedCategoryForMerge] = useState<CostCategory | null>(null);
  const [isEditCostCodeOpen, setIsEditCostCodeOpen] = useState(false);
  const [selectedCostCodeForEdit, setSelectedCostCodeForEdit] = useState<CostCode | null>(null);
  const [isBulkXeroMappingOpen, setIsBulkXeroMappingOpen] = useState(false);
  const [selectedCodeIds, setSelectedCodeIds] = useState<Set<string>>(new Set());
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<CostCategory[]>({
    queryKey: ["/api/cost-categories"],
  });

  const { data: codes = [], isLoading: codesLoading } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const { data: xeroStatus } = useQuery<{ connected?: boolean; trackingCategory1Id?: string }>({
    queryKey: ["/api/xero/status"],
  });
  const xeroConnected = xeroStatus?.connected === true && !!xeroStatus?.trackingCategory1Id;

  const archiveMutation = useMutation({
    mutationFn: (codeId: string) =>
      apiRequest(`/api/cost-codes/${codeId}/archive`, "POST"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-codes"] });
      toast({
        title: "Cost code archived",
        description: "The cost code has been archived successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to archive cost code.",
        variant: "destructive",
      });
    },
  });

  const archiveCategoryMutation = useMutation({
    mutationFn: (categoryId: string) =>
      apiRequest(`/api/cost-categories/${categoryId}/archive`, "POST"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-categories"] });
      toast({
        title: "Category archived",
        description: "The cost category has been archived successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to archive category.",
        variant: "destructive",
      });
    },
  });

  const toggleTimesheetMutation = useMutation({
    mutationFn: ({ id, availableInTimesheets }: { id: string; availableInTimesheets: boolean }) =>
      apiRequest(`/api/cost-codes/${id}`, "PATCH", { availableInTimesheets }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-codes"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update cost code.",
        variant: "destructive",
      });
    },
  });

  const bulkToggleTimesheetMutation = useMutation({
    mutationFn: async ({ codeIds, availableInTimesheets }: { codeIds: string[]; availableInTimesheets: boolean }) => {
      await Promise.all(
        codeIds.map(id => apiRequest(`/api/cost-codes/${id}`, "PATCH", { availableInTimesheets }))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-codes"] });
      clearSelection();
      toast({
        title: "Bulk update completed",
        description: "Timesheet availability updated for selected codes.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update some cost codes.",
        variant: "destructive",
      });
    },
  });

  const bulkMoveCategoryMutation = useMutation({
    mutationFn: async ({ codeIds, categoryId }: { codeIds: string[]; categoryId: string | null }) => {
      await Promise.all(
        codeIds.map(id => apiRequest(`/api/cost-codes/${id}`, "PATCH", { categoryId }))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-codes"] });
      clearSelection();
      toast({
        title: "Bulk move completed",
        description: "Selected codes moved to new category.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to move some cost codes.",
        variant: "destructive",
      });
    },
  });

  const bulkArchiveMutation = useMutation({
    mutationFn: async (codeIds: string[]) => {
      await Promise.all(
        codeIds.map(id => apiRequest(`/api/cost-codes/${id}/archive`, "POST"))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-codes"] });
      clearSelection();
      toast({
        title: "Bulk archive completed",
        description: "Selected codes have been archived.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to archive some cost codes.",
        variant: "destructive",
      });
    },
  });

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const filteredCategories = categories.filter(category => {
    if (!showArchived && !category.isActive) return false;
    if (searchTerm) {
      const matchesCategory = category.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             category.title.toLowerCase().includes(searchTerm.toLowerCase());
      const hasCodes = codes.some(code =>
        code.categoryId === category.id &&
        (code.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
         code.title.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      return matchesCategory || hasCodes;
    }
    return true;
  });

  const getCodesForCategory = (categoryId: string | null): CostCodeRow[] => {
    return (codes as CostCodeRow[]).filter(code => {
      if (code.categoryId !== categoryId) return false;
      if (!showArchived && code.isArchived) return false;
      if (searchTerm) {
        return code.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
               code.title.toLowerCase().includes(searchTerm.toLowerCase());
      }
      return true;
    }).sort((a, b) => {
      const aNum = parseFloat(a.code);
      const bNum = parseFloat(b.code);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return aNum - bNum;
      }
      return a.code.localeCompare(b.code);
    });
  };

  const uncategorizedCodes = getCodesForCategory(null);

  const expandAll = () => {
    const allCategoryIds = filteredCategories.map(cat => cat.id);
    setExpandedCategories(new Set(allCategoryIds));
  };

  const collapseAll = () => {
    setExpandedCategories(new Set());
  };

  const allExpanded = filteredCategories.length > 0 &&
                      filteredCategories.every(cat => expandedCategories.has(cat.id));

  const toggleCodeSelection = (codeId: string) => {
    setSelectedCodeIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(codeId)) {
        newSet.delete(codeId);
      } else {
        newSet.add(codeId);
      }
      return newSet;
    });
  };

  const toggleAllVisibleCodes = () => {
    const visibleCodeIds = new Set<string>();
    filteredCategories.forEach(category => {
      getCodesForCategory(category.id).forEach(code => visibleCodeIds.add(code.id));
    });
    uncategorizedCodes.forEach(code => visibleCodeIds.add(code.id));

    if (Array.from(visibleCodeIds).every(id => selectedCodeIds.has(id))) {
      setSelectedCodeIds(new Set());
    } else {
      setSelectedCodeIds(visibleCodeIds);
    }
  };

  const clearSelection = () => {
    setSelectedCodeIds(new Set());
  };

  const selectedCodes = codes.filter(code => selectedCodeIds.has(code.id));

  const allVisibleCodeIds = new Set<string>();
  filteredCategories.forEach(category => {
    getCodesForCategory(category.id).forEach(code => allVisibleCodeIds.add(code.id));
  });
  uncategorizedCodes.forEach(code => allVisibleCodeIds.add(code.id));

  const allVisibleSelected = allVisibleCodeIds.size > 0 &&
    Array.from(allVisibleCodeIds).every(id => selectedCodeIds.has(id));
  const someVisibleSelected = Array.from(allVisibleCodeIds).some(id => selectedCodeIds.has(id)) && !allVisibleSelected;

  const isLoading = categoriesLoading || codesLoading;

  // Build columns once for all DataTables on this page (one per category + uncategorized).
  const columns = useMemo<ColumnDef<CostCodeRow, unknown>[]>(() => {
    return [
      {
        id: "select",
        header: () => (
          <Checkbox
            checked={someVisibleSelected ? "indeterminate" : allVisibleSelected}
            onCheckedChange={toggleAllVisibleCodes}
            className="h-3.5 w-3.5"
            data-testid="checkbox-select-all-header"
          />
        ),
        cell: ({ row }) => (
          <span onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selectedCodeIds.has(row.original.id)}
              onCheckedChange={() => toggleCodeSelection(row.original.id)}
              className="h-3.5 w-3.5"
              data-testid={`checkbox-code-${row.original.id}`}
            />
          </span>
        ),
        enableSorting: false,
        size: 36,
        meta: { defaultWidth: 36, align: "center", pinned: true, headerLabel: "Select" } satisfies DataTableColumnMeta,
      },
      {
        id: "code",
        header: "Code",
        accessorFn: (c) => c.code,
        cell: ({ row }) => (
          <span className="text-xs font-medium" data-testid={`cell-code-${row.original.id}`}>
            {row.original.code}
          </span>
        ),
        size: 100,
        meta: { defaultWidth: 100, headerLabel: "Code" } satisfies DataTableColumnMeta,
      },
      {
        id: "title",
        header: "Title",
        accessorFn: (c) => c.title,
        cell: ({ row }) => (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs truncate" data-testid={`cell-title-${row.original.id}`}>
              {row.original.title}
            </span>
            {row.original.isArchived && (
              <Badge variant="secondary" className="text-[10px]">Archived</Badge>
            )}
            {row.original.isSynced && (
              <Badge variant="outline" className="text-[10px]">Synced</Badge>
            )}
          </div>
        ),
        size: 280,
        meta: { defaultWidth: 280, headerLabel: "Title" } satisfies DataTableColumnMeta,
      },
      {
        id: "xero",
        header: "Xero",
        accessorFn: (c) => c.xeroTrackingOptionName ?? "",
        cell: ({ row }) =>
          row.original.xeroTrackingOptionName ? (
            <Badge variant="outline" className="text-[10px]" data-testid={`cell-xero-${row.original.id}`}>
              {row.original.xeroTrackingOptionName}
            </Badge>
          ) : (
            <span className="text-muted-foreground/40 text-xs">—</span>
          ),
        size: 140,
        meta: { defaultWidth: 140, headerLabel: "Xero" } satisfies DataTableColumnMeta,
      },
      {
        id: "timesheet",
        header: "Timesheet",
        accessorFn: (c) => (c.availableInTimesheets ? 1 : 0),
        cell: ({ row }) =>
          row.original.availableInTimesheets ? (
            <Badge variant="outline" className="gap-1 text-[10px]" data-testid={`cell-timesheet-${row.original.id}`}>
              <Clock className="h-3 w-3" /> Yes
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1 text-[10px]" data-testid={`cell-timesheet-${row.original.id}`}>
              <Ban className="h-3 w-3" /> No
            </Badge>
          ),
        size: 110,
        meta: { defaultWidth: 110, align: "center", headerLabel: "Timesheet" } satisfies DataTableColumnMeta,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const code = row.original;
          return (
            <span onClick={(e) => e.stopPropagation()} className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    data-testid={`button-actions-${code.id}`}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setSelectedCostCodeForEdit(code);
                      setIsEditCostCodeOpen(true);
                    }}
                    data-testid={`menu-edit-${code.id}`}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      toggleTimesheetMutation.mutate({
                        id: code.id,
                        availableInTimesheets: !code.availableInTimesheets,
                      })
                    }
                    data-testid={`menu-toggle-timesheet-${code.id}`}
                  >
                    {code.availableInTimesheets ? (
                      <>
                        <Ban className="h-4 w-4 mr-2" />
                        Remove from Timesheets
                      </>
                    ) : (
                      <>
                        <Clock className="h-4 w-4 mr-2" />
                        Add to Timesheets
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setSelectedCodeForMerge(code);
                      setIsMergeOpen(true);
                    }}
                    disabled={code.isArchived}
                    data-testid={`menu-merge-${code.id}`}
                  >
                    <GitMerge className="h-4 w-4 mr-2" />
                    Merge
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => archiveMutation.mutate(code.id)}
                    disabled={code.isArchived}
                    data-testid={`menu-archive-${code.id}`}
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    Archive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          );
        },
        size: 56,
        meta: { defaultWidth: 56, align: "right", headerLabel: "Actions" } satisfies DataTableColumnMeta,
      },
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCodeIds, allVisibleSelected, someVisibleSelected]);

  const pickerColumns = useMemo(
    () => [
      { id: "select", label: "Select", pinned: true },
      { id: "code", label: "Code" },
      { id: "title", label: "Title" },
      { id: "xero", label: "Xero" },
      { id: "timesheet", label: "Timesheet" },
    ],
    [],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Row 1 - Title & Actions (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-3 gap-4 flex-shrink-0 border-b border-border">
        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="breadcrumbs">
            <span className="text-foreground font-medium">Cost Codes</span>
          </nav>
          <Badge variant="secondary" className="text-xs" data-testid="text-code-count">
            {codes.length} codes
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
            onClick={() => setIsAddCategoryOpen(true)}
            data-testid="button-add-category"
          >
            <Plus className="w-3 h-3" />
            <span>Category</span>
          </button>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
            onClick={() => setIsImportOpen(true)}
            data-testid="button-import-csv"
          >
            <Upload className="w-3 h-3" />
            <span>Import</span>
          </button>
          {xeroConnected && (
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1 text-[#13B5EA] border-[#13B5EA]/30"
              onClick={() => setIsBulkXeroMappingOpen(true)}
            >
              <span>Map to Xero</span>
            </button>
          )}
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#A890D4] text-white border-[#A890D4]/20 hover:bg-[#A890D4]/90 active-elevate-2 flex items-center gap-1"
            onClick={() => setIsAddCostCodeOpen(true)}
            data-testid="button-add-code"
          >
            <Plus className="w-3 h-3" />
            <span>New Code</span>
          </button>
        </div>
      </div>

      {/* Row 2 - Search & Filters */}
      <div className="h-9 bg-background flex items-center justify-between px-3 gap-1.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5 flex-1">
          <button
            className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
            onClick={allExpanded ? collapseAll : expandAll}
            data-testid="button-toggle-all"
            title={allExpanded ? "Collapse all" : "Expand all"}
          >
            {allExpanded ? (
              <Minimize2 className="w-3 h-3" />
            ) : (
              <Maximize2 className="w-3 h-3" />
            )}
          </button>

          <div className="w-px h-4 bg-border" />

          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="input-search-cost-codes"
            />
          </div>

          <div className="w-px h-4 bg-border" />

          <button
            className={`h-6 w-auto px-2 text-xs border rounded-md flex items-center gap-1 transition-all ${
              showArchived
                ? "bg-[#A890D4]/10 text-[#A890D4] border-[#A890D4]/30 font-medium"
                : "bg-background border hover-elevate"
            }`}
            onClick={() => setShowArchived(!showArchived)}
            data-testid="checkbox-show-archived"
          >
            <Archive className="w-3 h-3" />
            <span>Archived</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
            <PopoverTrigger asChild>
              <button
                className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                data-testid="button-column-picker"
              >
                <Columns3 className="w-3 h-3" />
                <span>Columns</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="p-0">
              <DataTableColumnPicker storageKey={TABLE_STORAGE_KEY} columns={pickerColumns} />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Bulk Actions Toolbar */}
      {selectedCodeIds.size > 0 && (
        <div className="h-9 bg-[#A890D4]/5 dark:bg-[#A890D4]/10 flex items-center justify-between px-3 gap-1.5 border-b border-[#A890D4]/20 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={someVisibleSelected ? "indeterminate" : allVisibleSelected}
              onCheckedChange={toggleAllVisibleCodes}
              className="h-4 w-4"
              data-testid="checkbox-select-all"
            />
            <span className="text-xs font-medium">
              {selectedCodeIds.size} {selectedCodeIds.size === 1 ? 'item' : 'items'} selected
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1" data-testid="button-bulk-timesheets">
                  <Clock className="w-3 h-3" />
                  <span>Timesheets</span>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  onClick={() => bulkToggleTimesheetMutation.mutate({
                    codeIds: Array.from(selectedCodeIds),
                    availableInTimesheets: true
                  })}
                  data-testid="menu-bulk-add-timesheets"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Add to Timesheets
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => bulkToggleTimesheetMutation.mutate({
                    codeIds: Array.from(selectedCodeIds),
                    availableInTimesheets: false
                  })}
                  data-testid="menu-bulk-remove-timesheets"
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Remove from Timesheets
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Select
              onValueChange={(value) => {
                const categoryId = value === "__none__" ? null : value;
                bulkMoveCategoryMutation.mutate({
                  codeIds: Array.from(selectedCodeIds),
                  categoryId
                });
              }}
            >
              <SelectTrigger className="h-6 w-[140px] text-xs" data-testid="select-bulk-move-category">
                <FolderInput className="w-3 h-3 mr-1" />
                <SelectValue placeholder="Move to..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Uncategorized</SelectItem>
                {categories.filter(cat => cat.isActive).map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.code} - {cat.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <button
              className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1 disabled:opacity-50"
              onClick={() => bulkArchiveMutation.mutate(Array.from(selectedCodeIds))}
              disabled={selectedCodes.some(code => code.isArchived)}
              data-testid="button-bulk-archive"
            >
              <Archive className="w-3 h-3" />
              <span>Archive</span>
            </button>

            <button
              className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              onClick={clearSelection}
              data-testid="button-clear-selection"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Cost Categories and Codes List */}
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {isLoading ? (
          <Card>
            <CardContent className="p-4 text-center text-muted-foreground text-sm">
              Loading cost codes...
            </CardContent>
          </Card>
        ) : (
          <>
            {filteredCategories.map((category) => {
              const categoryCodes = getCodesForCategory(category.id);
              const isExpanded = expandedCategories.has(category.id);

              return (
                <Card key={category.id} data-testid={`card-category-${category.id}`}>
                  <CardHeader className="p-4 hover-elevate cursor-pointer" onClick={() => toggleCategory(category.id)}>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        data-testid={`button-toggle-category-${category.id}`}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{category.code}</span>
                          <span className="text-muted-foreground">-</span>
                          <span>{category.title}</span>
                          {!category.isActive && (
                            <Badge variant="secondary" className="ml-2">
                              Archived
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{categoryCodes.length} codes</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              data-testid={`button-category-actions-${category.id}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedCategoryForEdit(category);
                                setIsEditCategoryOpen(true);
                              }}
                              data-testid={`menu-edit-category-${category.id}`}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedCategoryForMerge(category);
                                setIsMergeCategoryOpen(true);
                              }}
                              disabled={!category.isActive}
                              data-testid={`menu-merge-category-${category.id}`}
                            >
                              <GitMerge className="h-4 w-4 mr-2" />
                              Merge
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => archiveCategoryMutation.mutate(category.id)}
                              disabled={!category.isActive}
                              data-testid={`menu-archive-category-${category.id}`}
                            >
                              <Archive className="h-4 w-4 mr-2" />
                              Archive
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                  {isExpanded && categoryCodes.length > 0 && (
                    <CardContent className="p-0 pt-0 pb-2">
                      <div className="px-2" style={{ height: Math.min(categoryCodes.length, 12) * 36 + 32 }}>
                        <DataTable
                          data={categoryCodes}
                          columns={columns}
                          storageKey={TABLE_STORAGE_KEY}
                          legacyConfigKey={LEGACY_STORAGE_KEY}
                          rowKey={(c) => c.id}
                          rowClassName={(c) => selectedCodeIds.has(c.id) ? "bg-[#A890D4]/8 dark:bg-[#A890D4]/10" : ""}
                        />
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}

            {/* Uncategorized Codes */}
            {uncategorizedCodes.length > 0 && (
              <Card data-testid="card-uncategorized">
                <CardHeader className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-6" />
                    <div className="flex-1">
                      <span className="font-semibold">Uncategorized Cost Codes</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{uncategorizedCodes.length} codes</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0 pt-0 pb-2">
                  <div className="px-2" style={{ height: Math.min(uncategorizedCodes.length, 12) * 36 + 32 }}>
                    <DataTable
                      data={uncategorizedCodes}
                      columns={columns}
                      storageKey={TABLE_STORAGE_KEY}
                      legacyConfigKey={LEGACY_STORAGE_KEY}
                      rowKey={(c) => c.id}
                      rowClassName={(c) => selectedCodeIds.has(c.id) ? "bg-[#A890D4]/8 dark:bg-[#A890D4]/10" : ""}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {filteredCategories.length === 0 && uncategorizedCodes.length === 0 && (
              <Card>
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">
                    {searchTerm
                      ? "No cost codes match your search."
                      : "No cost codes yet. Click 'Add Category' or 'Add Cost Code' to get started."}
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <AddCategoryDialog open={isAddCategoryOpen} onOpenChange={setIsAddCategoryOpen} />
      <AddCostCodeDialog open={isAddCostCodeOpen} onOpenChange={setIsAddCostCodeOpen} />
      <ImportCostCodesDialog open={isImportOpen} onOpenChange={setIsImportOpen} />
      <MergeCostCodeDialog
        open={isMergeOpen}
        onOpenChange={setIsMergeOpen}
        costCode={selectedCodeForMerge}
      />
      <EditCategoryDialog
        open={isEditCategoryOpen}
        onOpenChange={setIsEditCategoryOpen}
        category={selectedCategoryForEdit}
      />
      <MergeCategoryDialog
        open={isMergeCategoryOpen}
        onOpenChange={setIsMergeCategoryOpen}
        category={selectedCategoryForMerge}
      />
      <EditCostCodeDialog
        open={isEditCostCodeOpen}
        onOpenChange={setIsEditCostCodeOpen}
        costCode={selectedCostCodeForEdit}
      />
      <BulkXeroMappingDialog
        open={isBulkXeroMappingOpen}
        onOpenChange={setIsBulkXeroMappingOpen}
      />
    </div>
  );
}
