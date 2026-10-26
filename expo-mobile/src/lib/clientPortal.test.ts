/**
 * Tests for src/lib/clientPortal.ts — what client mode says about a job.
 *
 *   npx tsx src/lib/clientPortal.test.ts
 */
import assert from 'node:assert';
import {
  approvedVariationTotal,
  buildAttention,
  groupInvoices,
  outstandingBalance,
  resolveClientNotificationTarget,
  formatDaysChanged,
  groupVariations,
  buildSelectionGallery,
  canClientChoose,
  selectionFilterOf,
  diaryPhotoUrls,
  diaryTextFields,
  formatDateRange,
  formatDay,
  groupSchedule,
  invoiceStatus,
  isScheduleItemDone,
  isScheduleItemUnderway,
  pickSchedule,
  schedulePercent,
  scheduleSpan,
  selectionStatus,
  sortDiary,
  variationStatus,
  type ClientScheduleItem,
} from './clientPortal';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// A fixed local day so "today" never drifts with the clock.
const TODAY = new Date(2026, 9, 26, 9, 0); // Mon 26 Oct 2026, 9am local

const item = (over: Partial<ClientScheduleItem>): ClientScheduleItem => ({
  id: over.id ?? 'x',
  name: over.name ?? 'Item',
  startDate: '2026-10-20',
  endDate: '2026-10-30',
  ...over,
});

check('done = completed status or 100% progress, nothing else', () => {
  assert.strictEqual(isScheduleItemDone(item({ status: 'completed' })), true);
  assert.strictEqual(isScheduleItemDone(item({ progressPercent: 100 })), true);
  assert.strictEqual(isScheduleItemDone(item({ status: 'on_hold', progressPercent: 60 })), false);
});

check('underway = today inside the dates and not done', () => {
  assert.strictEqual(isScheduleItemUnderway(item({}), TODAY), true);
  assert.strictEqual(isScheduleItemUnderway(item({ status: 'completed' }), TODAY), false);
  assert.strictEqual(isScheduleItemUnderway(item({ startDate: '2026-10-27' }), TODAY), false);
  assert.strictEqual(isScheduleItemUnderway(item({ endDate: '2026-10-25' }), TODAY), false);
});

check('underway uses the LOCAL day — a UTC timestamp late on the 25th is the 26th in AEST', () => {
  // 2026-10-25T14:00Z is 1am on the 26th in Sydney; only meaningful when the
  // test machine is in AU, so assert against whatever the local day is.
  const ts = '2026-10-25T14:00:00.000Z';
  const localDay = new Date(ts);
  const it = item({ startDate: ts, endDate: ts });
  assert.strictEqual(isScheduleItemUnderway(it, localDay), true);
});

check('schedule groups by phase in date order, counting done', () => {
  const groups = groupSchedule([
    item({ id: 'b', groupName: 'Frame', startDate: '2026-11-02' }),
    item({ id: 'a', groupName: 'Frame', startDate: '2026-10-01', status: 'completed' }),
    item({ id: 'c', groupName: 'Slab', startDate: '2026-09-01' }),
    item({ id: 'd' }),
  ]);
  assert.deepStrictEqual(groups.map((g) => g.title), ['Slab', 'Frame', 'Programme']);
  assert.deepStrictEqual(groups[1].items.map((i) => i.id), ['a', 'b']);
  assert.strictEqual(groups[1].done, 1);
});

check('percent complete is items done over items', () => {
  assert.strictEqual(schedulePercent([]), 0);
  assert.strictEqual(schedulePercent([item({ status: 'completed' }), item({}), item({}), item({ progressPercent: 100 })]), 50);
});

check('the online or locked schedule wins, else the first', () => {
  assert.strictEqual(pickSchedule([{ status: 'offline' }, { status: 'online' }])?.status, 'online');
  assert.strictEqual(pickSchedule([{ status: 'offline' }, { status: 'locked' }])?.status, 'locked');
  assert.strictEqual(pickSchedule([{ status: 'offline' }])?.status, 'offline');
  assert.strictEqual(pickSchedule([]), undefined);
});

check('dates format without a UTC shift', () => {
  assert.strictEqual(formatDay('2026-11-03'), 'Tue 3 Nov 2026');
  assert.strictEqual(formatDateRange('2026-11-03', '2026-11-03'), 'Tue 3 Nov 2026');
  assert.strictEqual(formatDateRange('2026-11-03', '2026-12-14'), '3 Nov – 14 Dec 2026');
  assert.strictEqual(scheduleSpan([item({ startDate: '2026-03-02', endDate: '2026-11-20' })]), 'Mar 2026 – Nov 2026');
  assert.strictEqual(scheduleSpan([]), undefined);
});

check('variation status: only approved/rejected are decided', () => {
  const v = { id: '1', variationNumber: 'VO-1', name: 'Extra GPO', totalAmount: 0, status: 'sent' };
  assert.strictEqual(variationStatus(v).tone, 'waiting');
  assert.strictEqual(variationStatus({ ...v, status: 'approved' }).label, 'Approved');
  assert.strictEqual(variationStatus({ ...v, status: 'rejected' }).label, 'Declined');
});

check('selection status: confirmed, choice sent, or still to choose', () => {
  const s = { id: '1', name: 'Tapware', status: 'pending' };
  assert.strictEqual(selectionStatus({ ...s, options: [{}] }).tone, 'waiting');
  assert.strictEqual(selectionStatus({ ...s, options: [{ isSelectedByClient: true }] }).label, 'Your choice sent');
  assert.strictEqual(selectionStatus({ ...s, options: [{ approvedAt: '2026-10-01' }] }).label, 'Confirmed');
  assert.strictEqual(selectionStatus({ ...s, status: 'ordered' }).label, 'Confirmed');
});

check('invoice status: due date passing makes it overdue', () => {
  const inv = { id: '1', name: 'Claim 3', totalAmount: 100, status: 'sent', dueDate: '2026-10-30' };
  assert.strictEqual(invoiceStatus(inv, TODAY).label, 'Due');
  assert.strictEqual(invoiceStatus({ ...inv, dueDate: '2026-10-20' }, TODAY).label, 'Overdue');
  assert.strictEqual(invoiceStatus({ ...inv, status: 'partial' }, TODAY).label, 'Part paid');
  assert.strictEqual(invoiceStatus({ ...inv, status: 'paid', dueDate: '2026-01-01' }, TODAY).tone, 'done');
});

check('attention: only things waiting on the client, overdue first, then by date', () => {
  const list = buildAttention({
    variations: [
      { id: 'v1', variationNumber: 'VO-1', name: 'Decided', totalAmount: 0, status: 'approved' },
      { id: 'v2', variationNumber: 'VO-2', name: 'Skylight', totalAmount: 0, status: 'sent', approvalDeadline: '2026-11-05' },
    ],
    selections: [
      { id: 's1', name: 'Tapware', status: 'pending', options: [{}], deadline: '2026-10-28' },
      { id: 's2', name: 'Tiles', status: 'pending', options: [{ isSelectedByClient: true }] },
    ],
    invoices: [
      { id: 'i1', invoiceNumber: 'INV-7', name: 'Frame', totalAmount: 1, status: 'sent', dueDate: '2026-10-20' },
      { id: 'i2', name: 'Paid', totalAmount: 1, status: 'paid' },
    ],
  }, TODAY);
  assert.deepStrictEqual(list.map((a) => a.id), ['i1', 's1', 'v2']);
  assert.strictEqual(list[0].urgent, true);
  assert.strictEqual(list[0].detail, 'Progress claim overdue');
  assert.strictEqual(list[2].title, 'VO-2 · Skylight');
});

check('attention: undated items fall after dated ones, variations before selections', () => {
  const list = buildAttention({
    selections: [{ id: 's', name: 'Paint', status: 'pending' }],
    variations: [{ id: 'v', variationNumber: '', name: 'Fence', totalAmount: 0, status: 'sent' }],
    invoices: [{ id: 'i', name: 'Claim', totalAmount: 1, status: 'sent', dueDate: '2026-12-01' }],
  }, TODAY);
  assert.deepStrictEqual(list.map((a) => a.id), ['i', 'v', 's']);
  assert.strictEqual(list[1].title, 'Fence');
});

check('diary: photos from strings or objects, text fields only, newest first', () => {
  const entry = {
    id: 'e',
    title: 'Slab poured',
    entryDateTime: '2026-10-01T03:00:00Z',
    overallPhotos: ['/objects/a.jpg', { url: '/objects/b.jpg' }, { name: 'no-url' }],
    fieldValues: { Notes: 'Good pour', Crew: 4, Blank: '  ' },
  };
  assert.deepStrictEqual(diaryPhotoUrls(entry), ['/objects/a.jpg', '/objects/b.jpg']);
  assert.deepStrictEqual(diaryTextFields(entry), [['Notes', 'Good pour']]);
  const sorted = sortDiary([entry, { ...entry, id: 'later', entryDateTime: '2026-10-09T03:00:00Z' }]);
  assert.strictEqual(sorted[0].id, 'later');
});

check('gallery: filter, search, waiting first, "Everything else" last', () => {
  const rows = [
    { id: '1', name: 'Basin', status: 'pending', room: 'Ensuite', category: 'Plumbing', options: [{ approvedAt: '2026-01-01' }] },
    { id: '2', name: 'Tapware', status: 'pending', room: 'Ensuite', category: 'Plumbing', options: [{}] },
    { id: '3', name: 'Paint', status: 'pending', room: '', category: 'Finishes', options: [{ isSelectedByClient: true }] },
    { id: '4', name: 'Tiles', status: 'pending', room: 'Kitchen', category: 'Finishes', options: [{ name: 'Carrara' } as any] },
  ];
  const byRoom = buildSelectionGallery(rows, { filter: 'all', query: '', groupBy: 'room' });
  assert.deepStrictEqual(byRoom.map((g) => g.title), ['Ensuite', 'Kitchen', 'Everything else']);
  assert.deepStrictEqual(byRoom[0].data.map((s) => s.id), ['2', '1']);
  const toChoose = buildSelectionGallery(rows, { filter: 'to-choose', query: '', groupBy: 'category' });
  assert.deepStrictEqual(toChoose.flatMap((g) => g.data.map((s) => s.id)), ['4', '2']);
  // Search reaches option names.
  const carrara = buildSelectionGallery(rows, { filter: 'all', query: 'carrara', groupBy: 'room' });
  assert.deepStrictEqual(carrara.flatMap((g) => g.data.map((s) => s.id)), ['4']);
  assert.strictEqual(selectionFilterOf(rows[2]), 'sent');
});

check('a client can choose until the builder confirms, unless changes are switched off', () => {
  const s = { id: '1', name: 'Tapware', status: 'pending', options: [{}] };
  assert.strictEqual(canClientChoose(s), true);
  assert.strictEqual(canClientChoose({ ...s, options: [{ isSelectedByClient: true }] }), true);
  assert.strictEqual(canClientChoose({ ...s, options: [{ approvedAt: '2026-01-01' }] }), false);
  assert.strictEqual(canClientChoose({ ...s, clientCanChange: false }), false);
});

check('variations: waiting first, newest sent first, search by number', () => {
  const vs = [
    { id: 'a', variationNumber: 'VO-1', name: 'Fence', totalAmount: 10000, status: 'approved', portalSentAt: '2026-09-01' },
    { id: 'b', variationNumber: 'VO-2', name: 'Skylight', totalAmount: 250000, status: 'sent', portalSentAt: '2026-10-01' },
    { id: 'c', variationNumber: 'VO-3', name: 'Tiles', totalAmount: 5000, status: 'sent', portalSentAt: '2026-10-10' },
    { id: 'd', variationNumber: 'VO-4', name: 'Paint', totalAmount: 7000, status: 'rejected', portalSentAt: '2026-10-12' },
  ];
  const groups = groupVariations(vs);
  assert.deepStrictEqual(groups.map((g) => g.title), ['Waiting on you', 'Decided']);
  assert.deepStrictEqual(groups[0].data.map((v) => v.id), ['c', 'b']);
  assert.deepStrictEqual(groups[1].data.map((v) => v.id), ['d', 'a']);
  assert.deepStrictEqual(groupVariations(vs, 'vo-1').flatMap((g) => g.data.map((v) => v.id)), ['a']);
  assert.strictEqual(approvedVariationTotal(vs), 10000);
});

check('days changed reads as a signed count of working days', () => {
  assert.strictEqual(formatDaysChanged(3), '+3 working days');
  assert.strictEqual(formatDaysChanged(-1), '−1 working day');
  assert.strictEqual(formatDaysChanged(0), null);
  assert.strictEqual(formatDaysChanged(null), null);
});

check('claims: overdue first, then by due date; paid last, newest first', () => {
  const inv = [
    { id: 'p1', name: 'Slab', totalAmount: 100, status: 'paid', invoiceDate: '2026-06-01' },
    { id: 'p2', name: 'Frame', totalAmount: 100, status: 'paid', invoiceDate: '2026-08-01' },
    { id: 'd1', name: 'Lockup', totalAmount: 500, balanceAmount: 500, status: 'sent', dueDate: '2026-11-20' },
    { id: 'o1', name: 'Roof', totalAmount: 300, balanceAmount: 200, status: 'partial', dueDate: '2026-10-01' },
    { id: 'd2', name: 'Fixing', totalAmount: 400, status: 'sent', dueDate: '2026-11-05' },
  ];
  const groups = groupInvoices(inv, TODAY);
  assert.deepStrictEqual(groups.map((g) => g.title), ['To pay', 'Paid']);
  assert.deepStrictEqual(groups[0].data.map((i) => i.id), ['o1', 'd2', 'd1']);
  assert.deepStrictEqual(groups[1].data.map((i) => i.id), ['p2', 'p1']);
  // Balance where there is one, the total where there isn't, paid excluded.
  assert.strictEqual(outstandingBalance(inv), 200 + 500 + 400);
});

check('notification taps route to client screens', () => {
  assert.deepStrictEqual(resolveClientNotificationTarget({ link: '/projects/p1/selections/s9' }), { screen: 'ClientSelectionDetail', params: { selectionId: 's9' } });
  assert.deepStrictEqual(resolveClientNotificationTarget({ link: '/projects/p1/variations/v2?tab=x' }), { screen: 'ClientVariationDetail', params: { variationId: 'v2' } });
  assert.deepStrictEqual(resolveClientNotificationTarget({ link: '/projects/p1/client-invoices/i3' }), { screen: 'ClientInvoiceDetail', params: { invoiceId: 'i3' } });
  assert.deepStrictEqual(resolveClientNotificationTarget({ link: '/messages?channel=c%2F1' }), { screen: 'ClientMessageThread', params: { channelId: 'c/1' } });
  assert.deepStrictEqual(resolveClientNotificationTarget({ entityType: 'message', entityId: 'c2' }), { screen: 'ClientMessageThread', params: { channelId: 'c2' } });
  assert.deepStrictEqual(resolveClientNotificationTarget({ entityType: 'variation', entityId: 'v5' }), { screen: 'ClientVariationDetail', params: { variationId: 'v5' } });
  assert.deepStrictEqual(resolveClientNotificationTarget({ link: '/timesheets' }), { screen: 'ClientRoot' });
  assert.deepStrictEqual(resolveClientNotificationTarget(null), { screen: 'ClientRoot' });
});

console.log(`\nclientPortal: ${passed} passed`);
