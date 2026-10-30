// A pre-start QR sticker encodes buildpro://prestart/<assetId>. Only that exact
// shape is handled; every other buildpro:// URL (e.g. sign-in redirects) is
// left alone. Pure, so it can be tested without React Native.
const PRESTART_URL = /^buildpro:\/\/prestart\/([0-9a-f-]{36})\/?$/i;

export function prestartAssetIdFromUrl(url: string | null | undefined): string | null {
  const match = url ? PRESTART_URL.exec(url.trim()) : null;
  return match ? match[1].toLowerCase() : null;
}
