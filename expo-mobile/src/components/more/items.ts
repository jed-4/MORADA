import {
  BookOpen,
  CalendarDays,
  CheckCheck,
  Clock,
  FileText,
  Hammer,
  Palette,
  SquareCheck,
  type LucideIcon,
} from 'lucide-react-native';

// Single source of truth for the More sheet's content (revamp P06: one plain
// list card + create chips; no colour per item).

export type MoreAction =
  | { type: 'more-screen'; screen: string; params?: Record<string, unknown> }
  | { type: 'tab'; tab: string }
  | { type: 'sheet'; sheet: 'new-task' };

export interface MoreTile {
  id: string;
  label: string;
  icon: LucideIcon;
  action: MoreAction;
}

export const workspaceItems: MoreTile[] = [
  { id: 'notes', label: 'Notes', icon: FileText, action: { type: 'more-screen', screen: 'Notes' } },
  { id: 'site-diary', label: 'Site diary', icon: BookOpen, action: { type: 'more-screen', screen: 'SiteDiaryList' } },
  { id: 'tasks', label: 'My tasks', icon: SquareCheck, action: { type: 'more-screen', screen: 'Tasks' } },
  { id: 'timesheets', label: 'Timesheets', icon: Clock, action: { type: 'more-screen', screen: 'Timesheets' } },
  { id: 'checklists', label: 'Checklists', icon: CheckCheck, action: { type: 'more-screen', screen: 'Checklists' } },
  { id: 'schedule', label: 'Schedule', icon: CalendarDays, action: { type: 'more-screen', screen: 'Schedule' } },
  // Shown only to roles that can view selections (MorePanel filters it).
  { id: 'selections', label: 'Selections', icon: Palette, action: { type: 'more-screen', screen: 'SelectionsProjects' } },
  // Shown only to roles that can view defects (MorePanel filters it).
  { id: 'my-defects', label: 'My defects', icon: Hammer, action: { type: 'more-screen', screen: 'MyDefects', params: { mine: true } } },
];

export const createItems: MoreTile[] = [
  { id: 'new-task', label: 'New task', icon: SquareCheck, action: { type: 'sheet', sheet: 'new-task' } },
  // NoteEditor without a noteId opens a blank editor that auto-creates the
  // note on first save (POST /api/notes) — so this is a true "new note" flow.
  { id: 'new-note', label: 'New note', icon: FileText, action: { type: 'more-screen', screen: 'NoteEditor' } },
  { id: 'new-diary', label: 'Diary entry', icon: BookOpen, action: { type: 'more-screen', screen: 'SiteDiaryList', params: { openCreate: true } } },
];

// Settings, Help & feedback and Sign out sit in their own card at the foot of
// the sheet (design P06); Sign out asks before acting.

// Keep this list in sync with the web app's client/src/lib/suggestionSections.ts.
export const SUGGESTION_SECTIONS: { value: string; label: string }[] = [
  { value: 'general', label: 'General / Overall' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'projects', label: 'Projects' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'estimates', label: 'Estimates & Quotes' },
  { value: 'selections', label: 'Selections' },
  { value: 'bills', label: 'Bills & Purchase Orders' },
  { value: 'invoices', label: 'Client Invoices' },
  { value: 'budget', label: 'Budget & Financials' },
  { value: 'site-diary', label: 'Site Diary' },
  { value: 'checklists', label: 'Checklists' },
  { value: 'messages', label: 'Messages & Notes' },
  { value: 'documents', label: 'Documents & Files' },
  { value: 'mobile', label: 'Mobile App' },
  { value: 'other', label: 'Something else' },
];
