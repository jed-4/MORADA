import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, CheckCircle2, Circle, MinusCircle } from "lucide-react";

interface EnoteRow {
  id: string;
  estimateId: string;
  groupName: string;
  categoryName: string;
  sortOrder: number;
  required: boolean | null;
  brainstormNotes: string | null;
  rfiRequired: boolean;
  rfqRequired: boolean;
  rfqDate: string | null;
  labourRequired: boolean;
  estimatorNotes: string | null;
  completed: boolean;
}

interface Props {
  estimateId: string;
}

export default function EstimateEnotes({ estimateId }: Props) {
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  const { data: enotes = [], isLoading } = useQuery<EnoteRow[]>({
    queryKey: ["/api/estimates", estimateId, "enotes"],
    queryFn: () => fetch(`/api/estimates/${estimateId}/enotes`, { credentials: "include" }).then(r => r.json()),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EnoteRow> }) =>
      apiRequest(`/api/estimates/${estimateId}/enotes/${id}`, "PATCH", data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/estimates", estimateId, "enotes"] });
      const prev = queryClient.getQueryData<EnoteRow[]>(["/api/estimates", estimateId, "enotes"]);
      queryClient.setQueryData<EnoteRow[]>(["/api/estimates", estimateId, "enotes"], old =>
        old?.map(r => r.id === id ? { ...r, ...data } : r) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(["/api/estimates", estimateId, "enotes"], ctx?.prev);
      toast({ title: "Save failed", variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "enotes"] }),
  });

  const update = useCallback((id: string, data: Partial<EnoteRow>) => {
    updateMutation.mutate({ id, data });
  }, [updateMutation]);

  const startEdit = (id: string, field: string, currentVal: string | null) => {
    setEditingCell({ id, field });
    setEditValue(currentVal ?? "");
  };

  const commitEdit = (row: EnoteRow, field: 'brainstormNotes' | 'estimatorNotes' | 'rfqDate') => {
    if (editingCell?.id === row.id && editingCell?.field === field) {
      const current = row[field] ?? "";
      if (editValue !== current) update(row.id, { [field]: editValue || null });
      setEditingCell(null);
    }
  };

  // Group rows
  const groups = enotes.reduce<Record<string, EnoteRow[]>>((acc, r) => {
    if (!acc[r.groupName]) acc[r.groupName] = [];
    acc[r.groupName].push(r);
    return acc;
  }, {});

  const groupNames = Object.keys(groups);

  const totalCount = enotes.length;
  const completedCount = enotes.filter(r => r.completed).length;
  const requiredCount = enotes.filter(r => r.required === true).length;

  const toggleGroup = (g: string) => setCollapsed(prev => ({ ...prev, [g]: !prev[g] }));

  const cycleRequired = (row: EnoteRow) => {
    const next = row.required === null ? true : row.required === true ? false : null;
    update(row.id, { required: next });
  };

  const RequiredIcon = ({ val }: { val: boolean | null }) => {
    if (val === true) return <CheckCircle2 className="w-4 h-4 text-green-500 cursor-pointer flex-shrink-0" />;
    if (val === false) return <MinusCircle className="w-4 h-4 text-muted-foreground cursor-pointer flex-shrink-0" />;
    return <Circle className="w-4 h-4 text-muted-foreground/40 cursor-pointer flex-shrink-0" />;
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-muted-foreground text-sm">
        Loading E-Notes…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Progress header */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border/50 bg-background flex-shrink-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Reviewed:</span>
          <Badge variant="secondary" className="text-xs">{completedCount} / {totalCount}</Badge>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Required:</span>
          <Badge variant="secondary" className="text-xs text-green-600">{requiredCount}</Badge>
        </div>
        <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-[#bba7db] h-full rounded-full transition-all"
            style={{ width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` : '0%' }}
          />
        </div>
        <button
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            const allCollapsed = groupNames.every(g => collapsed[g]);
            const next: Record<string, boolean> = {};
            groupNames.forEach(g => { next[g] = !allCollapsed; });
            setCollapsed(next);
          }}
        >
          {groupNames.every(g => collapsed[g]) ? 'Expand all' : 'Collapse all'}
        </button>
      </div>

      {/* Column header */}
      <div className="flex-shrink-0 bg-muted/50 border-b border-border/50 text-[10px] font-medium text-muted-foreground uppercase tracking-wide select-none">
        <div className="grid items-center px-3 py-1" style={{ gridTemplateColumns: '200px 60px 1fr 46px 46px 100px 46px 1fr 60px' }}>
          <span>Category</span>
          <span className="text-center">Required?</span>
          <span className="pl-2">Brainstorm Notes</span>
          <span className="text-center">RFI</span>
          <span className="text-center">RFQ</span>
          <span className="pl-1">RFQ Date</span>
          <span className="text-center">Labour</span>
          <span className="pl-2">Estimator Notes</span>
          <span className="text-center">Done</span>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-auto min-h-0">
        {groupNames.map(groupName => {
          const rows = groups[groupName];
          const isCollapsed = collapsed[groupName];
          const doneInGroup = rows.filter(r => r.completed).length;

          return (
            <div key={groupName} className="border-b border-border/30">
              {/* Group header */}
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted/30 hover-elevate text-left"
                onClick={() => toggleGroup(groupName)}
              >
                {isCollapsed
                  ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                <span className="text-sm font-medium">{groupName}</span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-1">{doneInGroup}/{rows.length}</Badge>
              </button>

              {/* Rows */}
              {!isCollapsed && rows.map(row => (
                <div
                  key={row.id}
                  className={`grid items-center px-3 border-b border-border/10 transition-colors ${row.required === false ? 'opacity-40' : ''} ${row.completed ? 'bg-green-500/5' : ''}`}
                  style={{ gridTemplateColumns: '200px 60px 1fr 46px 46px 100px 46px 1fr 60px', minHeight: '34px' }}
                >
                  {/* Category name */}
                  <span className="text-sm truncate pr-2">{row.categoryName}</span>

                  {/* Required toggle */}
                  <div className="flex justify-center" onClick={() => cycleRequired(row)}>
                    <RequiredIcon val={row.required} />
                  </div>

                  {/* Brainstorm Notes */}
                  <div className="pl-2 py-0.5">
                    {editingCell?.id === row.id && editingCell.field === 'brainstormNotes' ? (
                      <Input
                        autoFocus
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={() => commitEdit(row, 'brainstormNotes')}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') commitEdit(row, 'brainstormNotes'); }}
                        className="h-6 text-xs focus-visible:ring-0 border-primary"
                      />
                    ) : (
                      <span
                        className="text-xs text-muted-foreground cursor-pointer hover:text-foreground line-clamp-1 min-h-[20px] flex items-center"
                        onClick={() => startEdit(row.id, 'brainstormNotes', row.brainstormNotes)}
                      >
                        {row.brainstormNotes || <span className="opacity-30 italic">Add notes…</span>}
                      </span>
                    )}
                  </div>

                  {/* RFI */}
                  <div className="flex justify-center">
                    <Checkbox
                      checked={row.rfiRequired}
                      onCheckedChange={v => update(row.id, { rfiRequired: !!v })}
                    />
                  </div>

                  {/* RFQ */}
                  <div className="flex justify-center">
                    <Checkbox
                      checked={row.rfqRequired}
                      onCheckedChange={v => update(row.id, { rfqRequired: !!v })}
                    />
                  </div>

                  {/* RFQ Date */}
                  <div className="pl-1">
                    {editingCell?.id === row.id && editingCell.field === 'rfqDate' ? (
                      <Input
                        autoFocus
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={() => commitEdit(row, 'rfqDate')}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') commitEdit(row, 'rfqDate'); }}
                        className="h-6 text-xs focus-visible:ring-0 border-primary"
                        placeholder="dd/mm/yy"
                      />
                    ) : (
                      <span
                        className="text-xs text-muted-foreground cursor-pointer hover:text-foreground"
                        onClick={() => startEdit(row.id, 'rfqDate', row.rfqDate)}
                      >
                        {row.rfqDate || <span className="opacity-30">—</span>}
                      </span>
                    )}
                  </div>

                  {/* Labour */}
                  <div className="flex justify-center">
                    <Checkbox
                      checked={row.labourRequired}
                      onCheckedChange={v => update(row.id, { labourRequired: !!v })}
                    />
                  </div>

                  {/* Estimator Notes */}
                  <div className="pl-2 py-0.5">
                    {editingCell?.id === row.id && editingCell.field === 'estimatorNotes' ? (
                      <Input
                        autoFocus
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={() => commitEdit(row, 'estimatorNotes')}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') commitEdit(row, 'estimatorNotes'); }}
                        className="h-6 text-xs focus-visible:ring-0 border-primary"
                      />
                    ) : (
                      <span
                        className="text-xs text-muted-foreground cursor-pointer hover:text-foreground line-clamp-1 min-h-[20px] flex items-center"
                        onClick={() => startEdit(row.id, 'estimatorNotes', row.estimatorNotes)}
                      >
                        {row.estimatorNotes || <span className="opacity-30 italic">Add notes…</span>}
                      </span>
                    )}
                  </div>

                  {/* Completed */}
                  <div className="flex justify-center">
                    <Checkbox
                      checked={row.completed}
                      onCheckedChange={v => update(row.id, { completed: !!v })}
                    />
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
