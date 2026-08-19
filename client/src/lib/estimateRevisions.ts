/**
 * Revision helpers shared by the estimates views and the estimate detail page.
 *
 * A revision family is every estimate sharing a root: each row either points at
 * its root via parentEstimateId, or is the root itself. Version numbers are
 * 1-based and shown as letters — Rev A, Rev B, …
 */

/** "Rev A" for version 1, "Rev B" for 2, and so on. */
export function getRevLabel(version: number): string {
  return "Rev " + String.fromCharCode(64 + version);
}

/** The id every revision of the same estimate shares. */
export function revisionRootId(estimate: { id: string; parentEstimateId?: string | null }): string {
  return estimate.parentEstimateId || estimate.id;
}
