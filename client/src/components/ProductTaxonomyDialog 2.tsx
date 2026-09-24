/**
 * Manage the Product Library's groups and tags.
 *
 * The pickers on the library and the product page CONSUME groups and tags; this
 * is where they come from. Without it the whole feature is unreachable — you can
 * file a product into a group only once a group exists.
 *
 * Groups are a tree, so the list is rendered by depth with an indent and a
 * parent picker. Tags are flat and named, and a tag is also the "set" that
 * `Add all N` reads in the selection-template picker.
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2, FolderTree, Tag as TagIcon, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface ProductGroup {
  id: string; parentId: string | null; name: string; colour: string | null; sortOrder: number;
}
export interface ProductTag {
  id: string; name: string; colour: string | null; description: string | null; sortOrder: number;
}

const NONE = "__none__";

/** Depth-first, so children sit under their parent with an indent. */
function orderTree(groups: ProductGroup[]): Array<ProductGroup & { depth: number }> {
  const byParent = new Map<string | null, ProductGroup[]>();
  for (const g of groups) {
    const k = g.parentId ?? null;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(g);
  }
  for (const list of Array.from(byParent.values())) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }
  const out: Array<ProductGroup & { depth: number }> = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const g of byParent.get(parentId) ?? []) {
      out.push({ ...g, depth });
      walk(g.id, depth + 1);
    }
  };
  walk(null, 0);
  // Anything whose parent is missing would otherwise disappear from the tree.
  const seen = new Set(out.map((g) => g.id));
  for (const g of groups) if (!seen.has(g.id)) out.push({ ...g, depth: 0 });
  return out;
}

export function ProductTaxonomyDialog({
  open, onOpenChange, initialTab = "groups",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialTab?: "groups" | "tags";
}) {
  const { toast } = useToast();
  const { data: groups = [] } = useQuery<ProductGroup[]>({ queryKey: ["/api/product-groups"], enabled: open });
  const { data: tags = [] } = useQuery<ProductTag[]>({ queryKey: ["/api/product-tags"], enabled: open });

  const [newGroup, setNewGroup] = useState("");
  const [newGroupParent, setNewGroupParent] = useState(NONE);
  const [newTag, setNewTag] = useState("");
  const [editing, setEditing] = useState<{ kind: "group" | "tag"; id: string; name: string } | null>(null);

  const refresh = (keys: string[]) => keys.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  const fail = (what: string) => (e: any) =>
    toast({ title: `Could not ${what}`, description: e?.message, variant: "destructive" });

  const createGroup = useMutation({
    mutationFn: () => apiRequest("/api/product-groups", "POST", {
      name: newGroup.trim(),
      parentId: newGroupParent === NONE ? null : newGroupParent,
    }),
    onSuccess: () => {
      refresh(["/api/product-groups", "/api/products"]);
      setNewGroup("");
      toast({ title: "Group added" });
    },
    onError: fail("add that group"),
  });

  const createTag = useMutation({
    mutationFn: () => apiRequest("/api/product-tags", "POST", { name: newTag.trim() }),
    onSuccess: () => {
      refresh(["/api/product-tags", "/api/products"]);
      setNewTag("");
      toast({ title: "Tag added" });
    },
    onError: fail("add that tag"),
  });

  const rename = useMutation({
    mutationFn: ({ kind, id, name }: { kind: "group" | "tag"; id: string; name: string }) =>
      apiRequest(`/api/product-${kind}s/${id}`, "PATCH", { name: name.trim() }),
    onSuccess: () => {
      refresh(["/api/product-groups", "/api/product-tags", "/api/products"]);
      setEditing(null);
    },
    onError: fail("rename that"),
  });

  const remove = useMutation({
    mutationFn: ({ kind, id }: { kind: "group" | "tag"; id: string }) =>
      apiRequest(`/api/product-${kind}s/${id}`, "DELETE"),
    onSuccess: () => {
      refresh(["/api/product-groups", "/api/product-tags", "/api/products"]);
      toast({ title: "Deleted" });
    },
    onError: fail("delete that"),
  });

  const tree = orderTree(groups);

  const renameRow = (kind: "group" | "tag", id: string, name: string) => (
    editing?.kind === kind && editing.id === id ? (
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <Input
          value={editing.name}
          autoFocus
          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && editing.name.trim()) rename.mutate(editing);
            if (e.key === "Escape") setEditing(null);
          }}
          className="h-6 text-xs"
          data-testid={`input-rename-${kind}-${id}`}
        />
        <button
          onClick={() => editing.name.trim() && rename.mutate(editing)}
          className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 text-muted-foreground hover-elevate"
          aria-label="Save name"
        >
          <Check className="h-3 w-3" />
        </button>
        <button
          onClick={() => setEditing(null)}
          className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 text-muted-foreground hover-elevate"
          aria-label="Cancel"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    ) : (
      <button
        onClick={() => setEditing({ kind, id, name })}
        className="text-xs text-left flex-1 min-w-0 truncate hover:underline"
        title="Rename"
        data-testid={`button-rename-${kind}-${id}`}
      >
        {name}
      </button>
    )
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Groups &amp; tags</DialogTitle>
          <DialogDescription>
            A group is where a product lives — one each, and they nest. A tag is what it
            belongs to — as many as you like, and a tag can be added to a selection all at once.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={initialTab} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="flex-shrink-0">
            <TabsTrigger value="groups" className="text-xs gap-1.5" data-testid="tab-groups">
              <FolderTree className="h-3 w-3" /> Groups
            </TabsTrigger>
            <TabsTrigger value="tags" className="text-xs gap-1.5" data-testid="tab-tags">
              <TagIcon className="h-3 w-3" /> Tags
            </TabsTrigger>
          </TabsList>

          {/* ── Groups ─────────────────────────────────────────────────────── */}
          <TabsContent value="groups" className="flex-1 min-h-0 flex flex-col gap-2 mt-2">
            <form
              className="flex-shrink-0 space-y-1.5 rounded-md border border-border p-2"
              onSubmit={(e) => { e.preventDefault(); if (newGroup.trim()) createGroup.mutate(); }}
            >
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                New group
              </Label>
              <div className="flex items-center gap-1.5">
                <Input
                  placeholder="e.g. Roofing"
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                  className="h-7 text-xs"
                  data-testid="input-new-group"
                />
                <Select value={newGroupParent} onValueChange={setNewGroupParent}>
                  <SelectTrigger className="h-7 text-xs w-36 flex-shrink-0" data-testid="select-new-group-parent">
                    <SelectValue placeholder="Top level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE} className="text-xs">Top level</SelectItem>
                    {tree.map((g) => (
                      <SelectItem key={g.id} value={g.id} className="text-xs">
                        {" ".repeat(g.depth * 2)}{g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="submit"
                  size="sm"
                  className="h-7 px-2 text-xs flex-shrink-0"
                  disabled={!newGroup.trim() || createGroup.isPending}
                  data-testid="button-add-group"
                >
                  {createGroup.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                </Button>
              </div>
            </form>

            <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0">
              {tree.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  No groups yet. "Roofing", then "Gutter" under it.
                </p>
              ) : tree.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center gap-2 py-1.5 px-2 rounded-md hover-elevate group/row"
                  style={{ paddingLeft: 8 + g.depth * 16 }}
                  data-testid={`row-group-${g.id}`}
                >
                  <FolderTree className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  {renameRow("group", g.id, g.name)}
                  <button
                    onClick={() => {
                      if (window.confirm(
                        `Delete "${g.name}"? Any product filed here becomes Unfiled, and groups inside it are deleted too.`,
                      )) remove.mutate({ kind: "group", id: g.id });
                    }}
                    className="h-6 w-6 flex items-center justify-center rounded-md text-destructive opacity-0 group-hover/row:opacity-100 hover-elevate flex-shrink-0"
                    aria-label={`Delete ${g.name}`}
                    data-testid={`button-delete-group-${g.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── Tags ───────────────────────────────────────────────────────── */}
          <TabsContent value="tags" className="flex-1 min-h-0 flex flex-col gap-2 mt-2">
            <form
              className="flex-shrink-0 space-y-1.5 rounded-md border border-border p-2"
              onSubmit={(e) => { e.preventDefault(); if (newTag.trim()) createTag.mutate(); }}
            >
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                New tag
              </Label>
              <div className="flex items-center gap-1.5">
                <Input
                  placeholder="e.g. Colorbond standard"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  className="h-7 text-xs"
                  data-testid="input-new-tag"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-7 px-2 text-xs flex-shrink-0"
                  disabled={!newTag.trim() || createTag.isPending}
                  data-testid="button-add-tag"
                >
                  {createTag.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Tag every Colorbond colour once, and any selection can take the whole set in one go.
              </p>
            </form>

            <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0">
              {tags.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No tags yet.</p>
              ) : tags.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 py-1.5 px-2 rounded-md hover-elevate group/row"
                  data-testid={`row-tag-${t.id}`}
                >
                  <TagIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  {renameRow("tag", t.id, t.name)}
                  <button
                    onClick={() => {
                      if (window.confirm(
                        `Delete "${t.name}"? It comes off every product that has it. The products themselves are untouched.`,
                      )) remove.mutate({ kind: "tag", id: t.id });
                    }}
                    className="h-6 w-6 flex items-center justify-center rounded-md text-destructive opacity-0 group-hover/row:opacity-100 hover-elevate flex-shrink-0"
                    aria-label={`Delete ${t.name}`}
                    data-testid={`button-delete-tag-${t.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
