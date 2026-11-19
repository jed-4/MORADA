/// <reference types="node" />
/**
 * Where a buildpro:// link (widget, Live Activity, Lock Screen shortcut)
 * lands. Pure, so it runs directly:
 *   npx tsx src/navigation/deepLinkRouting.test.ts
 */
import assert from 'node:assert';
import { resolveDeepLink } from './deepLinkRouting';

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err: any) { console.error(`  ✗ ${name}\n    ${err?.message}`); process.exitCode = 1; }
}

check('timesheets and tasks open the More stack screens', () => {
  assert.deepEqual(resolveDeepLink('buildpro://timesheets'), { tab: 'More', screen: 'Timesheets' });
  assert.deepEqual(resolveDeepLink('buildpro:///tasks'), { tab: 'More', screen: 'Tasks' });
});

check('a project link opens that project', () => {
  assert.deepEqual(
    resolveDeepLink('buildpro://project/abc-123'),
    { tab: 'Projects', screen: 'ProjectDetail', params: { projectId: 'abc-123' } },
  );
});

check('diary photo asks Quick capture to start the camera', () => {
  const t = resolveDeepLink('buildpro://capture/photo');
  assert.equal(t?.tab, 'Workspace');
  assert.equal(t?.screen, 'WorkspaceHome');
  assert.equal(t?.params?.quickCapture, 'diary');
  assert.equal(typeof t?.params?.quickCaptureAt, 'number');
});

check('unknown links and other schemes are ignored', () => {
  assert.equal(resolveDeepLink('buildpro://oauthredirect?code=x'), null);
  assert.equal(resolveDeepLink('https://example.com/timesheets'), null);
  assert.equal(resolveDeepLink(''), null);
  assert.equal(resolveDeepLink('buildpro://'), null);
});

console.log(`\n${passed} passed`);
