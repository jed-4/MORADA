// Navigation side of the buildpro:// deep links. The URL → screen mapping
// (and the list of links) is in deepLinkRouting.ts.
import { navigationRef } from './navigationRef';
import { tabNavigationParams } from './notificationRouting';
import { resolveDeepLink } from './deepLinkRouting';

/** Navigate for a buildpro:// URL. Returns true when it was one of ours. */
export function navigateFromDeepLink(url: string | null | undefined): boolean {
  const target = resolveDeepLink(url);
  if (!target || !navigationRef.isReady()) return false;
  const navigate = navigationRef.navigate as (name: string, params?: any) => void;
  try {
    navigate('Main', { screen: target.tab, params: tabNavigationParams(target) });
    return true;
  } catch {
    // Navigation tree may not be fully ready on cold start; safe to ignore.
    return false;
  }
}
