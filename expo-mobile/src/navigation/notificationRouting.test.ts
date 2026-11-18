/// <reference types="node" />
/**
 * Where a tapped notification lands. Pure, so it runs directly:
 *   npx tsx src/navigation/notificationRouting.test.ts
 */
import assert from 'node:assert';
import { resolveNotificationTarget, tabNavigationParams } from './notificationRouting';

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

check('a defect push opens that defect', () => {
  assert.deepEqual(
    resolveNotificationTarget({ type: 'defect', projectId: 'p-1', defectId: 'd-7' }),
    { tab: 'Projects', screen: 'DefectDetail', params: { defectId: 'd-7', projectId: 'p-1' } },
  );
});

check('an in-app defect row (entityId + link) opens that defect', () => {
  assert.deepEqual(
    resolveNotificationTarget({ type: 'defect', entityType: 'defect', entityId: 'd-7', link: '/projects/p-1/defects' }),
    { tab: 'Projects', screen: 'DefectDetail', params: { defectId: 'd-7', projectId: 'p-1' } },
  );
});

check('a defect link with the id in the path opens that defect', () => {
  assert.deepEqual(
    resolveNotificationTarget({ link: '/projects/p-1/defects/d-9' }),
    { tab: 'Projects', screen: 'DefectDetail', params: { defectId: 'd-9', projectId: 'p-1' } },
  );
});

check('a defect notification with no defect id opens the project defects list', () => {
  assert.deepEqual(
    resolveNotificationTarget({ type: 'defect', link: '/projects/p-1/defects' }),
    { tab: 'Projects', screen: 'DefectsList', params: { projectId: 'p-1' } },
  );
});

check('stack targets keep their tab root underneath, More targets do not', () => {
  assert.deepEqual(
    tabNavigationParams({ tab: 'Projects', screen: 'ProjectDetail', params: { projectId: 'p' } }),
    { screen: 'ProjectDetail', params: { projectId: 'p' }, initial: false },
  );
  assert.deepEqual(
    tabNavigationParams({ tab: 'More', screen: 'Timesheets' }),
    { screen: 'Timesheets', params: undefined },
  );
  assert.equal(tabNavigationParams({ tab: 'Calendar' }), undefined);
});

console.log(`\n${passed} passed\n`);
