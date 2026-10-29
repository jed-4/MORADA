/**
 * What `GET /api/users/assignable` returns.
 *
 * Not a `User` row: it is a deliberately small projection for pickers, and
 * carries two things the table does not — `displayName`, because `users` has
 * no name column and every caller was otherwise joining first and last by
 * hand, and `isClient`, so a picker can mark a client rather than showing them
 * as if they were staff.
 *
 * Typing the query as `User[]` is what let `member.name` through in the
 * checklist assignee picker: the table has no such column, so the value was
 * always undefined and the saved assignee name was blank.
 *
 * Who is in the list:
 *   - every active staff member in the company
 *   - plus, when `?projectId` is given, THAT project's client — a client login
 *     points at a CRM contact and a project names its client the same way, so
 *     a client belongs to a project exactly when the two match
 *
 * Without `?projectId` it is staff only, which is what a picker that has no
 * project in hand should offer: there is no project to scope a client to.
 */
export type AssignablePerson = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  /** First + last, falling back to the email, then "Unknown User". */
  displayName: string;
  email: string | null;
  phone: string | null;
  profileImageUrl: string | null;
  roleId: string | null;
  roleName: string | null;
  userCategory: string;
  isSubcontractor: boolean;
  isGstRegistered: boolean;
  xeroContactId: string | null;
  isActive: boolean;
  /** True for a client portal login. Only ever present with `?projectId`. */
  isClient: boolean;
};
