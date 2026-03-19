import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, MinusCircle, StickyNote } from "lucide-react";

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
  const [selectedGroup, setSelectedGroup] = useState<string>("");
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

  const cycleRequired = (row: EnoteRow) => {
    const next = row.required === null ? true : row.required === true ? false : null;
    update(row.id, { required: next });
  };

  // Derive groups list
  const groupNames = useMemo(() => [...new Set(enotes.map(r => r.groupName))], [enotes]);

  // Auto-select first group when data loads
  const effectiveGroup = selectedGroup || groupNames[0] || "";

  // Rows for the selected group
  const groupRows = useMemo(() => enotes.filter(r => r.groupName === effectiveGroup), [enotes, effectiveGroup]);

  // Summary stats
  const totalCount = enotes.length;
  const completedCount = enotes.filter(r => r.completed).length;
  const requiredCount = enotes.filter(r => r.required === true).length;

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
      </div>

      {/* Split panel body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* LEFT: Groups panel */}
        <div className="w-52 flex-shrink-0 border-r border-border flex flex-col bg-muted/20">
          <div className="px-3 py-2 border-b border-border/50 flex-shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Groups</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {groupNames.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground italic">No groups</div>
            ) : groupNames.map(group => {
              const groupAll = enotes.filter(r => r.groupName === group);
              const done = groupAll.filter(r => r.completed).length;
              const reqCount = groupAll.filter(r => r.required === true).length;
              const isSelected = effectiveGroup === group;
              return (
                <button
                  key={group}
                  onClick={() => setSelectedGroup(group)}
                  className={`w-full text-left px-3 py-2 flex flex-col gap-0.5 border-b border-border/20 transition-colors hover-elevate ${
                    isSelected ? 'bg-[#bba7db]/15 text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="text-xs font-medium truncate w-full">{group}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">{done}/{groupAll.length} done</span>
                    {reqCount > 0 && (
                      <span className="text-[9px] px-1 rounded font-medium bg-green-500/15 text-green-700 dark:text-green-400">
                        {reqCount} req.
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Rows for selected group */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {!effectiveGroup ? (
            <div className="flex-1 flex items-center justify-center flex-col gap-2 text-muted-foreground">
              <StickyNote className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-xs">No E-Notes for this estimate yet</p>
            </div>
          ) : (
            <>
              {/* Column header */}
              <div className="flex-shrink-0 bg-muted/50 border-b border-border/50 text-[10px] font-medium text-muted-foreground uppercase tracking-wide select-none">
                <div className="grid items-center px-3 py-1.5" style={{ gridTemplateColumns: '1fr 56px 1fr 44px 44px 96px 44px 1fr 56px' }}>
                  <span>Category</span>
                  <span className="text-center">Req?</span>
                  <span className="pl-2">Brainstorm Notes</span>
                  <span className="text-center">RFI</span>
                  <span className="text-center">RFQ</span>
                  <span className="pl-1">RFQ Date</span>
                  <span className="text-center">Labour</span>
                  <span className="pl-2">Estimator Notes</span>
                  <span className="text-center">Done</span>
                </div>
              </div>

              {/* Scrollable rows */}
              <div className="flex-1 overflow-auto min-h-0">
                {groupRows.length === 0 ? (
                  <div className="flex items-center justify-center h-24 text-xs text-muted-foreground italic">
                    No items in this group
                  </div>
                ) : groupRows.map(row => (
                  <div
                    key={row.id}
                    className={`grid items-center px-3 border-b border-border/10 transition-colors group/erow ${row.required === false ? 'opacity-40' : ''} ${row.completed ? 'bg-green-500/5' : ''}`}
                    style={{ gridTemplateColumns: '1fr 56px 1fr 44px 44px 96px 44px 1fr 56px', minHeight: '34px' }}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
