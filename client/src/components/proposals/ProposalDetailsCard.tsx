import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { InsertProposal, Proposal, Project } from '@shared/schema';

interface Props {
  proposal: Proposal;
  projects: Project[];
  /** True when the page is scoped to one project, so the project is fixed. */
  lockProject?: boolean;
  onProposalUpdate: (updates: Partial<InsertProposal>) => void;
  /** The estimate revision selector, rendered by the builder that owns it. */
  estimateSelector?: ReactNode;
  /** Whether an estimate revision is linked — drives the open-by-default rule. */
  hasEstimate: boolean;
  /** Structure picker: the standard set, or any saved company template. */
  templateSelector?: ReactNode;
}

const SAVE_DEBOUNCE_MS = 700;

function toDateInput(value: unknown): string {
  if (!value) return '';
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/**
 * Proposal-level settings, at the top of the section list rather than behind an
 * unlabelled gear in the header. These are things you read as often as you edit
 * them, so they sit where they are named — collapsed once the proposal is set
 * up, and open on arrival while something essential is still missing.
 */
export function ProposalDetailsCard({
  proposal,
  projects,
  lockProject,
  onProposalUpdate,
  estimateSelector,
  hasEstimate,
  templateSelector,
}: Props) {
  // Open while the proposal is incomplete: an unlinked estimate means every
  // price in the document is blank, and that is not something to discover in
  // the preview.
  const [open, setOpen] = useState(!hasEstimate);
  const [name, setName] = useState(proposal.name ?? '');
  const [expiry, setExpiry] = useState(() => toDateInput(proposal.expiryDate));

  // Re-sync when the server's copy changes underneath us (revision switch,
  // another tab), but never while the field is mid-edit.
  const dirty = useRef(false);
  useEffect(() => {
    if (dirty.current) return;
    setName(proposal.name ?? '');
    setExpiry(toDateInput(proposal.expiryDate));
  }, [proposal.name, proposal.expiryDate]);

  // Debounced autosave for the free-text fields. Selects write immediately —
  // there is no half-typed state to wait out.
  const pending = useRef<Partial<InsertProposal> | null>(null);
  const onUpdateRef = useRef(onProposalUpdate);
  onUpdateRef.current = onProposalUpdate;

  const flush = () => {
    if (!pending.current) return;
    onUpdateRef.current(pending.current);
    pending.current = null;
    dirty.current = false;
  };

  const queue = (updates: Partial<InsertProposal>) => {
    dirty.current = true;
    pending.current = { ...(pending.current ?? {}), ...updates };
  };

  useEffect(() => {
    if (!pending.current) return;
    const t = setTimeout(flush, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, expiry]);

  // Unmounting mid-debounce (switching tabs, leaving the page) must not drop
  // the last keystroke.
  useEffect(() => () => flush(), []);

  const needsAttention = !hasEstimate;

  return (
    <div className="border border-border rounded-md mb-2 flex-shrink-0" data-testid="card-proposal-details">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-8 px-2 flex items-center gap-2 text-xs font-medium hover-elevate active-elevate-2 rounded-md"
        aria-expanded={open}
        data-testid="button-toggle-proposal-details"
      >
        <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`} />
        Details
        {needsAttention && !open && (
          <span className="inline-flex items-center gap-1 text-xs font-normal text-amber ml-auto">
            <AlertCircle className="w-3 h-3" />
            No estimate linked
          </span>
        )}
      </button>

      {open && (
        <div className="px-2 pb-2 space-y-2.5">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); queue({ name: e.target.value }); }}
              onBlur={flush}
              className="h-7 text-xs"
              placeholder="Proposal name"
              data-testid="input-proposal-name"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Project</Label>
            <Select
              value={proposal.projectId || ''}
              onValueChange={(v) => onProposalUpdate({ projectId: v })}
              disabled={lockProject}
            >
              <SelectTrigger className="h-7 text-xs" data-testid="select-project">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* The estimate is what turns the document from prose into a quote,
              so it is named here rather than hidden in the header toolbar. */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Estimate revision</Label>
            {estimateSelector ?? (
              <p className="text-xs text-muted-foreground">No project linked yet.</p>
            )}
            {needsAttention && (
              <p className="flex items-start gap-1 text-xs text-amber" data-testid="text-estimate-hint">
                <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>Choose a revision — until you do, every price in the proposal prints blank.</span>
              </p>
            )}
          </div>

          {templateSelector && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Structure</Label>
              {templateSelector}
              {/* Nothing on the proposal records which template built it, so
                  this reads as a chooser rather than showing the last one
                  applied. */}
              <p className="text-xs text-muted-foreground/70">
                Replaces every section with the chosen structure.
              </p>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Pricing valid until</Label>
            <Input
              type="date"
              value={expiry}
              onChange={(e) => {
                setExpiry(e.target.value);
                queue({ expiryDate: e.target.value ? new Date(e.target.value) : null } as Partial<InsertProposal>);
              }}
              onBlur={flush}
              className="h-7 text-xs"
              data-testid="input-proposal-expiry"
            />
          </div>
        </div>
      )}
    </div>
  );
}
