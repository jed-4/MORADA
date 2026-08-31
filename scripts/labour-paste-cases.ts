/**
 * Cases for the labour clipboard parser.
 *
 *   npx tsx scripts/labour-paste-cases.ts
 *
 * The project has no test runner, so this follows the same shape as
 * calendar-fingerprint.ts: a runnable script that fails loudly. The inputs are
 * literal clipboard payloads — real tabs, real CRLFs, real Excel quoting —
 * because every bug this parser can have lives in that formatting, not in the
 * logic on top of it.
 */
import { parseLabourPaste, type ParsedLabourRow } from "../client/src/lib/parseLabourPaste";

let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { console.log(`  ok   ${name}`); return; }
  failed++;
  console.log(`  FAIL ${name}\n         expected ${e}\n         actual   ${a}`);
}

const rows = (text: string): ParsedLabourRow[] => parseLabourPaste(text).rows;

// ── The case Jed described: 3 columns, several rows, straight out of Excel ──
check(
  "3 columns × 4 rows",
  rows("Set out & profiles\t2\t6\nBearers and joists\t3\t8\nFloor sheeting\t2\t5.5\nFrame walls\t4\t16"),
  [
    { description: "Set out & profiles", numMen: 2, hoursPerMan: 6 },
    { description: "Bearers and joists", numMen: 3, hoursPerMan: 8 },
    { description: "Floor sheeting", numMen: 2, hoursPerMan: 5.5 },
    { description: "Frame walls", numMen: 4, hoursPerMan: 16 },
  ],
);

// ── Excel on Windows ends rows with CRLF ──
check(
  "CRLF line endings",
  rows("Strip footings\t2\t7\r\nPour slab\t4\t9\r\n"),
  [
    { description: "Strip footings", numMen: 2, hoursPerMan: 7 },
    { description: "Pour slab", numMen: 4, hoursPerMan: 9 },
  ],
);

// ── A header row comes along when you drag from the top of the sheet ──
{
  const r = parseLabourPaste("Description\tNo. Men\tHrs / Man\nHang doors\t1\t4");
  check("header row dropped", r.rows, [{ description: "Hang doors", numMen: 1, hoursPerMan: 4 }]);
  check("header row reported", r.skippedHeader, true);
}
check(
  "re-labelled header still caught",
  rows("Activity\tCrew\tHours\nSand floors\t2\t6"),
  [{ description: "Sand floors", numMen: 2, hoursPerMan: 6 }],
);
check(
  "a real first row is NOT eaten as a header",
  rows("Description of works\t2\t6\nSecond task\t1\t2"),
  [
    { description: "Description of works", numMen: 2, hoursPerMan: 6 },
    { description: "Second task", numMen: 1, hoursPerMan: 2 },
  ],
);

// ── Selecting whole columns drags a long empty tail with it ──
{
  const r = parseLabourPaste("Rake and level\t2\t4\n\t\t\n\t\t\n\t\t");
  check("blank tail dropped", r.rows, [{ description: "Rake and level", numMen: 2, hoursPerMan: 4 }]);
  check("blank tail not counted as data", r.skippedBlank, 0);
}
check(
  "orphan numbers with no description are dropped",
  parseLabourPaste("Task A\t1\t2\n\t5\t9").skippedBlank,
  1,
);

// ── Quoting: Excel quotes any cell holding a tab, newline or quote ──
check(
  "quoted cell containing a comma and a tab",
  rows('"Frame, brace\tand line"\t3\t12'),
  [{ description: "Frame, brace\tand line", numMen: 3, hoursPerMan: 12 }],
);
check(
  "quoted cell containing a newline",
  rows('"Install trusses\nincluding bracing"\t4\t10'),
  [{ description: "Install trusses\nincluding bracing", numMen: 4, hoursPerMan: 10 }],
);
check(
  'escaped "" becomes one quote',
  rows('"90"" wall framing"\t2\t8'),
  [{ description: '90" wall framing', numMen: 2, hoursPerMan: 8 }],
);

// ── Numbers as they actually arrive ──
check(
  "currency and thousands separators stripped",
  rows("Big job\t2\t1,200.50"),
  [{ description: "Big job", numMen: 2, hoursPerMan: 1200.5 }],
);
check(
  "blank crew defaults to one, blank hours to zero",
  rows("Clean up\t\t\nMake good\t\t3"),
  [
    { description: "Clean up", numMen: 1, hoursPerMan: 0 },
    { description: "Make good", numMen: 1, hoursPerMan: 3 },
  ],
);
check(
  "non-numeric figures fall back rather than writing NaN",
  rows("Odd row\tTBC\tn/a"),
  [{ description: "Odd row", numMen: 1, hoursPerMan: 0 }],
);

// ── Narrower and wider selections ──
check(
  "one column is a list of task names",
  rows("First fix\nSecond fix\nFinal fix"),
  [
    { description: "First fix", numMen: 1, hoursPerMan: 0 },
    { description: "Second fix", numMen: 1, hoursPerMan: 0 },
    { description: "Final fix", numMen: 1, hoursPerMan: 0 },
  ],
);
{
  const r = parseLabourPaste("Fix skirting\t2\t4\t8\t$450\nHang doors\t1\t3\t3\t$120");
  check("extra columns ignored", r.rows, [
    { description: "Fix skirting", numMen: 2, hoursPerMan: 4 },
    { description: "Hang doors", numMen: 1, hoursPerMan: 3 },
  ]);
  check("extra columns reported, not swallowed", r.extraColumns, 2);
}

// ── Nothing in, nothing out ──
check("empty string", rows(""), []);
check("whitespace only", rows("   \n  \n"), []);

// ── The parser must not invent totals; the grid computes them ──
check(
  "totalHours is not a parsed field",
  Object.keys(rows("A\t2\t3")[0]),
  ["description", "numMen", "hoursPerMan"],
);

if (failed) {
  console.log(`\n${failed} case(s) failed.`);
  process.exit(1);
}
console.log("\nAll labour paste cases pass.");
