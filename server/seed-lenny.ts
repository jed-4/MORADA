import { db } from "./db";
import {
  contacts,
  projects,
  estimates,
  estimateGroups,
  estimateItems,
  variations,
  variationItems,
  clientInvoices,
  invoiceEstimates,
  invoiceVariations,
  invoiceAllowances,
  clientInvoicePayments,
  bills,
  billLineItems,
  notes,
  schedules,
  scheduleItems,
  siteDiaryTemplates,
  siteDiaryEntries,
} from "../shared/schema";
import { eq, and } from "drizzle-orm";

const SENTINEL_PROJECT_NAME = "Irwin Wildlife Compound Reno";

export async function isDemoSeeded(companyId: string): Promise<boolean> {
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.companyId, companyId), eq(projects.name, SENTINEL_PROJECT_NAME)))
    .limit(1);
  return existing.length > 0;
}

export async function seedLennyDemo(companyId: string, userId: string) {
  // Idempotency check
  if (await isDemoSeeded(companyId)) {
    return { skipped: true, message: "Demo data already seeded" };
  }

  // ─── 1. CONTACTS ───────────────────────────────────────────────────────────

  const [steveIrwin] = await db.insert(contacts).values({
    companyId,
    name: "Steve & Terri Irwin",
    firstName: "Steve",
    lastName: "Irwin",
    spouseName: "Terri Irwin",
    phone: "07 5494 1200",
    contactType: "client",
    addressStreet: "1 Beerwah Rd",
    addressCity: "Beerwah",
    addressState: "QLD",
    addressPostcode: "4519",
    addressCountry: "Australia",
    notes: "Wildlife enthusiasts. Prefer early morning site meetings. Bring snacks — no snakes.",
    avatarColor: "#16a34a",
  }).returning();

  const [dameEdna] = await db.insert(contacts).values({
    companyId,
    name: "Dame Edna Everage",
    firstName: "Edna",
    lastName: "Everage",
    phone: "03 9370 5555",
    contactType: "client",
    addressStreet: "36 Moonee St",
    addressCity: "Moonee Ponds",
    addressState: "VIC",
    addressPostcode: "3039",
    addressCountry: "Australia",
    notes: "Very particular about her gladioli. Prefers purple fixtures. Call her 'Dame'.",
    avatarColor: "#9333ea",
  }).returning();

  const [mickDundee] = await db.insert(contacts).values({
    companyId,
    name: "Mick & Linda Dundee",
    firstName: "Mick",
    lastName: "Dundee",
    spouseName: "Linda Kozlowski",
    phone: "08 8976 0001",
    mobile: "0411 222 333",
    contactType: "client",
    addressStreet: "1 Walkabout Creek Hotel",
    addressCity: "McKinlay",
    addressState: "NT",
    addressPostcode: "0851",
    addressCountry: "Australia",
    notes: "That's not a renovation. THIS is a renovation. Loves a good yarn. Site meetings at the pub.",
    avatarColor: "#b45309",
  }).returning();

  const [paulHogan] = await db.insert(contacts).values({
    companyId,
    name: "Paul Hogan's Plumbing Co",
    contactType: "supplier",
    abn: "11 222 333 444",
    phone: "02 9555 0001",
    notes: "Crocodile Dundee of plumbers. That's not a pipe — THIS is a pipe.",
    avatarColor: "#b45309",
  }).returning();

  const [kylieMinogue] = await db.insert(contacts).values({
    companyId,
    name: "Kylie Minogue Kitchens & Bathrooms",
    contactType: "supplier",
    abn: "22 333 444 555",
    phone: "03 9555 0002",
    notes: "Can't get their showroom out of your head. 8-week lead time on cabinetry.",
    avatarColor: "#db2777",
  }).returning();

  const [keithUrban] = await db.insert(contacts).values({
    companyId,
    name: "Keith Urban Underfloor Heating",
    contactType: "supplier",
    abn: "33 444 555 666",
    phone: "07 5555 0003",
    notes: "Radiant heat specialists. They'll warm your floors and your heart.",
    avatarColor: "#d97706",
  }).returning();

  const [hughJackman] = await db.insert(contacts).values({
    companyId,
    name: "Hugh Jackman Joinery & Cabinetry",
    contactType: "supplier",
    abn: "44 555 666 777",
    phone: "02 9555 0004",
    notes: "Wolverine-grade timber work. Claws optional. Lead time 6 weeks.",
    avatarColor: "#7c3aed",
  }).returning();

  const [mrSquiggle] = await db.insert(contacts).values({
    companyId,
    name: "Mr Squiggle Glass & Aluminium",
    contactType: "supplier",
    abn: "55 666 777 888",
    phone: "02 9555 0005",
    addressStreet: "1 Blackboard St",
    addressCity: "Sydney",
    addressState: "NSW",
    addressPostcode: "2000",
    addressCountry: "Australia",
    notes: "Upside down! Upside down! Great custom glazing, but reads drawings upside down. Double-check every order.",
    avatarColor: "#0891b2",
  }).returning();

  const [blueysBuilding] = await db.insert(contacts).values({
    companyId,
    name: "Bluey's Building Supplies Pty Ltd",
    contactType: "supplier",
    abn: "66 777 888 999",
    phone: "07 3555 0006",
    notes: "Best in Brisbane. Good prices on timber and fixings. Dog-friendly yard.",
    avatarColor: "#2563eb",
  }).returning();

  const [alfStewart] = await db.insert(contacts).values({
    companyId,
    name: "Alf Stewart Plumbing & Drainage",
    contactType: "supplier",
    abn: "77 888 999 111",
    phone: "02 9555 0007",
    addressStreet: "88 Summer Bay Rd",
    addressCity: "Palm Beach",
    addressState: "NSW",
    addressPostcode: "2108",
    addressCountry: "Australia",
    notes: "Flamin' hell, the drains are blocked! Reliable as Summer Bay sunsets. Won't stop talking about the old days.",
    avatarColor: "#ea580c",
  }).returning();

  const [chopperRead] = await db.insert(contacts).values({
    companyId,
    name: "Chopper Read's Concrete & Intimidation",
    contactType: "trade",
    abn: "88 999 000 111",
    phone: "03 9555 0008",
    addressStreet: "45 Collingwood Rd",
    addressCity: "Collingwood",
    addressState: "VIC",
    addressPostcode: "3066",
    addressCountry: "Australia",
    notes: "Don't argue with the mix design. Excellent finish, impeccable slabs. Has ears, somehow.",
    avatarColor: "#dc2626",
  }).returning();

  const [russellCoight] = await db.insert(contacts).values({
    companyId,
    name: "Russell Coight's Handyman Services",
    contactType: "trade",
    abn: "99 000 111 222",
    phone: "08 9555 0009",
    addressStreet: "2 Outback Way",
    addressCity: "Darwin",
    addressState: "NT",
    addressPostcode: "0800",
    addressCountry: "Australia",
    notes: "She'll be right. Everything eventually gets done. Mostly. Don't lend him power tools.",
    avatarColor: "#16a34a",
  }).returning();

  const [chrisHemsworth] = await db.insert(contacts).values({
    companyId,
    name: "Chris Hemsworth Electrical Services",
    contactType: "trade",
    abn: "10 111 222 333",
    phone: "07 5555 0010",
    notes: "Thor-oughly reliable. Byron Bay based. Renewables specialist.",
    avatarColor: "#1d4ed8",
  }).returning();

  const [captainFeathersword] = await db.insert(contacts).values({
    companyId,
    name: "Captain Feathersword Excavations Pty Ltd",
    contactType: "trade",
    abn: "12 345 678 901",
    phone: "07 5555 0011",
    addressStreet: "1 Pirate Cove",
    addressCity: "Gold Coast",
    addressState: "QLD",
    addressPostcode: "4217",
    addressCountry: "Australia",
    notes: "Ahoy! Digs a great trench. Always cheerful on site. Watch out for the feathersword during inductions.",
    avatarColor: "#7c3aed",
  }).returning();

  // ─── 2. PROJECT 1: IRWIN WILDLIFE COMPOUND RENO ───────────────────────────

  const [proj1] = await db.insert(projects).values({
    name: SENTINEL_PROJECT_NAME,
    description: "Major renovation and extension of the Irwin family's wildlife compound at Beerwah. Includes new education centre, upgraded animal enclosures, staff amenities and external landscaping.",
    constructionNumber: "4501",
    color: "#16a34a",
    icon: "Building2",
    location: "1 Beerwah Rd, Beerwah QLD 4519",
    projectStatus: "construction",
    projectSubStatus: "construction_in_progress",
    currentSystemPhase: "construction",
    status: "active",
    invoicingMethod: "progress_payments",
    clientId: steveIrwin.id,
    companyId,
    ownerId: userId,
    proposedStartDate: "2025-03-01",
    proposedEndDate: "2025-10-31",
    contractCost: 42350000, // $423,500 incl GST in cents
  }).returning();

  // Estimate
  const [est1] = await db.insert(estimates).values({
    name: "Irwin Reno — Approved Estimate",
    projectId: proj1.id,
    status: "approved",
    isLocked: true,
    taxRate: 10,
    ownerId: userId,
  }).returning();

  // Estimate groups
  const [grp1a] = await db.insert(estimateGroups).values({ estimateId: est1.id, name: "Demolition & Preparation", order: 0 }).returning();
  const [grp1b] = await db.insert(estimateGroups).values({ estimateId: est1.id, name: "Framing & Structure", order: 1 }).returning();
  const [grp1c] = await db.insert(estimateGroups).values({ estimateId: est1.id, name: "Fit-Out", order: 2 }).returning();
  const [grp1d] = await db.insert(estimateGroups).values({ estimateId: est1.id, name: "External Works", order: 3 }).returning();

  // Demolition items
  await db.insert(estimateItems).values([
    { estimateId: est1.id, groupId: grp1a.id, name: "Demolition & strip-out", type: "Subcontractor", quantity: 1, unitCostExTax: 12500, taxAmount: 1250, priceIncTax: 13750, order: 0 },
    { estimateId: est1.id, groupId: grp1a.id, name: "Asbestos removal & disposal", type: "Subcontractor", quantity: 1, unitCostExTax: 8800, taxAmount: 880, priceIncTax: 9680, order: 1 },
    { estimateId: est1.id, groupId: grp1a.id, name: "Site prep & earthworks", type: "Subcontractor", quantity: 1, unitCostExTax: 22000, taxAmount: 2200, priceIncTax: 24200, order: 2 },
  ]);

  // Framing items
  await db.insert(estimateItems).values([
    { estimateId: est1.id, groupId: grp1b.id, name: "Concrete slab", type: "Subcontractor", quantity: 1, unitCostExTax: 38500, taxAmount: 3850, priceIncTax: 42350, order: 0 },
    { estimateId: est1.id, groupId: grp1b.id, name: "Timber frame supply & erect", type: "Subcontractor", quantity: 1, unitCostExTax: 52000, taxAmount: 5200, priceIncTax: 57200, order: 1 },
    { estimateId: est1.id, groupId: grp1b.id, name: "Roof structure & sheeting", type: "Subcontractor", quantity: 1, unitCostExTax: 34000, taxAmount: 3400, priceIncTax: 37400, order: 2 },
  ]);

  // Fit-Out items
  const [floorTilesItem] = await db.insert(estimateItems).values({
    estimateId: est1.id, groupId: grp1c.id, name: "Floor Tiles PC", type: "Material",
    allowance: "Prime Cost", allowanceStatus: "finalized",
    quantity: 1, unitCostExTax: 12000, taxAmount: 1200, priceIncTax: 13200, order: 0,
  }).returning();

  const [appliancesItem] = await db.insert(estimateItems).values({
    estimateId: est1.id, groupId: grp1c.id, name: "Kitchen Appliances PC", type: "Material",
    allowance: "Prime Cost", allowanceStatus: "pending",
    quantity: 1, unitCostExTax: 18000, taxAmount: 1800, priceIncTax: 19800, order: 1,
  }).returning();

  await db.insert(estimateItems).values([
    { estimateId: est1.id, groupId: grp1c.id, name: "Joinery & cabinetry", type: "Subcontractor", quantity: 1, unitCostExTax: 45000, taxAmount: 4500, priceIncTax: 49500, order: 2 },
    { estimateId: est1.id, groupId: grp1c.id, name: "Plumbing rough-in & fit-off", type: "Subcontractor", quantity: 1, unitCostExTax: 28000, taxAmount: 2800, priceIncTax: 30800, order: 3 },
    { estimateId: est1.id, groupId: grp1c.id, name: "Electrical rough-in & fit-off", type: "Subcontractor", quantity: 1, unitCostExTax: 24000, taxAmount: 2400, priceIncTax: 26400, order: 4 },
    { estimateId: est1.id, groupId: grp1c.id, name: "Painting & decorating", type: "Subcontractor", quantity: 1, unitCostExTax: 18500, taxAmount: 1850, priceIncTax: 20350, order: 5 },
  ]);

  // External items
  await db.insert(estimateItems).values([
    { estimateId: est1.id, groupId: grp1d.id, name: "External decking", type: "Subcontractor", quantity: 1, unitCostExTax: 22000, taxAmount: 2200, priceIncTax: 24200, order: 0 },
    { estimateId: est1.id, groupId: grp1d.id, name: "Fencing & gates", type: "Subcontractor", quantity: 1, unitCostExTax: 14500, taxAmount: 1450, priceIncTax: 15950, order: 1 },
    { estimateId: est1.id, groupId: grp1d.id, name: "Landscaping & drainage", type: "Subcontractor", quantity: 1, unitCostExTax: 16000, taxAmount: 1600, priceIncTax: 17600, order: 2 },
  ]);

  // Variations
  const [var1] = await db.insert(variations).values({
    variationNumber: "VAR-001",
    projectId: proj1.id,
    name: "Additional Decking Extension",
    status: "approved",
    subtotal: 772700,
    gstAmount: 77270,
    totalAmount: 850000,
    paidAmount: 0,
    balanceAmount: 850000,
    approvedDate: new Date("2025-05-15"),
  }).returning();

  await db.insert(variationItems).values({
    variationId: var1.id,
    description: "Extend rear deck by 18m² using spotted gum hardwood",
    quantity: 18,
    unitPrice: 42928,
    totalPrice: 772700,
    sortOrder: 0,
  });

  const [var2] = await db.insert(variations).values({
    variationNumber: "VAR-002",
    projectId: proj1.id,
    name: "Plumbing Relocation — Education Centre",
    status: "pending",
    subtotal: 381800,
    gstAmount: 38200,
    totalAmount: 420000,
    paidAmount: 0,
    balanceAmount: 420000,
  }).returning();

  await db.insert(variationItems).values({
    variationId: var2.id,
    description: "Relocate main stack and wet area drain points to suit revised floor plan",
    quantity: 1,
    unitPrice: 381800,
    totalPrice: 381800,
    sortOrder: 0,
  });

  const [var3] = await db.insert(variations).values({
    variationNumber: "VAR-003",
    projectId: proj1.id,
    name: "Additional Lighting Points",
    status: "approved",
    subtotal: 254500,
    gstAmount: 25500,
    totalAmount: 280000,
    paidAmount: 0,
    balanceAmount: 280000,
    approvedDate: new Date("2025-06-01"),
  }).returning();

  await db.insert(variationItems).values({
    variationId: var3.id,
    description: "Supply and install 8x additional LED downlights in education centre",
    quantity: 8,
    unitPrice: 31813,
    totalPrice: 254500,
    sortOrder: 0,
  });

  // Invoices
  const inv1ContractExTax = Math.round(385300 * 0.25 * 100);
  const inv1Gst = Math.round(inv1ContractExTax * 0.1);
  const inv1Total = inv1ContractExTax + inv1Gst;

  const [inv1] = await db.insert(clientInvoices).values({
    invoiceNumber: "INV-1001",
    name: "Progress Claim 1 — 25% Contract",
    projectId: proj1.id,
    invoiceDate: new Date("2025-05-01"),
    dueDate: new Date("2025-05-15"),
    invoicingMethod: "progress_payments",
    status: "paid",
    sentDate: new Date("2025-05-01"),
    subtotal: inv1ContractExTax,
    gstAmount: inv1Gst,
    totalAmount: inv1Total,
    paidAmount: inv1Total,
    balanceAmount: 0,
    showAmountsIncTax: true,
  }).returning();

  await db.insert(invoiceEstimates).values({
    invoiceId: inv1.id,
    estimateId: est1.id,
    progressPercent: 25,
  });

  await db.insert(clientInvoicePayments).values({
    invoiceId: inv1.id,
    amount: inv1Total,
    paymentDate: new Date("2025-05-14"),
    paymentMethod: "EFT",
    reference: "Irwin-PP1",
  });

  const inv2ExTax = inv1ContractExTax + 772700;
  const inv2Gst = Math.round(inv2ExTax * 0.1);
  const inv2Total = inv2ExTax + inv2Gst;
  const inv2Paid = Math.round(inv2Total / 2);

  const [inv2] = await db.insert(clientInvoices).values({
    invoiceNumber: "INV-1002",
    name: "Progress Claim 2 — Frame Stage",
    projectId: proj1.id,
    invoiceDate: new Date("2025-07-01"),
    dueDate: new Date("2025-07-15"),
    invoicingMethod: "progress_payments",
    status: "partial",
    sentDate: new Date("2025-07-01"),
    subtotal: inv2ExTax,
    gstAmount: inv2Gst,
    totalAmount: inv2Total,
    paidAmount: inv2Paid,
    balanceAmount: inv2Total - inv2Paid,
    showAmountsIncTax: true,
  }).returning();

  await db.insert(invoiceEstimates).values({
    invoiceId: inv2.id,
    estimateId: est1.id,
    progressPercent: 25,
  });

  await db.insert(invoiceVariations).values({
    invoiceId: inv2.id,
    variationId: var1.id,
    claimPercent: 100,
  });

  await db.insert(clientInvoicePayments).values({
    invoiceId: inv2.id,
    amount: inv2Paid,
    paymentDate: new Date("2025-07-12"),
    paymentMethod: "EFT",
    reference: "Irwin-PP2-partial",
  });

  // Bills for Project 1 (using new characters)
  const billDate = (d: string) => new Date(d);
  const billsData = [
    { supplier: chopperRead.id, desc: "Concrete slab pour — Stage 1", total: 1980000, num: "BILL-4501-001", date: "2025-03-15" },
    { supplier: chopperRead.id, desc: "Footings & pad preparation", total: 880000, num: "BILL-4501-002", date: "2025-03-28" },
    { supplier: hughJackman.id, desc: "Timber frame supply and erection", total: 4620000, num: "BILL-4501-003", date: "2025-04-20" },
    { supplier: alfStewart.id, desc: "Plumbing rough-in — wet areas", total: 850000, num: "BILL-4501-004", date: "2025-05-10" },
    { supplier: russellCoight.id, desc: "Waterproofing & tiling — wet areas", total: 1100000, num: "BILL-4501-005", date: "2025-06-05" },
    { supplier: chrisHemsworth.id, desc: "Electrical rough-in", total: 1400000, num: "BILL-4501-006", date: "2025-06-18" },
    { supplier: blueysBuilding.id, desc: "Timber, fixings & sundry materials", total: 600000, num: "BILL-4501-007", date: "2025-07-02" },
  ];

  for (const b of billsData) {
    const gst = Math.round(b.total / 11);
    const subtotal = b.total - gst;
    const [bill] = await db.insert(bills).values({
      billNumber: b.num,
      projectId: proj1.id,
      supplierId: b.supplier,
      billType: "bill",
      status: "awaiting_payment",
      billDate: billDate(b.date),
      subtotal,
      tax: gst,
      total: b.total,
      paidAmount: 0,
      createdById: userId,
    }).returning();

    await db.insert(billLineItems).values({
      billId: bill.id,
      lineType: "custom",
      description: b.desc,
      quantity: 1,
      unitPrice: subtotal,
      total: subtotal,
      tax: "GST on expenses",
      order: 0,
    });
  }

  // Schedule for Project 1
  const [sched1] = await db.insert(schedules).values({
    projectId: proj1.id,
    scheduleCategory: "construction",
    name: "Irwin Compound Reno — Construction Schedule",
    status: "online",
    createdBy: userId,
  }).returning();

  const milestones = [
    { name: "Demolition", start: "2025-03-01", end: "2025-03-14", type: "task", status: "completed" },
    { name: "Concrete Slab", start: "2025-03-15", end: "2025-03-28", type: "milestone", status: "completed" },
    { name: "Frame & Roof", start: "2025-04-01", end: "2025-05-15", type: "task", status: "completed" },
    { name: "Lock-Up Stage", start: "2025-05-16", end: "2025-06-30", type: "milestone", status: "in_progress" },
    { name: "Fit-Off & Fix", start: "2025-07-01", end: "2025-09-15", type: "task", status: "not_started" },
    { name: "Practical Completion", start: "2025-10-01", end: "2025-10-31", type: "milestone", status: "not_started" },
  ];

  for (let i = 0; i < milestones.length; i++) {
    const m = milestones[i];
    const s = new Date(m.start);
    const e = new Date(m.end);
    const dur = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
    await db.insert(scheduleItems).values({
      scheduleId: sched1.id,
      name: m.name,
      type: m.type as any,
      status: m.status,
      startDate: s,
      endDate: e,
      duration: dur,
      progressPercent: m.status === "completed" ? 100 : m.status === "in_progress" ? 55 : 0,
      sortOrder: i,
    });
  }

  // Tasks for Project 1
  const tasks1 = [
    { title: "Order floor tiles PC", status: "done", content: "Contact Kylie Minogue Kitchens & Bathrooms to confirm floor tile selection and ETA. Budget $12,000." },
    { title: "Confirm appliance delivery date", status: "in-progress", content: "Coordinate delivery of kitchen appliances with supplier. PC budget $18,000. Confirm with Steve & Terri." },
    { title: "Submit VAR-002 to client for approval", status: "todo", content: "Prepare and send plumbing relocation variation for Steve & Terri's approval. VAR-002 value $4,200." },
    { title: "Book frame stage inspection", status: "todo", content: "Schedule building inspector for frame stage sign-off. Contact Beerwah Council." },
    { title: "Final waterproofing check before tiling", status: "todo", content: "Ensure Russell Coight completes waterproofing inspection before floor tiles go down. She'll be right — but check anyway." },
  ];

  for (const t of tasks1) {
    await db.insert(notes).values({
      companyId,
      title: t.title,
      content: t.content,
      type: "task",
      status: t.status,
      projectId: proj1.id,
      scope: "project",
      taskContextType: "project",
      taskContextId: proj1.id,
      author: "Lenny Builder",
      ownerId: userId,
    });
  }

  // Site diary template
  const [diaryTemplate] = await db.insert(siteDiaryTemplates).values({
    companyId,
    name: "Daily Site Diary",
    isDefault: false,
    fields: [
      { id: "workers", title: "Workers on Site", type: "number", required: true, order: 0 },
      { id: "work_done", title: "Work Completed", type: "textarea", required: true, order: 1 },
      { id: "issues", title: "Issues / Delays", type: "textarea", required: false, order: 2 },
    ],
    createdBy: userId,
  }).returning();

  // Site diary entries
  await db.insert(siteDiaryEntries).values([
    {
      templateId: diaryTemplate.id,
      templateName: "Daily Site Diary",
      projectId: proj1.id,
      title: "Frame Stage — Day 12",
      entryDateTime: new Date("2025-04-18 07:30"),
      fieldValues: {
        workers: "8",
        work_done: "Completed north wall framing. Roof trusses delivered and staged on site. Hugh Jackman Joinery crew arrived on time. Good progress.",
        issues: "Minor delay — one truss was damaged in transit. Replacement ordered, 2-day wait.",
      },
      weather: { condition: "Sunny", temp: 28, humidity: 55, wind: "Light NE" },
      createdBy: userId,
      createdByName: "Lenny Builder",
    },
    {
      templateId: diaryTemplate.id,
      templateName: "Daily Site Diary",
      projectId: proj1.id,
      title: "Slab Pour — Completion",
      entryDateTime: new Date("2025-03-28 06:00"),
      fieldValues: {
        workers: "12",
        work_done: "Chopper Read's Concrete & Intimidation completed the full slab pour. Excellent finish. Curing compound applied. Site secured.",
        issues: "None. Don't argue with the mix design.",
      },
      weather: { condition: "Overcast", temp: 23, humidity: 70, wind: "Calm" },
      createdBy: userId,
      createdByName: "Lenny Builder",
    },
  ]);

  // ─── 3. PROJECT 2: DAME EDNA'S PENTHOUSE MAKEOVER ─────────────────────────

  const [proj2] = await db.insert(projects).values({
    name: "Dame Edna's Penthouse Makeover",
    description: "Luxury penthouse renovation for Dame Edna Everage in Moonee Ponds. Full kitchen, bathroom and living area transformation. Purple theme throughout.",
    preConstructionNumber: "PC-4502",
    color: "#9333ea",
    icon: "Home",
    location: "36 Moonee St, Moonee Ponds VIC 3039",
    projectStatus: "pre_construction",
    projectSubStatus: "pre_construction_in_progress",
    currentSystemPhase: "pre_construction",
    status: "active",
    invoicingMethod: "progress_payments",
    clientId: dameEdna.id,
    companyId,
    ownerId: userId,
    proposedStartDate: "2026-01-15",
    clientBudget: 26000000,
  }).returning();

  const [est2] = await db.insert(estimates).values({
    name: "Penthouse Makeover Estimate",
    projectId: proj2.id,
    status: "draft",
    isLocked: false,
    taxRate: 10,
    ownerId: userId,
  }).returning();

  const [grp2a] = await db.insert(estimateGroups).values({ estimateId: est2.id, name: "Kitchen Renovation", order: 0 }).returning();
  const [grp2b] = await db.insert(estimateGroups).values({ estimateId: est2.id, name: "Bathroom Refresh", order: 1 }).returning();
  const [grp2c] = await db.insert(estimateGroups).values({ estimateId: est2.id, name: "Living Areas", order: 2 }).returning();

  await db.insert(estimateItems).values([
    { estimateId: est2.id, groupId: grp2a.id, name: "Kitchen demolition & strip-out", type: "Labour", quantity: 1, unitCostExTax: 4500, taxAmount: 450, priceIncTax: 4950, order: 0 },
    { estimateId: est2.id, groupId: grp2a.id, name: "Custom kitchen cabinetry (purple finishes)", type: "Subcontractor", quantity: 1, unitCostExTax: 65000, taxAmount: 6500, priceIncTax: 71500, order: 1 },
    { estimateId: est2.id, groupId: grp2a.id, name: "Kitchen appliances PS", type: "Material", allowance: "Provisional Sum", allowanceStatus: "pending", quantity: 1, unitCostExTax: 22000, taxAmount: 2200, priceIncTax: 24200, order: 2 },
    { estimateId: est2.id, groupId: grp2b.id, name: "Bathroom demolition", type: "Labour", quantity: 1, unitCostExTax: 3500, taxAmount: 350, priceIncTax: 3850, order: 0 },
    { estimateId: est2.id, groupId: grp2b.id, name: "Tiling & waterproofing — 2 bathrooms", type: "Subcontractor", quantity: 1, unitCostExTax: 28000, taxAmount: 2800, priceIncTax: 30800, order: 1 },
    { estimateId: est2.id, groupId: grp2b.id, name: "Bathroom fixtures PS", type: "Material", allowance: "Provisional Sum", allowanceStatus: "pending", quantity: 1, unitCostExTax: 15000, taxAmount: 1500, priceIncTax: 16500, order: 2 },
    { estimateId: est2.id, groupId: grp2c.id, name: "Flooring — engineered oak throughout", type: "Subcontractor", quantity: 1, unitCostExTax: 38000, taxAmount: 3800, priceIncTax: 41800, order: 0 },
    { estimateId: est2.id, groupId: grp2c.id, name: "Painting — all rooms, 3 coats", type: "Subcontractor", quantity: 1, unitCostExTax: 22000, taxAmount: 2200, priceIncTax: 24200, order: 1 },
    { estimateId: est2.id, groupId: grp2c.id, name: "Glazing — custom feature panels", type: "Subcontractor", quantity: 1, unitCostExTax: 18000, taxAmount: 1800, priceIncTax: 19800, order: 2 },
  ]);

  // Bills for Project 2 (updated characters)
  const bills2 = [
    { supplier: captainFeathersword.id, desc: "Site investigation and soil report", total: 198000, num: "BILL-4502-001", date: "2025-10-15" },
    { supplier: mrSquiggle.id, desc: "Architect & design fee — concept phase", total: 935000, num: "BILL-4502-002", date: "2025-11-01" },
    { supplier: blueysBuilding.id, desc: "Council DA application fee", total: 242000, num: "BILL-4502-003", date: "2025-11-20" },
  ];

  for (const b of bills2) {
    const gst = Math.round(b.total / 11);
    const subtotal = b.total - gst;
    const [bill] = await db.insert(bills).values({
      billNumber: b.num,
      projectId: proj2.id,
      supplierId: b.supplier,
      billType: "bill",
      status: "awaiting_payment",
      billDate: new Date(b.date),
      subtotal,
      tax: gst,
      total: b.total,
      paidAmount: 0,
      createdById: userId,
    }).returning();

    await db.insert(billLineItems).values({
      billId: bill.id,
      lineType: "custom",
      description: b.desc,
      quantity: 1,
      unitPrice: subtotal,
      total: subtotal,
      tax: "GST on expenses",
      order: 0,
    });
  }

  // Draft invoice for project 2
  const inv3ExTax = 1090909;
  const inv3Gst = Math.round(inv3ExTax * 0.1);

  await db.insert(clientInvoices).values({
    invoiceNumber: "INV-2001",
    name: "Preliminary Works — Design & Investigations",
    projectId: proj2.id,
    invoiceDate: new Date("2025-11-30"),
    dueDate: new Date("2025-12-14"),
    invoicingMethod: "progress_payments",
    status: "draft",
    subtotal: inv3ExTax,
    gstAmount: inv3Gst,
    totalAmount: inv3ExTax + inv3Gst,
    paidAmount: 0,
    balanceAmount: inv3ExTax + inv3Gst,
    showAmountsIncTax: true,
  });

  // Tasks for project 2
  const tasks2 = [
    { title: "Submit planning application to Council", status: "todo", content: "Prepare DA documents and lodge with Moonee Valley City Council. Allow 8-12 weeks for approval." },
    { title: "Confirm fixture selections with Dame Edna", status: "in-progress", content: "Book showroom visit at Kylie Minogue Kitchens & Bathrooms. Dame Edna has strong opinions on purple tapware." },
    { title: "Client presentation — concept designs", status: "todo", content: "Present concept designs and mood boards to Dame Edna. Ensure gladioli motif is incorporated into feature tiles." },
  ];

  for (const t of tasks2) {
    await db.insert(notes).values({
      companyId,
      title: t.title,
      content: t.content,
      type: "task",
      status: t.status,
      projectId: proj2.id,
      scope: "project",
      taskContextType: "project",
      taskContextId: proj2.id,
      author: "Lenny Builder",
      ownerId: userId,
    });
  }

  // ─── 4. PROJECT 3: DUNDEE'S WALKABOUT CREEK PUB RENO ──────────────────────

  const [proj3] = await db.insert(projects).values({
    name: "Dundee's Walkabout Creek Pub Reno",
    description: "Full renovation of the iconic Walkabout Creek Hotel for Mick & Linda Dundee. New bar fit-out, accommodation upgrade, and heritage façade restoration.",
    leadNumber: "L-003",
    color: "#b45309",
    icon: "Home",
    location: "1 Walkabout Creek Hotel, McKinlay NT 0851",
    projectStatus: "lead",
    projectSubStatus: "lead_new",
    currentSystemPhase: "lead",
    status: "active",
    invoicingMethod: "progress_payments",
    clientId: mickDundee.id,
    companyId,
    ownerId: userId,
    clientBudget: 85000000,
  }).returning();

  // Tasks for project 3
  const tasks3 = [
    { title: "Send proposal to client", status: "todo", content: "Finalise proposal document and send to Mick & Linda. He said 'she'll be right' — but get a signed scope of works." },
    { title: "Follow up call — confirm scope", status: "todo", content: "Call Mick to confirm scope: bar fit-out, 8 accommodation rooms, heritage façade restoration. Confirm NT heritage overlay requirements." },
  ];

  for (const t of tasks3) {
    await db.insert(notes).values({
      companyId,
      title: t.title,
      content: t.content,
      type: "task",
      status: t.status,
      projectId: proj3.id,
      scope: "project",
      taskContextType: "project",
      taskContextId: proj3.id,
      author: "Lenny Builder",
      ownerId: userId,
    });
  }

  return {
    success: true,
    counts: {
      contacts: 13,
      projects: 3,
      invoices: 3,
      bills: 10,
      tasks: 10,
    },
  };
}
