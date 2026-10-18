/**
 * Where a tapped notification lands. Pure, so it runs directly:
 *   npx tsx src/navigation/notificationRouting.test.ts
 */
import assert from 'node:assert';
import { resolveNotificationTarget } from './notificationRouting';

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err: any) { console.error(`  ✗ ${name}\n    ${err?.message}`); process.exitCode = 1; }
}

check('a selection notification opens that selection', () => {
  for (const type of ['selection_client_choice', 'selection_client_comment', 'selection_builder_comment']) {
    assert.deepEqual(
      resolveNotificationTarget({ type, link: '/projects/p-1/selections/s-9', entityType: 'selection', entityId: 's-9' }),
      { tab: 'Projects', screen: 'SelectionDetail', params: { selectionId: 's-9', projectId: 'p-1' } },
    );
  }
});

check('other project links still open the project', () => {
  assert.deepEqual(
    resolveNotificationTarget({ type: 'bill_submitted', link: '/projects/p-1/bills/b-2' }),
    { tab: 'Projects', screen: 'ProjectDetail', params: { projectId: 'p-1' } },
  );
});

check('messages still open their thread', () => {
  assert.equal(resolveNotificationTarget({ type: 'mention', link: '/messages?channel=c-1' }).screen, 'MessageThread');
});

console.log(`\n${passed} passed\n`);
