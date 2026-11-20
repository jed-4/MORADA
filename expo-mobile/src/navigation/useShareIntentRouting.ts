import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useShareIntentContext } from 'expo-share-intent';
import { navigationRef } from './navigationRef';
import { prepareSharedFiles } from '../lib/shareIntake';
import { useAppLockedNow } from '../lib/appLock';

/**
 * Share into Morada (#44): when the share extension hands files over, copy
 * them into the app and open ShareTargetScreen (a modal in the root stack).
 *
 * Waits for a signed-in builder and a ready navigator — shared while signed
 * out, the files open as soon as sign-in finishes (if the app wasn't closed in
 * between). Client (homeowner) mode has no capture flows, so it says so.
 */
export function useShareIntentRouting({
  navReady,
  isAuthenticated,
  isClient,
}: {
  navReady: boolean;
  isAuthenticated: boolean;
  isClient: boolean;
}) {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const busy = useRef(false);
  // Behind the Face ID cover: wait until unlocked, so the modal can't open on top of it.
  const locked = useAppLockedNow();

  useEffect(() => {
    if (!hasShareIntent || busy.current) return;
    if (!navReady || !isAuthenticated || locked) return;

    if (isClient) {
      resetShareIntent();
      Alert.alert('Not available', 'Sharing photos into Morada is for builder accounts.');
      return;
    }

    const incoming = (shareIntent.files ?? []).map(f => ({
      path: f.path,
      fileName: f.fileName,
      mimeType: f.mimeType,
      width: f.width,
    }));
    if (!incoming.length) {
      // A web page or text on its own — nothing to attach.
      resetShareIntent();
      Alert.alert('Nothing to add', 'Morada takes photos and PDFs. To add a web page, save it as a PDF first.');
      return;
    }

    busy.current = true;
    prepareSharedFiles(incoming)
      .then(files => {
        resetShareIntent();
        const navigate = navigationRef.navigate as (name: string, params?: any) => void;
        navigate('ShareTarget', { files });
      })
      .catch(e => {
        console.warn('Share intake failed:', e);
        resetShareIntent();
        Alert.alert("Couldn't open the files", 'Please try sharing them again.');
      })
      .finally(() => {
        busy.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShareIntent, shareIntent, navReady, isAuthenticated, isClient, locked]);
}
