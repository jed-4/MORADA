/**
 * Daily site report: which day, and no money.
 *
 * Run (no database needed):
 *   PDF_FONT_DIR="$PWD/client/public/fonts" npx tsx server/__tests__/daily-report.test.ts
 *
 * Deliberately run with the APP's tsconfig, not tsconfig.pdfrender.json: the
 * server renders this document in production through the classic
 * React.createElement transform, so the test does too, with the same
 * globalThis.React shim server/dailyReport.ts installs.
 */
import assert from "node:assert";
import React from "react";
import sharp from "sharp";
import {
  activeScheduleRows,
  buildCrewRows,
  defectsForDay,
  entryPhotoPaths,
  isReportDate,
  localDayOf,
  localDayWindow,
  photoObjectPath,
  reportEntry,
  splitWorkDone,
  utcDayWindow,
  type DailyReportModel,
} from "../../shared/dailyReport";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

const SYD = "Australia/Sydney";
const PERTH = "Australia/Perth";

async function main() {
  console.log("date window");

  await check("dates are validated as real calendar days", () => {
    assert.ok(isReportDate("2026-11-19"));
    assert.ok(!isReportDate("2026-02-30"));
    assert.ok(!isReportDate("19/11/2026"));
    assert.ok(!isReportDate(undefined));
  });

  await check("a Sydney day in summer starts at 13:00Z the day before (AEDT +11)", () => {
    const w = localDayWindow("2026-11-19", SYD);
    assert.equal(w.start.toISOString(), "2026-11-18T13:00:00.000Z");
    assert.equal(w.end.toISOString(), "2026-11-19T13:00:00.000Z");
  });

  await check("a Sydney day in winter starts at 14:00Z (AEST +10)", () => {
    const w = localDayWindow("2026-07-01", SYD);
    assert.equal(w.start.toISOString(), "2026-06-30T14:00:00.000Z");
  });

  await check("the DST-change day is 23 hours long, and still windowed right", () => {
    // Sydney clocks go forward on Sun 4 Oct 2026.
    const w = localDayWindow("2026-10-04", SYD);
    assert.equal(w.start.toISOString(), "2026-10-03T14:00:00.000Z");
    assert.equal(w.end.toISOString(), "2026-10-04T13:00:00.000Z");
    assert.equal((w.end.getTime() - w.start.getTime()) / 3600000, 23);
  });

  await check("an 8am Sydney entry belongs to that Sydney day, not the UTC day before", () => {
    const eightAm = new Date("2026-11-18T21:00:00.000Z"); // 8am 19 Nov AEDT
    assert.equal(localDayOf(eightAm, SYD), "2026-11-19");
    assert.equal(eightAm.toISOString().slice(0, 10), "2026-11-18"); // what DATE() would say
    assert.equal(localDayOf(eightAm, PERTH), "2026-11-19");
  });

  await check("timesheets use the UTC date part (stored as UTC midnight of the local day)", () => {
    const w = utcDayWindow("2026-11-19");
    assert.equal(w.start.toISOString(), "2026-11-19T00:00:00.000Z");
    assert.equal(w.end.toISOString(), "2026-11-20T00:00:00.000Z");
  });

  console.log("crew: names and hours only");

  const sheets = [
    { userId: "u1", date: new Date("2026-11-19T00:00:00Z"), duration: "7.50", status: "approved", hourlyRate: "95.00", total: "712.50" },
    { userId: "u1", date: new Date("2026-11-19T00:00:00Z"), duration: "1.00", status: "submitted", hourlyRate: "95.00", total: "95.00" },
    { userId: "u2", date: new Date("2026-11-19T00:00:00Z"), duration: "8", status: "submitted", hourlyRate: "120.00", total: "960.00" },
    { userId: "u3", date: new Date("2026-11-19T00:00:00Z"), duration: "6", status: "rejected", hourlyRate: "50", total: "300" },
    { userId: "u4", date: new Date("2026-11-18T00:00:00Z"), duration: "9", status: "approved", hourlyRate: "50", total: "450" },
  ];
  const names = new Map([["u1", "Kye Builder"], ["u2", "Sam Sparky"], ["u3", "Rejected Person"], ["u4", "Yesterday Person"]]);
  const crew = buildCrewRows(sheets, names, "2026-11-19");

  await check("hours are summed per person, rejected and other days dropped", () => {
    assert.deepEqual(crew, [
      { name: "Kye Builder", hours: 8.5 },
      { name: "Sam Sparky", hours: 8 },
    ]);
  });

  await check("crew rows carry no rate, no total — only name and hours", () => {
    for (const row of crew) assert.deepEqual(Object.keys(row).sort(), ["hours", "name"]);
    const json = JSON.stringify(crew);
    for (const leaked of ["95", "712", "120", "960", "hourlyRate", "total"]) {
      assert.ok(!json.includes(leaked), `crew JSON leaked ${leaked}: ${json}`);
    }
  });

  await check("an unnamed user prints as 'Team member', never an email", () => {
    const rows = buildCrewRows([{ userId: "x", date: "2026-11-19T00:00:00Z", duration: "2" }], new Map(), "2026-11-19");
    assert.equal(rows[0].name, "Team member");
  });

  console.log("schedule, defects, diary");

  await check("schedule: items covering the day, no stages, no cancelled, no invoice points", () => {
    const rows = activeScheduleRows([
      { id: "stage", name: "Framing stage", startDate: "2026-11-17T00:00:00Z", endDate: "2026-11-21T00:00:00Z" },
      { id: "a", name: "Wall frames", parentItemId: "stage", startDate: "2026-11-17T00:00:00Z", endDate: "2026-11-20T00:00:00Z", progressPercent: 40, assignedToName: "Chippy Co" },
      { id: "b", name: "Roof trusses", startDate: "2026-11-20T00:00:00Z", endDate: "2026-11-21T00:00:00Z" },
      { id: "c", name: "Cancelled thing", status: "cancelled", startDate: "2026-11-19T00:00:00Z", endDate: "2026-11-19T00:00:00Z" },
      { id: "d", name: "Claim 3", type: "invoice", startDate: "2026-11-19T00:00:00Z", endDate: "2026-11-19T00:00:00Z" },
      { id: "e", name: "Inspection", startDate: "2026-11-19T00:00:00Z", endDate: "2026-11-19T00:00:00Z", status: "completed" },
    ], "2026-11-19");
    assert.deepEqual(rows.map((r) => r.name), ["Wall frames", "Inspection"]);
    assert.equal(rows[0].detail, "Chippy Co · 40% complete");
    assert.equal(rows[1].detail, "Completed");
  });

  await check("defects raised / closed by the local day", () => {
    const { raised, closed } = defectsForDay([
      { title: "Chipped tile", location: "Ensuite", dateIdentified: "2026-11-18T22:30:00Z" }, // 9:30am 19th
      { title: "Door sticks", dateIdentified: "2026-11-10T00:00:00Z", dateResolved: "2026-11-19T05:00:00Z" },
      { title: "Late last night", dateIdentified: "2026-11-18T12:59:00Z" }, // 11:59pm 18th
    ], "2026-11-19", SYD);
    assert.deepEqual(raised, [{ title: "Chipped tile", location: "Ensuite" }]);
    assert.deepEqual(closed, [{ title: "Door sticks", location: null }]);
  });

  await check("photo paths from every stored shape; documents and other hosts ignored", () => {
    assert.equal(photoObjectPath("/objects/uploads/a"), "/objects/uploads/a");
    assert.equal(photoObjectPath({ objectPath: "/objects/uploads/b", contentType: "image/jpeg" }), "/objects/uploads/b");
    assert.equal(photoObjectPath({ objectPath: "/objects/uploads/c.pdf", contentType: "application/pdf" }), null);
    assert.equal(photoObjectPath(`https://x.test/api/uploads/serve/${encodeURIComponent("/objects/uploads/d")}`), "/objects/uploads/d");
    assert.equal(photoObjectPath("https://evil.example/x.jpg"), null);
    assert.deepEqual(
      entryPhotoPaths({
        id: "e", title: "t", entryDateTime: new Date(),
        overallPhotos: ["/objects/uploads/1", "/objects/uploads/1"],
        fieldValues: { f1: [{ objectPath: "/objects/uploads/2", contentType: "image/png" }], notes: "hello" },
      }),
      ["/objects/uploads/1", "/objects/uploads/2"],
    );
  });

  await check("entry fields follow the template; 'work done' is lifted out", () => {
    const entry = reportEntry(
      {
        id: "e1", title: "Morning", entryDateTime: "2026-11-18T21:15:00Z", createdByName: "Kye",
        fieldValues: { a: "Stood wall frames on the north side", b: "Delivery of trusses", c: true, p: [{ objectPath: "/objects/uploads/x" }] },
      },
      [
        { id: "b", title: "Deliveries", type: "text", order: 2 },
        { id: "a", title: "Work completed", type: "textarea", order: 1 },
        { id: "c", title: "Site secured", type: "checkbox", order: 3 },
        { id: "p", title: "Photos", type: "photo-gallery", order: 4 },
      ],
      SYD,
    );
    assert.equal(entry.time, "8:15 am");
    assert.deepEqual(entry.fields.map((f) => f.label), ["Work completed", "Deliveries", "Site secured"]);
    const split = splitWorkDone([entry]);
    assert.deepEqual(split.workDone, ["Stood wall frames on the north side"]);
    assert.deepEqual(split.entries[0].fields.map((f) => f.label), ["Deliveries", "Site secured"]);
  });

  console.log("render");

  await check("renders a PDF with crew hours and no dollar figures", async () => {
    (globalThis as any).React ??= React;
    const { DailyReportDocument } = await import("../../client/src/components/site-diary/pdf/DailyReportDocument");
    const { renderToBuffer } = await import("@react-pdf/renderer");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const jpg = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#87749A" } }).jpeg().toBuffer();
    const src = `data:image/jpeg;base64,${jpg.toString("base64")}`;
    const model: DailyReportModel = {
      date: "2026-11-19",
      dateLabel: "Thursday 19 November 2026",
      company: { name: "Harbour Homes", logoSrc: null, brandColor: "#2E6B5E", variant: "brand", contactLines: ["1 Builder St", "02 9000 0000"] },
      project: { name: "12 Example Avenue", address: "12 Example Avenue, Sometown NSW", clientName: "Alex Client" },
      weather: "Sunny, 24°C",
      workDone: ["Stood wall frames on the north side"],
      entries: [{ title: "Morning", time: "8:15 am", author: "Kye", fields: [{ label: "Deliveries", value: "Trusses" }] }],
      crew,
      crewTotalHours: 16.5,
      schedule: [{ name: "Wall frames", detail: "40% complete" }],
      defectsRaised: [{ title: "Chipped tile", location: "Ensuite" }],
      defectsClosed: [],
      photos: Array.from({ length: 12 }, () => ({ src })),
      morePhotos: 3,
    };
    const buf = await renderToBuffer(React.createElement(DailyReportDocument, { model }) as any);
    if (process.env.DAILY_REPORT_OUT) (await import("node:fs")).writeFileSync(process.env.DAILY_REPORT_OUT, buf);
    assert.ok(buf.length > 1000);
    const pdf = await getDocument({ data: new Uint8Array(buf) }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const c = await page.getTextContent();
      text += " " + c.items.map((it: any) => it.str).join(" ");
    }
    text = text.replace(/\s+/g, " ").replace(/\+ (\d)/g, "+$1");
    for (const want of ["12 Example Avenue", "Kye Builder", "8.5 h", "Sam Sparky", "Wall frames", "Chipped tile", "+3 more photos", "Sunny, 24°C", "Stood wall frames"]) {
      assert.ok(text.includes(want), `missing "${want}" in: ${text}`);
    }
    assert.ok(!text.includes("$"), `a dollar figure reached the PDF: ${text}`);
    assert.equal(pdf.numPages, 1, "a normal day should fit on one page");
    console.log(`    (${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}, ${Math.round(buf.length / 1024)}KB)`);
  });

  console.log(`\n${passed} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
