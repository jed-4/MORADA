/**
 * Library per-folder access (migration 0127). Viewing and editing are
 * separate: a role that can read SOPs must not be able to change them.
 * Run: npx tsx server/__tests__/library-access.test.ts
 */
import assert from "node:assert";
import { effectiveFolderAccess, accessFor, canView, canEdit, EVERYONE } from "../services/libraryAccess";

let failures = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`  ok   ${name}`); } catch (e: any) { failures++; console.log(`  FAIL ${name}\n       ${e.message}`); }
};

const CARP = { roleId: "carpenter", isAdmin: false };
const SUP = { roleId: "supervisor", isAdmin: false };
const ADMIN = { roleId: "admin", isAdmin: true };
const folders = [
  { id: "site", parentFolderId: null, viewRoleIds: null, editRoleIds: ["supervisor"] },
  { id: "concrete", parentFolderId: "site", viewRoleIds: null, editRoleIds: null },
  { id: "accounts", parentFolderId: null, viewRoleIds: ["supervisor"], editRoleIds: [] },
  { id: "public", parentFolderId: "accounts", viewRoleIds: [EVERYONE], editRoleIds: null },
];
const eff = effectiveFolderAccess(folders as any);

check("a carpenter can READ the Site SOPs but not EDIT them", () => {
  assert.ok(canView(accessFor("site", eff), CARP));
  assert.ok(!canEdit(accessFor("site", eff), CARP));
});
check("the supervisor role named on Site can edit it", () => {
  assert.ok(canEdit(accessFor("site", eff), SUP));
});
check("a sub-folder with nothing set inherits its parent (Concrete ← Site)", () => {
  assert.ok(canEdit(accessFor("concrete", eff), SUP));
  assert.ok(!canEdit(accessFor("concrete", eff), CARP));
});
check("a restricted folder is hidden from other roles", () => {
  assert.ok(!canView(accessFor("accounts", eff), CARP));
  assert.ok(canView(accessFor("accounts", eff), SUP));
});
check("an empty edit list means admins only", () => {
  assert.ok(!canEdit(accessFor("accounts", eff), SUP));
  assert.ok(canEdit(accessFor("accounts", eff), ADMIN));
});
check("'everyone' on a sub-folder opens it up under a restricted parent", () => {
  assert.ok(canView(accessFor("public", eff), CARP));
});
check("unfiled documents: everyone reads, admins only edit", () => {
  assert.ok(canView(accessFor(null, eff), CARP));
  assert.ok(!canEdit(accessFor(null, eff), SUP));
  assert.ok(canEdit(accessFor(null, eff), ADMIN));
});
check("admins see and edit everything", () => {
  for (const f of folders) {
    assert.ok(canView(accessFor(f.id, eff), ADMIN));
    assert.ok(canEdit(accessFor(f.id, eff), ADMIN));
  }
});
check("a folder loop can't hang the resolver", () => {
  const loop = effectiveFolderAccess([
    { id: "a", parentFolderId: "b", viewRoleIds: null, editRoleIds: null },
    { id: "b", parentFolderId: "a", viewRoleIds: null, editRoleIds: null },
  ] as any);
  assert.deepStrictEqual(loop.get("a"), { view: null, edit: null });
});

if (failures) { console.log(`\n${failures} failing`); process.exit(1); }
console.log("\nall passing");
