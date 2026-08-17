// Shared types and constants for the Project Scope page.
//
// Extracted verbatim from client/src/pages/ProjectScope.tsx (Scope-PR2). This
// module is intentionally value-light: the two constants below are the only
// runtime exports, and both are shared by more than one scope component.

// Primary color variable for inline styles (uses CSS variable fallback)
export const PRIMARY_COLOR = 'hsl(261, 44%, 70%)';

// Scope item types
export const SCOPE_TYPES = ['e-note', 'scope', 'note', 'tool', 'material', 'proposal', 'checklist'] as const;
export type ScopeItemType = typeof SCOPE_TYPES[number];

// Checklist item type for scope items with itemType="checklist"
export type ChecklistItem = {
  id: string;
  text: string;
  completed: boolean;
};

export interface StageState {
  [key: string]: boolean;
}

// Linked PO interface for stage display
export interface LinkedPOForStage {
  id: string;
  poNumber: string;
  title: string | null;
  supplierName: string | null;
  status: string;
  total: number;
  scopeStageId: string | null;
  createdAt: string;
}

// Linked Schedule Item interface for stage display
export interface LinkedScheduleItemForStage {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  scopeStageId: string | null;
  assignedToName: string | null;
}

export type LinkedChecklistItem = {
  id: string;
  description: string;
  status: string;
  isRequired?: boolean;
  groupName?: string | null;
  order?: number;
  groupOrder?: number;
};

// A checklist instance already linked to the stage being rendered.
export type LinkedChecklistForStage = {
  id: string;
  name: string;
  status: string;
  completedCount?: number;
  totalCount?: number;
};

// Every checklist instance on the project — the link picker filters this for
// the unlinked ones.
export type ProjectChecklistForStage = LinkedChecklistForStage & {
  scopeStageId: string | null;
};

export type ProjectTaskForStage = {
  id: string;
  title: string;
  statusName?: string | null;
  scopeStageId?: string | null;
};

export type StageLabourTracker = {
  costCodeId: string;
};

// Shared prop shape for every linked-record panel rendered inside a StageCard
// (POs, schedule, checklists, tasks, labour trackers). Each panel extends this
// with its own data + handlers, so adding or reordering panels stays cheap.
export interface ScopeStagePanelProps {
  stageId: string;
  stageName: string;
}
