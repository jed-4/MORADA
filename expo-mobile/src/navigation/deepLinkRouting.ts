// buildpro:// deep links (widgets, Live Activity, Lock Screen shortcuts).
//
//   buildpro://timesheets       → More › Timesheets
//   buildpro://tasks            → More › Tasks
//   buildpro://project/<id>     → Projects › ProjectDetail
//   buildpro://capture/photo    → Home, then Quick capture "Photo to diary"
//
// Handled by hand (like push taps, see deepLinks.ts) rather than with the
// NavigationContainer `linking` prop, because the container restores the last
// screen via `initialState`, and React Navigation ignores a launch URL
// whenever initialState is set. Anything unrecognised (e.g. an OAuth
// redirect) resolves to null and is ignored.
//
// Pure, so it runs under tsx: npx tsx src/navigation/deepLinkRouting.test.ts
import type { NotificationTarget } from './notificationRouting';

export function resolveDeepLink(url: string | null | undefined): NotificationTarget | null {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/^buildpro:\/\/\/?([^?#]*)/i);
  if (!m) return null;
  const parts = m[1].split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  const [head, second] = parts;
  switch ((head || '').toLowerCase()) {
    case 'timesheets':
      return { tab: 'More', screen: 'Timesheets' };
    case 'tasks':
      return { tab: 'More', screen: 'Tasks' };
    case 'project':
    case 'projects':
      return second
        ? { tab: 'Projects', screen: 'ProjectDetail', params: { projectId: second } }
        : { tab: 'Projects' };
    case 'capture':
      if ((second || '').toLowerCase() === 'photo') {
        // quickCaptureAt makes each tap a fresh request (and lets a restored,
        // stale param be ignored — see QuickCaptureRow).
        return { tab: 'Workspace', screen: 'WorkspaceHome', params: { quickCapture: 'diary', quickCaptureAt: Date.now() } };
      }
      return null;
    case 'home':
      return { tab: 'Workspace' };
    default:
      return null;
  }
}
