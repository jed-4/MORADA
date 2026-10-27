/**
 * Which URLs open a pre-start. Pure, so it runs directly:
 *   npx tsx src/navigation/prestartLink.test.ts
 */
import assert from 'node:assert';
import { prestartAssetIdFromUrl } from './prestartLink';

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err: any) { console.error(`  ✗ ${name}\n    ${err?.message}`); process.exitCode = 1; }
}

const id = '51e371f6-f23d-4b7b-8548-cd47e6c8d1fa';

check('a sticker URL gives the asset id', () => {
  assert.equal(prestartAssetIdFromUrl(`buildpro://prestart/${id}`), id);
  assert.equal(prestartAssetIdFromUrl(`buildpro://prestart/${id}/`), id);
  assert.equal(prestartAssetIdFromUrl(`BUILDPRO://prestart/${id.toUpperCase()}`), id);
});

check('other app links are left alone (sign-in redirects use the same scheme)', () => {
  assert.equal(prestartAssetIdFromUrl('buildpro://oauthredirect?code=abc'), null);
  assert.equal(prestartAssetIdFromUrl('buildpro://'), null);
  assert.equal(prestartAssetIdFromUrl(null), null);
});

check('nothing smuggled after the id', () => {
  assert.equal(prestartAssetIdFromUrl(`buildpro://prestart/${id}/../settings`), null);
  assert.equal(prestartAssetIdFromUrl(`https://evil.example/prestart/${id}`), null);
  assert.equal(prestartAssetIdFromUrl('buildpro://prestart/not-an-id'), null);
});

console.log(`prestartLink: ${passed} passed`);
