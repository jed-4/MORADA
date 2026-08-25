/**
 * Derivation tests for src/lib/selections.ts — the logic behind what the spec
 * sheet says. Pure TypeScript, no React Native imports, so it runs directly:
 *
 *   npx tsx src/lib/selections.test.ts
 */
import assert from 'node:assert';
import {
  formatQuantity,
  getChosenOption,
  getSelectionState,
  groupByCategory,
  groupByRoom,
  isSettled,
  matchesSearch,
  specLine,
  unitLabel,
  type Selection,
  type SelectionOption,
} from './selections';

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    console.error(`  ✗ ${name}\n    ${err?.message}`);
    process.exitCode = 1;
  }
}

const option = (over: Partial<SelectionOption> = {}): SelectionOption => ({
  id: 'opt-1',
  selectionId: 'sel-1',
  name: 'Zellige Lily',
  brand: 'Concept Tile & Timber',
  sku: 'ZL-100',
  quantity: 14,
  unitType: 'm2',
  isSelectedByClient: false,
  approvedAt: null,
  attachments: [],
  ...over,
});

const selection = (over: Partial<Selection> = {}): Selection => ({
  id: 'sel-1',
  projectId: 'proj-1',
  name: 'Splashback tiles',
  room: 'Kitchen',
  category: 'Tiles',
  status: 'pending',
  options: [],
  ...over,
});

console.log('\nlib/selections');

// ── State ─────────────────────────────────────────────────────────────────
check('approval is what makes a selection settled, not the client picking', () => {
  const picked = selection({ options: [option({ isSelectedByClient: true })] });
  assert.equal(getSelectionState(picked), 'awaiting');
  assert.equal(isSettled(getSelectionState(picked)), false);

  const approved = selection({
    options: [option({ isSelectedByClient: true, approvedAt: '2026-08-01T00:00:00Z' })],
  });
  assert.equal(getSelectionState(approved), 'approved');
  assert.equal(isSettled(getSelectionState(approved)), true);
});

check('a restricted stub always reads as awaiting', () => {
  assert.equal(getSelectionState(selection({ restricted: true, options: [] })), 'awaiting');
});

check('ordered and received outrank option state', () => {
  assert.equal(getSelectionState(selection({ status: 'ordered' })), 'ordered');
  assert.equal(getSelectionState(selection({ status: 'received' })), 'received');
});

check('nothing chosen reads as open', () => {
  assert.equal(getSelectionState(selection({ options: [option()] })), 'open');
});

check('the approved option wins over a later client pick', () => {
  const sel = selection({
    options: [
      option({ id: 'a', name: 'Approved one', approvedAt: '2026-08-01T00:00:00Z' }),
      option({ id: 'b', name: 'Picked later', isSelectedByClient: true }),
    ],
  });
  assert.equal(getChosenOption(sel)?.id, 'a');
});

// ── Formatting ────────────────────────────────────────────────────────────
check('quantities render with a readable unit', () => {
  assert.equal(formatQuantity(option({ quantity: 14, unitType: 'm2' })), '14 m²');
  assert.equal(formatQuantity(option({ quantity: 3, unitType: 'each' })), '3 ea');
  assert.equal(formatQuantity(option({ quantity: 2.5, unitType: 'linear_m' })), '2.5 lm');
  assert.equal(formatQuantity(option({ quantity: 0 })), '');
  assert.equal(formatQuantity(undefined), '');
});

check('an unknown unit passes through rather than vanishing', () => {
  assert.equal(unitLabel('roll'), 'roll');
  assert.equal(unitLabel(null), '');
});

check('spec line is brand then code, skipping blanks', () => {
  assert.equal(specLine(option()), 'Concept Tile & Timber · ZL-100');
  assert.equal(specLine(option({ sku: null })), 'Concept Tile & Timber');
  assert.equal(specLine(option({ brand: null, sku: null })), '');
});

// ── Grouping ──────────────────────────────────────────────────────────────
check('rooms sort alphabetically with the catch-all last', () => {
  const rows = [
    selection({ id: '1', room: 'Kitchen' }),
    selection({ id: '2', room: null }),
    selection({ id: '3', room: 'Ensuite' }),
  ];
  assert.deepEqual(groupByRoom(rows).map((g) => g.title), ['Ensuite', 'Kitchen', 'Not assigned']);
});

check('group counts report how many are settled', () => {
  const rows = [
    selection({ id: '1', room: 'Kitchen', options: [option({ approvedAt: '2026-08-01T00:00:00Z' })] }),
    selection({ id: '2', room: 'Kitchen', name: 'Tapware' }),
  ];
  const [kitchen] = groupByRoom(rows);
  assert.equal(kitchen.data.length, 2);
  assert.equal(kitchen.settledCount, 1);
});

check('category grouping is the same shape', () => {
  const rows = [selection({ id: '1', category: 'Tiles' }), selection({ id: '2', category: null })];
  assert.deepEqual(groupByCategory(rows).map((g) => g.title), ['Tiles', 'Not assigned']);
});

check('rows within a group sort by name', () => {
  const rows = [
    selection({ id: '1', name: 'Tapware', room: 'Kitchen' }),
    selection({ id: '2', name: 'Benchtop', room: 'Kitchen' }),
  ];
  assert.deepEqual(groupByRoom(rows)[0].data.map((s) => s.name), ['Benchtop', 'Tapware']);
});

// ── Search ────────────────────────────────────────────────────────────────
check('search covers the product a trade would look up, not just the slot', () => {
  const sel = selection({
    options: [option({ approvedAt: '2026-08-01T00:00:00Z' })],
  });
  assert.equal(matchesSearch(sel, 'zellige'), true, 'product name');
  assert.equal(matchesSearch(sel, 'ZL-100'), true, 'sku');
  assert.equal(matchesSearch(sel, 'concept'), true, 'brand');
  assert.equal(matchesSearch(sel, 'kitchen'), true, 'room');
  assert.equal(matchesSearch(sel, 'splashback'), true, 'slot name');
  assert.equal(matchesSearch(sel, 'pendant'), false);
  assert.equal(matchesSearch(sel, '   '), true, 'blank query matches everything');
});

check('search does not crash on a restricted stub', () => {
  assert.equal(matchesSearch(selection({ restricted: true, options: [] }), 'zellige'), false);
});

console.log(`\n${passed} passed\n`);
