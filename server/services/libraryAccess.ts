import type { Doc, DocFolder } from "@shared/schema";
// storage is imported lazily so the pure rules below load without a database
// (server/__tests__/library-access.test.ts).
const getStorage = async () => (await import("../storage")).storage;

/**
 * Who can see and who can edit Library documents, per folder (migration 0127).
 *
 * Kept separate on purpose (Jed): a carpenter who can READ the SOPs must not
 * be able to CHANGE them.
 *
 *   view_role_ids  NULL = inherit from parent; top level = everyone with
 *                  Library access. A list = only those roles.
 *   edit_role_ids  NULL = inherit; top level = ADMINS ONLY. A list = those
 *                  roles (the route still requires the Library "edit" permission).
 *
 * Admins can always see and edit. A document follows its folder; an unfiled
 * document uses the top-level defaults. The pure parts are exported for tests.
 */

export interface LibraryViewer {
  roleId: string | null;
  isAdmin: boolean;
}

/** Built-in admin / owner / general manager — the same rule as isAdminLike. */
export async function libraryViewer(user: any): Promise<LibraryViewer> {
  let isAdmin = false;
  if (user?.roleId && user?.companyId) {
    const storage = await getStorage();
    const role = await storage.getUserRole(user.roleId, user.companyId).catch(() => undefined);
    const n = (role?.name ?? "").toLowerCase();
    isAdmin = !!role?.isBuiltIn && (n.includes("admin") || n.includes("owner") || n.includes("general manage"));
  }
  return { roleId: user?.roleId ?? null, isAdmin };
}

export interface FolderAccess {
  /** null = everyone with Library access. */
  view: string[] | null;
  /** null = admins only. */
  edit: string[] | null;
}

/** Each folder's effective access, walking up to the nearest folder that sets it. */
export function effectiveFolderAccess(
  folders: Pick<DocFolder, "id" | "parentFolderId" | "viewRoleIds" | "editRoleIds">[],
): Map<string, FolderAccess> {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const resolve = (id: string, key: "viewRoleIds" | "editRoleIds"): string[] | null => {
    const seen = new Set<string>();
    let cur = byId.get(id);
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      const v = cur[key];
      if (Array.isArray(v)) return v;
      cur = cur.parentFolderId ? byId.get(cur.parentFolderId) : undefined;
    }
    return null;
  };
  const out = new Map<string, FolderAccess>();
  for (const f of folders) out.set(f.id, { view: resolve(f.id, "viewRoleIds"), edit: resolve(f.id, "editRoleIds") });
  return out;
}

const TOP_LEVEL: FolderAccess = { view: null, edit: null };

export function accessFor(folderId: string | null | undefined, eff: Map<string, FolderAccess>): FolderAccess {
  return (folderId && eff.get(folderId)) || TOP_LEVEL;
}

/** In view_role_ids, "*" = everyone with Library access (lets a sub-folder
 *  open up again under a restricted parent; NULL would only inherit). An
 *  EMPTY edit list = admins only, the same as the top-level default. */
export const EVERYONE = "*";

export function canView(a: FolderAccess, v: LibraryViewer): boolean {
  return v.isAdmin || a.view === null || a.view.includes(EVERYONE) || (!!v.roleId && a.view.includes(v.roleId));
}

export function canEdit(a: FolderAccess, v: LibraryViewer): boolean {
  return v.isAdmin || (a.edit !== null && !!v.roleId && a.edit.includes(v.roleId));
}

/** Everything a request needs: the viewer and every folder's access, once. */
export async function libraryContext(user: any) {
  const storage = await getStorage();
  const [viewer, folders] = await Promise.all([libraryViewer(user), storage.getDocFolders(user.companyId)]);
  const eff = effectiveFolderAccess(folders);
  return {
    viewer,
    folders,
    eff,
    viewDoc: (d: Pick<Doc, "folderId">) => canView(accessFor(d.folderId, eff), viewer),
    editDoc: (d: Pick<Doc, "folderId">) => canEdit(accessFor(d.folderId, eff), viewer),
    viewFolder: (id: string | null | undefined) => canView(accessFor(id, eff), viewer),
    editFolder: (id: string | null | undefined) => canEdit(accessFor(id, eff), viewer),
  };
}
