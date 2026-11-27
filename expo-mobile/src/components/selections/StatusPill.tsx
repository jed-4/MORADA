import { StatusDot, type DotStatus } from '../kit';
import { STATE_LABEL, type SelectionState } from '../../lib/selections';

/** Selection state → the design's dot + word (never a filled pill). */
export function selectionDot(state: SelectionState): { status: DotStatus; label: string } {
  switch (state) {
    case 'approved':
    case 'received':
      return { status: 'done', label: STATE_LABEL[state] };
    case 'ordered':
      return { status: 'sent', label: STATE_LABEL[state] };
    case 'awaiting':
      // A client's pick waiting on sign-off.
      return { status: 'pending', label: 'Pending' };
    default:
      return { status: 'upcoming', label: STATE_LABEL[state] };
  }
}

/**
 * Selection state as a 7dp dot + muted word (revamp v1). The file keeps its
 * old name so existing imports still work.
 */
export default function StatusPill({ state, small = true }: { state: SelectionState; small?: boolean }) {
  const { status, label } = selectionDot(state);
  return <StatusDot status={status} label={label} small={small} />;
}
