// Canonical project ordering — job/project number (numeric-aware), then name.
// Used by the Projects list and the dashboard's project row so they always
// present projects in the same order.

interface ProjectLike {
  name?: string;
  projectNumber?: string;
  jobNumber?: string;
}

export function compareProjects(a: ProjectLike, b: ProjectLike): number {
  const jnA = a.projectNumber || a.jobNumber || '';
  const jnB = b.projectNumber || b.jobNumber || '';
  if (jnA && jnB) {
    const cmp = jnA.localeCompare(jnB, undefined, { numeric: true });
    if (cmp !== 0) return cmp;
  } else if (jnA) return -1;
  else if (jnB) return 1;
  return (a.name || '').localeCompare(b.name || '');
}
