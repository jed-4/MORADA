import type { DotStatus } from '../components/kit';

/** Schedule item status → status dot (Schedule list, Gantt, Project detail). */
export function scheduleDot(status?: string | null): DotStatus {
  switch (status) {
    case 'completed': return 'done';
    case 'in_progress': return 'inProgress';
    case 'on_hold': return 'pending';
    case 'cancelled': return 'rejected';
    default: return 'upcoming';
  }
}
