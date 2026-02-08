import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, FileText, HardHat } from "lucide-react";

interface SubcontractorPODialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubcontractorPODialog({ open, onOpenChange }: SubcontractorPODialogProps) {
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedProject, setSelectedProject] = useState<string>("");

  const { data: awaitingTimesheets = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/timesheets/subcontractor/awaiting-po"],
    enabled: open,
  });

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const { data: costCodes = [] } = useQuery<any[]>({
    queryKey: ["/api/cost-codes"],
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { timesheetIds: string[]; projectId: string }) => {
      return await apiRequest("/api/purchase-orders/generate-from-timesheets", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets/subcontractor/awaiting-po"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setSelectedIds(new Set());
      setSelectedProject("");
      onOpenChange(false);
      toast({ title: "Purchase order created from subcontractor timesheets" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to generate purchase order",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const ts of awaitingTimesheets) {
      const key = ts.userId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ts);
    }
    return map;
  }, [awaitingTimesheets]);

  const getUserName = (userId: string) => {
    const user = users.find((u: any) => u.id === userId);
    if (user?.firstName && user?.lastName) return `${user.firstName} ${user.lastName}`;
    if (user?.firstName) return user.firstName;
    return user?.email || "Unknown";
  };

  const getProjectName = (projectId: string) => {
    const project = projects.find((p: any) => p.id === projectId);
    return project?.name || "Unknown";
  };

  const getCostCodeName = (costCodeId: string | null) => {
    if (!costCodeId) return "-";
    const cc = costCodes.find((c: any) => c.id === costCodeId);
    return cc ? `${cc.code} - ${cc.name}` : "-";
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === awaitingTimesheets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(awaitingTimesheets.map((t: any) => t.id)));
    }
  };

  const selectedTimesheets = awaitingTimesheets.filter((t: any) => selectedIds.has(t.id));
  const totalHours = selectedTimesheets.reduce((sum: number, t: any) => sum + parseFloat(t.duration || "0"), 0);

  const selectedUserIds = [...new Set(selectedTimesheets.map((t: any) => t.userId))];
  const hasMultipleUsers = selectedUserIds.length > 1;

  const projectsInSelected = [...new Set(selectedTimesheets.map((t: any) => t.projectId))];

  const handleGenerate = () => {
    if (selectedIds.size === 0) return;
    if (hasMultipleUsers) {
      toast({
        title: "Select timesheets from one subcontractor",
        description: "A PO can only be generated for one subcontractor at a time.",
        variant: "destructive",
      });
      return;
    }

    const projectId = selectedProject || (projectsInSelected.length === 1 ? projectsInSelected[0] : "");
    if (!projectId) {
      toast({
        title: "Select a project",
        description: "Please select which project to create the PO under.",
        variant: "destructive",
      });
      return;
    }

    generateMutation.mutate({
      timesheetIds: [...selectedIds],
      projectId,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardHat className="h-5 w-5" />
            Generate Subcontractor PO
          </DialogTitle>
          <DialogDescription>
            Select approved subcontractor timesheets to generate a purchase order.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : awaitingTimesheets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mb-3" />
              <p className="text-sm font-medium">No timesheets awaiting PO</p>
              <p className="text-xs mt-1">Approve subcontractor timesheets first to generate purchase orders.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {[...grouped.entries()].map(([userId, timesheets]) => (
                <div key={userId} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <HardHat className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-sm font-medium">{getUserName(userId)}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {timesheets.length} {timesheets.length === 1 ? "entry" : "entries"}
                    </Badge>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8 px-2">
                          <Checkbox
                            checked={timesheets.every((t: any) => selectedIds.has(t.id))}
                            onCheckedChange={() => {
                              const allSelected = timesheets.every((t: any) => selectedIds.has(t.id));
                              const next = new Set(selectedIds);
                              for (const t of timesheets) {
                                if (allSelected) next.delete(t.id);
                                else next.add(t.id);
                              }
                              setSelectedIds(next);
                            }}
                            className="h-3.5 w-3.5"
                          />
                        </TableHead>
                        <TableHead className="text-[10px] px-2">Date</TableHead>
                        <TableHead className="text-[10px] px-2">Project</TableHead>
                        <TableHead className="text-[10px] px-2">Cost Code</TableHead>
                        <TableHead className="text-[10px] px-2">Time</TableHead>
                        <TableHead className="text-[10px] px-2">Hours</TableHead>
                        <TableHead className="text-[10px] px-2">Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {timesheets.map((ts: any) => (
                        <TableRow key={ts.id} className={selectedIds.has(ts.id) ? "bg-accent/30" : ""}>
                          <TableCell className="px-2 py-1">
                            <Checkbox
                              checked={selectedIds.has(ts.id)}
                              onCheckedChange={() => toggleSelect(ts.id)}
                              className="h-3.5 w-3.5"
                            />
                          </TableCell>
                          <TableCell className="text-[11px] px-2 py-1">
                            {ts.date ? new Date(ts.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "-"}
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground px-2 py-1 truncate max-w-[120px]">
                            {getProjectName(ts.projectId)}
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground px-2 py-1 truncate max-w-[120px]">
                            {getCostCodeName(ts.costCodeId)}
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground tabular-nums px-2 py-1">
                            {ts.startTime || "?"} - {ts.endTime || "?"}
                          </TableCell>
                          <TableCell className="text-[11px] font-medium tabular-nums px-2 py-1">
                            {parseFloat(ts.duration || "0").toFixed(2)}
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground px-2 py-1 truncate max-w-[150px]">
                            {ts.description || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedIds.size > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {selectedIds.size} timesheet{selectedIds.size > 1 ? "s" : ""} selected
                  {hasMultipleUsers && (
                    <span className="text-destructive ml-2">(multiple subcontractors - select one)</span>
                  )}
                </span>
                <span className="font-medium tabular-nums">{totalHours.toFixed(2)} total hours</span>
              </div>

              {projectsInSelected.length > 1 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Timesheets span multiple projects. Select which project to create the PO under:
                  </label>
                  <Select value={selectedProject} onValueChange={setSelectedProject}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projectsInSelected.map((pid) => (
                        <SelectItem key={pid} value={pid}>
                          {getProjectName(pid)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={selectedIds.size === 0 || hasMultipleUsers || generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            Generate PO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
