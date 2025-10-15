import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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

export default function CostCodes() {
  const { toast } = useToast();
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
  const [selectedCodeIds, setSelectedCodeIds] = useState<Set<string>>(new Set());

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<CostCategory[]>({
    queryKey: ["/api/cost-categories"],
  });

  const { data: codes = [], isLoading: codesLoading } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const archiveMutation = useMutation({
    mutationFn: (codeId: string) =>
      apiRequest("POST", `/api/cost-codes/${codeId}/archive`),
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
      apiRequest("POST", `/api/cost-categories/${categoryId}/archive`),
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
      apiRequest("PATCH", `/api/cost-codes/${id}`, { availableInTimesheets }),
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

  const getCodesForCategory = (categoryId: string | null) => {
    return codes.filter(code => {
      if (code.categoryId !== categoryId) return false;
      if (!showArchived && code.isArchived) return false;
      if (searchTerm) {
        return code.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
               code.title.toLowerCase().includes(searchTerm.toLowerCase());
      }
      return true;
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

  const isLoading = categoriesLoading || codesLoading;

  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cost Codes</h1>
          <p className="text-muted-foreground mt-1">
            Manage cost categories and codes for estimates, bills, and timesheets
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="default"
            onClick={() => setIsAddCategoryOpen(true)}
            data-testid="button-add-category"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Category
          </Button>
          <Button
            variant="outline"
            size="default"
            onClick={() => setIsAddCostCodeOpen(true)}
            data-testid="button-add-code"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Cost Code
          </Button>
          <Button
            variant="outline"
            size="default"
            onClick={() => setIsImportOpen(true)}
            data-testid="button-import-csv"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={allExpanded ? collapseAll : expandAll}
              data-testid="button-toggle-all"
              title={allExpanded ? "Collapse all" : "Expand all"}
            >
              {allExpanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search categories and cost codes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-cost-codes"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-archived"
                checked={showArchived}
                onCheckedChange={(checked) => setShowArchived(checked as boolean)}
                data-testid="checkbox-show-archived"
              />
              <label
                htmlFor="show-archived"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Show archived
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost Categories and Codes List */}
      <div className="flex-1 overflow-auto space-y-2">
        {isLoading ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Loading cost codes...
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Categories */}
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
                      <div className="space-y-1 px-4">
                        {categoryCodes.map((code) => (
                          <div
                            key={code.id}
                            className="flex items-center gap-3 py-2 px-3 rounded-md hover-elevate border-t border-border"
                            data-testid={`row-cost-code-${code.id}`}
                          >
                            <Checkbox
                              checked={selectedCodeIds.has(code.id)}
                              onCheckedChange={() => toggleCodeSelection(code.id)}
                              data-testid={`checkbox-code-${code.id}`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{code.code}</span>
                                <span className="text-muted-foreground">-</span>
                                <span>{code.title}</span>
                                {code.isArchived && (
                                  <Badge variant="secondary" className="ml-2">
                                    Archived
                                  </Badge>
                                )}
                                {code.isSynced && (
                                  <Badge variant="outline" className="ml-2">
                                    Synced
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {code.availableInTimesheets ? (
                                <Badge variant="outline" className="gap-1">
                                  <Clock className="h-3 w-3" />
                                  Timesheet
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="gap-1">
                                  <Ban className="h-3 w-3" />
                                  No Timesheet
                                </Badge>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    data-testid={`button-actions-${code.id}`}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem disabled data-testid={`menu-edit-${code.id}`}>
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
                            </div>
                          </div>
                        ))}
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
                  <div className="space-y-1 px-4">
                    {uncategorizedCodes.map((code) => (
                      <div
                        key={code.id}
                        className="flex items-center gap-3 py-2 px-3 rounded-md hover-elevate border-t border-border"
                        data-testid={`row-cost-code-${code.id}`}
                      >
                        <Checkbox
                          checked={selectedCodeIds.has(code.id)}
                          onCheckedChange={() => toggleCodeSelection(code.id)}
                          data-testid={`checkbox-code-${code.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{code.code}</span>
                            <span className="text-muted-foreground">-</span>
                            <span>{code.title}</span>
                            {code.isArchived && (
                              <Badge variant="secondary" className="ml-2">
                                Archived
                              </Badge>
                            )}
                            {code.isSynced && (
                              <Badge variant="outline" className="ml-2">
                                Synced
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {code.availableInTimesheets ? (
                            <Badge variant="outline" className="gap-1">
                              <Clock className="h-3 w-3" />
                              Timesheet
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <Ban className="h-3 w-3" />
                              No Timesheet
                            </Badge>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                data-testid={`button-actions-${code.id}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem disabled data-testid={`menu-edit-${code.id}`}>
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
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Empty State */}
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
    </div>
  );
}
