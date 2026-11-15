import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { DocFolder } from "@shared/schema";

/**
 * Who can SEE and who can EDIT a folder's documents — two separate choices
 * (Jed: a carpenter who reads the SOPs must not be able to change them).
 * Admins only. Stored on the folder (migration 0127):
 *   view_role_ids  null = inherit (top level: everyone) · ["*"] = everyone · [ids] = those roles
 *   edit_role_ids  null = inherit (top level: admins only) · [] = admins only · [ids] = those roles
 * Admins can always see and edit everything.
 */

type Mode = "inherit" | "everyone" | "admins" | "roles";
const EVERYONE = "*";

function viewMode(v: string[] | null | undefined): Mode {
  if (!Array.isArray(v)) return "inherit";
  return v.includes(EVERYONE) ? "everyone" : "roles";
}
function editMode(v: string[] | null | undefined): Mode {
  if (!Array.isArray(v)) return "inherit";
  return v.length === 0 ? "admins" : "roles";
}

export function FolderAccessDialog({
  folder,
  parentName,
  onClose,
}: {
  folder: DocFolder;
  /** Set for a sub-folder — it can inherit from its parent. */
  parentName: string | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { data: roles = [] } = useQuery<Array<{ id: string; name: string; userCategory?: string; isActive?: boolean }>>({ queryKey: ["/api/user-roles"] });
  const isSub = !!parentName;

  const initialView = (folder as any).viewRoleIds as string[] | null;
  const initialEdit = (folder as any).editRoleIds as string[] | null;
  // A top-level folder has nothing to inherit: null there IS the default.
  const [vMode, setVMode] = useState<Mode>(() => (isSub ? viewMode(initialView) : viewMode(initialView) === "inherit" ? "everyone" : viewMode(initialView)));
  const [eMode, setEMode] = useState<Mode>(() => (isSub ? editMode(initialEdit) : editMode(initialEdit) === "inherit" ? "admins" : editMode(initialEdit)));
  const [vRoles, setVRoles] = useState<string[]>(Array.isArray(initialView) ? initialView.filter((r) => r !== EVERYONE) : []);
  const [eRoles, setERoles] = useState<string[]>(Array.isArray(initialEdit) ? initialEdit : []);

  const save = useMutation({
    mutationFn: () => {
      const viewRoleIds = vMode === "inherit" ? null : vMode === "everyone" ? (isSub ? [EVERYONE] : null) : vRoles;
      const editRoleIds = eMode === "inherit" ? null : eMode === "admins" ? (isSub ? [] : null) : eRoles;
      return apiRequest(`/api/doc-folders/${folder.id}`, "PATCH", { viewRoleIds, editRoleIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/doc-folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/docs"] });
      toast({ title: "Folder access saved" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });

  // Team roles only: the Library routes admit team members, never clients or
  // supplier logins.
  const teamRoles = roles.filter((r) => (r.userCategory ?? "team") === "team" && r.isActive !== false);
  const invalid = (vMode === "roles" && vRoles.length === 0) || (eMode === "roles" && eRoles.length === 0);

  const option = (current: Mode, set: (m: Mode) => void, m: Mode, label: string, hint?: string) => (
    <label
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer",
        current === m ? "border-primary/40 bg-primary/5" : "border-border hover-elevate",
      )}
    >
      <input type="radio" className="mt-0.5 accent-[hsl(var(--primary))]" checked={current === m} onChange={() => set(m)} />
      <span className="text-sm">
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
  const roleList = (selected: string[], set: (ids: string[]) => void, testid: string) => (
    <div className="ml-6 mt-1 max-h-40 overflow-y-auto rounded-md border p-2 space-y-1.5" data-testid={testid}>
      {teamRoles.length === 0 && <p className="text-xs text-muted-foreground">No roles found.</p>}
      {teamRoles.map((r) => (
        <label key={r.id} className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={selected.includes(r.id)}
            onCheckedChange={() => set(selected.includes(r.id) ? selected.filter((x) => x !== r.id) : [...selected, r.id])}
          />
          <span className="text-xs">{r.name}</span>
        </label>
      ))}
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="dialog-folder-access">
        <DialogHeader>
          <DialogTitle>Who can see &amp; edit "{folder.name}"</DialogTitle>
          <DialogDescription>
            Applies to every document in this folder{isSub ? "" : " and its sub-folders (unless they set their own)"}. Admins can always see and edit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"><Eye className="h-3.5 w-3.5" />Who can see</p>
            {isSub && option(vMode, setVMode, "inherit", `Same as "${parentName}"`)}
            {option(vMode, setVMode, "everyone", "Everyone with Library access")}
            {option(vMode, setVMode, "roles", "Only these roles")}
            {vMode === "roles" && roleList(vRoles, setVRoles, "folder-access-view-roles")}
          </div>

          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"><Pencil className="h-3.5 w-3.5" />Who can edit</p>
            {isSub && option(eMode, setEMode, "inherit", `Same as "${parentName}"`)}
            {option(eMode, setEMode, "admins", "Admins only", "Nobody else can change these documents.")}
            {option(eMode, setEMode, "roles", "These roles", "They also need edit rights to the Library in Roles & Permissions.")}
            {eMode === "roles" && roleList(eRoles, setERoles, "folder-access-edit-roles")}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={invalid || save.isPending} data-testid="button-save-folder-access">
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
