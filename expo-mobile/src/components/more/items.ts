import type { Ionicons } from '@expo/vector-icons';

// Single source of truth for the More panel's grouped content.
// Colours are theme token KEYS (not hexes) — MorePanel resolves them via
// useTheme() at render so every tile works in light and dark mode.

export type MoreColorToken =
  | 'primary'
  | 'sage'
  | 'amber'
  | 'teal'
  | 'coral'
  | 'rose'
  | 'lavender'
  | 'textMuted';

/** Matching wash token for each accent — the tile's icon-circle background. */
export const MORE_COLOR_BG: Record<MoreColorToken, string> = {
  primary: 'primaryLight',
  sage: 'sageLight',
  amber: 'amberLight',
  teal: 'tealLight',
  coral: 'coralLight',
  rose: 'roseLight',
  lavender: 'lavenderLight',
  textMuted: 'subtle',
};

export type MoreAction =
  | { type: 'more-screen'; screen: string; params?: Record<string, unknown> }
  | { type: 'tab'; tab: string }
  | { type: 'sheet'; sheet: 'new-task' };

export interface MoreTile {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: MoreColorToken;
  action: MoreAction;
  /** Show the Messages unread count pill on this tile. */
  showUnreadBadge?: boolean;
  /** Render in the destructive (statusDanger) style. */
  destructive?: boolean;
}

export const workspaceItems: MoreTile[] = [
  { id: 'notes', label: 'Notes', icon: 'document-text', color: 'sage', action: { type: 'more-screen', screen: 'Notes' } },
  { id: 'site-diary', label: 'Site Diary', icon: 'book', color: 'primary', action: { type: 'more-screen', screen: 'SiteDiaryList' } },
  { id: 'tasks', label: 'My Tasks', icon: 'checkbox', color: 'lavender', action: { type: 'more-screen', screen: 'Tasks' } },
  { id: 'timesheets', label: 'Timesheets', icon: 'time', color: 'amber', action: { type: 'more-screen', screen: 'Timesheets' } },
  { id: 'checklists', label: 'Checklists', icon: 'checkmark-done', color: 'sage', action: { type: 'more-screen', screen: 'Checklists' } },
  { id: 'schedule', label: 'Schedule', icon: 'calendar', color: 'rose', action: { type: 'more-screen', screen: 'Schedule' } },
  { id: 'messages', label: 'Messages', icon: 'chatbubbles', color: 'teal', action: { type: 'tab', tab: 'Messages' }, showUnreadBadge: true },
];

export const createItems: MoreTile[] = [
  { id: 'new-task', label: 'New Task', icon: 'checkbox-outline', color: 'lavender', action: { type: 'sheet', sheet: 'new-task' } },
  // NoteEditor without a noteId opens a blank editor that auto-creates the
  // note on first save (POST /api/notes) — so this is a true "new note" flow.
  { id: 'new-note', label: 'New Note', icon: 'document-text-outline', color: 'sage', action: { type: 'more-screen', screen: 'NoteEditor' } },
  { id: 'new-diary', label: 'New Diary Entry', icon: 'book-outline', color: 'primary', action: { type: 'more-screen', screen: 'SiteDiaryList', params: { openCreate: true } } },
];

// Settings lives on the tappable profile row; Log Out and Suggest an Idea live
// in the Dashboard avatar menu — rare/destructive actions stay away from the
// thumb-friendly bottom of this sheet.

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
