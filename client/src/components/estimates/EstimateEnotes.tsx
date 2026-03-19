import { useState, useCallback, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, MinusCircle, Plus, Trash2, StickyNote } from "lucide-react";

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
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const newCatInputRef = useRef<HTMLInputElement>(null);
  const newItemInputRef = useRef<HTMLInputElement>(null);

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

  const createMutation = useMutation({
    mutationFn: (data: Partial<EnoteRow>) =>
      apiRequest(`/api/estimates/${estimateId}/enotes`, "POST", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "enotes"] }),
    onError: () => toast({ title: "Failed to add", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/estimates/${estimateId}/enotes/${id}`, "DELETE"),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/estimates", estimateId, "enotes"] });
      const prev = queryClient.getQueryData<EnoteRow[]>(["/api/estimates", estimateId, "enotes"]);
      queryClient.setQueryData<EnoteRow[]>(["/api/estimates", estimateId, "enotes"], old =>
        old?.filter(r => r.id !== id) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(["/api/estimates", estimateId, "enotes"], ctx?.prev);
      toast({ title: "Delete failed", variant: "destructive" });
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

  // Derive categories list (what was previously called "groups")
  const categoryNames = useMemo(() => [...new Set(enotes.map(r => r.groupName))], [enotes]);

  // Auto-select first category when data loads
  const effectiveCategory = selectedCategory || categoryNames[0] || "";

  // Items for the selected category (what was previously called "categoryName" rows)
  const categoryItems = useMemo(() => enotes.filter(r => r.groupName === effectiveCategory), [enotes, effectiveCategory]);

  // Add a new category (creates one placeholder item row with empty categoryName)
  const addCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    if (categoryNames.includes(trimmed)) {
      setSelectedCategory(trimmed);
      setNewCategoryName("");
      return;
    }
    createMutation.mutate({ groupName: trimmed, categoryName: "" }, {
      onSuccess: () => {
        setSelectedCategory(trimmed);
        setNewCategoryName("");
      },
    });
  };

  // Add a new item within the selected category
  const addItem = () => {
    const trimmed = newItemName.trim();
    if (!trimmed || !effectiveCategory) return;
    createMutation.mutate({ groupName: effectiveCategory, categoryName: trimmed }, {
      onSuccess: () => setNewItemName(""),
    });
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
      {/* Split panel body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* LEFT: Categories panel */}
        <div className="w-52 flex-shrink-0 border-r border-border flex flex-col bg-muted/20">
          <div className="px-3 py-2 border-b border-border/50 flex-shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Categories</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {categoryNames.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground italic">No categories yet</div>
            ) : categoryNames.map(cat => {
              const catAll = enotes.filter(r => r.groupName === cat);
              const done = catAll.filter(r => r.completed).length;
              const reqCount = catAll.filter(r => r.required === true).length;
              const isSelected = effectiveCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`w-full text-left px-3 py-2 flex flex-col gap-0.5 border-b border-border/20 transition-colors hover-elevate ${
                    isSelected ? 'bg-[#bba7db]/15 text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="text-xs font-medium truncate w-full">{cat}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">{done}/{catAll.length} done</span>
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

          {/* Add category input */}
          <div className="p-2 border-t border-border/50 flex-shrink-0 flex gap-1">
            <Input
              ref={newCatInputRef}
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCategory(); }}
              placeholder="New category…"
              className="h-7 text-xs"
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 flex-shrink-0"
              onClick={addCategory}
              disabled={!newCategoryName.trim() || createMutation.isPending}
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* RIGHT: Items for selected category */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {!effectiveCategory ? (
            <div className="flex-1 flex items-center justify-center flex-col gap-2 text-muted-foreground">
              <StickyNote className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-xs">Add a category on the left to get started</p>
            </div>
          ) : (
            <>
              {/* Column header */}
              <div className="flex-shrink-0 bg-muted/50 border-b border-border/50 text-[10px] font-medium text-muted-foreground uppercase tracking-wide select-none">
                <div className="grid items-center px-3 py-1.5" style={{ gridTemplateColumns: '1fr 56px 1fr 44px 44px 96px 44px 1fr 56px 36px' }}>
                  <span>Item</span>
                  <span className="text-center">Req?</span>
                  <span className="pl-2">Brainstorm Notes</span>
                  <span className="text-center">RFI</span>
                  <span className="text-center">RFQ</span>
                  <span className="pl-1">RFQ Date</span>
                  <span className="text-center">Labour</span>
                  <span className="pl-2">Estimator Notes</span>
                  <span className="text-center">Done</span>
                  <span />
                </div>
              </div>

              {/* Scrollable rows */}
              <div className="flex-1 overflow-auto min-h-0">
                {categoryItems.length === 0 ? (
                  <div className="flex items-center justify-center h-24 text-xs text-muted-foreground italic">
                    No items in this category yet
                  </div>
                ) : categoryItems.map(row => (
                  <div
                    key={row.id}
                    className={`grid items-center px-3 border-b border-border/10 transition-colors group/erow ${row.required === false ? 'opacity-40' : ''} ${row.completed ? 'bg-green-500/5' : ''}`}
                    style={{ gridTemplateColumns: '1fr 56px 1fr 44px 44px 96px 44px 1fr 56px 36px', minHeight: '34px' }}
                  >
                    {/* Item name */}
                    <span className="text-sm truncate pr-2">{row.categoryName || <span className="italic text-muted-foreground/40 text-xs">Unnamed</span>}</span>

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

                    {/* Delete */}
                    <div className="flex justify-center">
                      <button
                        className="invisible group-hover/erow:visible text-muted-foreground/40 hover:text-destructive transition-colors"
                        onClick={() => deleteMutation.mutate(row.id)}
                        title="Delete item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add item row */}
              <div className="flex-shrink-0 border-t border-border/50 px-3 py-2 flex items-center gap-2">
                <Input
                  ref={newItemInputRef}
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
                  placeholder="Add item to this category…"
                  className="h-7 text-xs flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={addItem}
                  disabled={!newItemName.trim() || createMutation.isPending}
                >
                  <Plus className="w-3 h-3" />
                  Add Item
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
