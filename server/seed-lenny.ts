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
  timesheets,
  budgets,
  budgetLineItems,
  costCodes,
  users,
  selections,
  selectionOptions,
  defects,
  checklistInstances,
  checklistInstanceGroups,
  checklistInstanceItems,
  rfqs,
  rfqItems,
  rfqQuotes,
  rfis,
  rfiComments,
  scopeStages,
  scopeItems,
  minutes,
  paymentTermsOptions,
} from "../shared/schema";
import { eq, and, inArray } from "drizzle-orm";

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
  // Idempotency check (outside transaction — read-only)
  if (await isDemoSeeded(companyId)) {
    return { skipped: true, message: "Demo data already seeded" };
  }

  // Wrap everything in a transaction so a partial failure rolls back cleanly
  return await db.transaction(async (tx) => {
    // ─── 0. COST CODE LOOKUP ───────────────────────────────────────────────────
    // Look up cost codes by their numeric code for use throughout the seed
    const CC_CODES = ['100','119','121','123','125','126','127','128','129','130','133','138','142'];
    const ccRows = await tx.select({ id: costCodes.id, code: costCodes.code })
      .from(costCodes)
      .where(and(eq(costCodes.companyId, companyId), inArray(costCodes.code, CC_CODES)));
    const cc = Object.fromEntries(ccRows.map(r => [r.code, r.id]));

    // Set hourly rate on the seeding user so timesheets have a rate
    await tx.update(users).set({ hourlyRate: '95.00' } as any).where(eq(users.id, userId));

    // ─── 1. CONTACTS ───────────────────────────────────────────────────────────

    const [steveIrwin] = await tx.insert(contacts).values({
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

    const [dameEdna] = await tx.insert(contacts).values({
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

    const [mickDundee] = await tx.insert(contacts).values({
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

    const [paulHogan] = await tx.insert(contacts).values({
      companyId,
      name: "Paul Hogan's Plumbing Co",
      contactType: "supplier",
      abn: "11 222 333 444",
      phone: "02 9555 0001",
      notes: "Crocodile Dundee of plumbers. That's not a pipe — THIS is a pipe.",
      avatarColor: "#b45309",
    }).returning();

    const [kylieMinogue] = await tx.insert(contacts).values({
      companyId,
      name: "Kylie Minogue Kitchens & Bathrooms",
      contactType: "supplier",
      abn: "22 333 444 555",
      phone: "03 9555 0002",
      notes: "Can't get their showroom out of your head. 8-week lead time on cabinetry.",
      avatarColor: "#db2777",
    }).returning();

    const [keithUrban] = await tx.insert(contacts).values({
      companyId,
      name: "Keith Urban Underfloor Heating",
      contactType: "supplier",
      abn: "33 444 555 666",
      phone: "07 5555 0003",
      notes: "Radiant heat specialists. They'll warm your floors and your heart.",
      avatarColor: "#d97706",
    }).returning();

    const [hughJackman] = await tx.insert(contacts).values({
      companyId,
      name: "Hugh Jackman Joinery & Cabinetry",
      contactType: "supplier",
      abn: "44 555 666 777",
      phone: "02 9555 0004",
      notes: "Wolverine-grade timber work. Claws optional. Lead time 6 weeks.",
      avatarColor: "#7c3aed",
    }).returning();

    const [mrSquiggle] = await tx.insert(contacts).values({
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

    const [blueysBuilding] = await tx.insert(contacts).values({
      companyId,
      name: "Bluey's Building Supplies Pty Ltd",
      contactType: "supplier",
      abn: "66 777 888 999",
      phone: "07 3555 0006",
      notes: "Best in Brisbane. Good prices on timber and fixings. Dog-friendly yard.",
      avatarColor: "#2563eb",
    }).returning();

    const [alfStewart] = await tx.insert(contacts).values({
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

    const [chopperRead] = await tx.insert(contacts).values({
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

    const [russellCoight] = await tx.insert(contacts).values({
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

    const [chrisHemsworth] = await tx.insert(contacts).values({
      companyId,
      name: "Chris Hemsworth Electrical Services",
      contactType: "trade",
      abn: "10 111 222 333",
      phone: "07 5555 0010",
      notes: "Thor-oughly reliable. Byron Bay based. Renewables specialist.",
      avatarColor: "#1d4ed8",
    }).returning();

    const [captainFeathersword] = await tx.insert(contacts).values({
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

    const [proj1] = await tx.insert(projects).values({
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
      contractCost: 49738473,  // $497,384.73 incl GST in cents
      contractPrice: 49738473, // Locked contract price (exercises cent-level rounding throughout)
    }).returning();

    // Estimate
    const [est1] = await tx.insert(estimates).values({
      name: "Irwin Reno — Approved Estimate",
      projectId: proj1.id,
      status: "approved",
      isLocked: true,
      taxRate: 10,
      ownerId: userId,
    }).returning();

    // Estimate groups
    const [grp1a] = await tx.insert(estimateGroups).values({ estimateId: est1.id, name: "Demolition & Preparation", order: 0 }).returning();
    const [grp1b] = await tx.insert(estimateGroups).values({ estimateId: est1.id, name: "Framing & Structure", order: 1 }).returning();
    const [grp1c] = await tx.insert(estimateGroups).values({ estimateId: est1.id, name: "Fit-Out", order: 2 }).returning();
    const [grp1d] = await tx.insert(estimateGroups).values({ estimateId: est1.id, name: "External Works", order: 3 }).returning();

    // Demolition items
    // All amounts in dollars (stored as-is; estimate items use dollar values not cents)
    await tx.insert(estimateItems).values([
      { estimateId: est1.id, groupId: grp1a.id, name: "Demolition & strip-out", type: "Subcontractor", costCode: cc['126'], quantity: 1, unitCostExTax: 12500, taxAmount: 1250, priceIncTax: 13750, order: 0 },
      { estimateId: est1.id, groupId: grp1a.id, name: "Asbestos removal & disposal", type: "Subcontractor", costCode: cc['126'], quantity: 1, unitCostExTax: 8800, taxAmount: 880, priceIncTax: 9680, order: 1 },
      { estimateId: est1.id, groupId: grp1a.id, name: "Site prep & earthworks", type: "Subcontractor", costCode: cc['129'], quantity: 1, unitCostExTax: 34500, taxAmount: 3450, priceIncTax: 37950, order: 2 },
    ]);

    // Framing items
    await tx.insert(estimateItems).values([
      { estimateId: est1.id, groupId: grp1b.id, name: "Concrete slab", type: "Subcontractor", costCode: cc['130'], quantity: 1, unitCostExTax: 38500, taxAmount: 3850, priceIncTax: 42350, order: 0 },
      { estimateId: est1.id, groupId: grp1b.id, name: "Timber frame supply & erect", type: "Subcontractor", costCode: cc['133'], quantity: 1, unitCostExTax: 74000, taxAmount: 7400, priceIncTax: 81400, order: 1 },
      { estimateId: est1.id, groupId: grp1b.id, name: "Roof structure & sheeting", type: "Subcontractor", costCode: cc['138'], quantity: 1, unitCostExTax: 47500, taxAmount: 4750, priceIncTax: 52250, order: 2 },
    ]);

    // Fit-Out items
    const [floorTilesItem] = await tx.insert(estimateItems).values({
      estimateId: est1.id, groupId: grp1c.id, name: "Floor Tiles PC", type: "Material",
      costCode: cc['127'],
      allowance: "Prime Cost", allowanceStatus: "finalized",
      quantity: 1, unitCostExTax: 12000, taxAmount: 1200, priceIncTax: 13200, order: 0,
    }).returning();

    const [appliancesItem] = await tx.insert(estimateItems).values({
      estimateId: est1.id, groupId: grp1c.id, name: "Kitchen Appliances PC", type: "Material",
      costCode: cc['127'],
      allowance: "Prime Cost", allowanceStatus: "pending",
      quantity: 1, unitCostExTax: 18000, taxAmount: 1800, priceIncTax: 19800, order: 1,
    }).returning();

    await tx.insert(estimateItems).values([
      { estimateId: est1.id, groupId: grp1c.id, name: "Joinery & cabinetry", type: "Subcontractor", costCode: cc['123'], quantity: 1, unitCostExTax: 61000, taxAmount: 6100, priceIncTax: 67100, order: 2 },
      { estimateId: est1.id, groupId: grp1c.id, name: "Plumbing rough-in & fit-off", type: "Subcontractor", costCode: cc['125'], quantity: 1, unitCostExTax: 35500, taxAmount: 3550, priceIncTax: 39050, order: 3 },
      { estimateId: est1.id, groupId: grp1c.id, name: "Electrical rough-in & fit-off", type: "Subcontractor", costCode: cc['125'], quantity: 1, unitCostExTax: 30000, taxAmount: 3000, priceIncTax: 33000, order: 4 },
      { estimateId: est1.id, groupId: grp1c.id, name: "Painting & decorating", type: "Subcontractor", costCode: cc['127'], quantity: 1, unitCostExTax: 18500, taxAmount: 1850, priceIncTax: 20350, order: 5 },
    ]);

    // External items
    await tx.insert(estimateItems).values([
      { estimateId: est1.id, groupId: grp1d.id, name: "External decking", type: "Subcontractor", costCode: cc['142'], quantity: 1, unitCostExTax: 27500, taxAmount: 2750, priceIncTax: 30250, order: 0 },
      { estimateId: est1.id, groupId: grp1d.id, name: "Fencing & gates", type: "Subcontractor", costCode: cc['142'], quantity: 1, unitCostExTax: 14500, taxAmount: 1450, priceIncTax: 15950, order: 1 },
      { estimateId: est1.id, groupId: grp1d.id, name: "Landscaping & drainage", type: "Subcontractor", costCode: cc['119'], quantity: 1, unitCostExTax: 22000, taxAmount: 2200, priceIncTax: 24200, order: 2 },
      { estimateId: est1.id, groupId: grp1d.id, name: "Wildlife habitat restoration & fencing", type: "Subcontractor", costCode: cc['142'], quantity: 1, unitCostExTax: 18500, taxAmount: 1850, priceIncTax: 20350, order: 3 },
    ]);

    // Variations
    const [var1] = await tx.insert(variations).values({
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

    await tx.insert(variationItems).values({
      variationId: var1.id,
      description: "Extend rear deck by 18m² using spotted gum hardwood",
      quantity: 18,
      unitPrice: 42928,
      totalPrice: 772700,
      sortOrder: 0,
    });

    const [var2] = await tx.insert(variations).values({
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

    await tx.insert(variationItems).values({
      variationId: var2.id,
      description: "Relocate main stack and wet area drain points to suit revised floor plan",
      quantity: 1,
      unitPrice: 381800,
      totalPrice: 381800,
      sortOrder: 0,
    });

    const [var3] = await tx.insert(variations).values({
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

    await tx.insert(variationItems).values({
      variationId: var3.id,
      description: "Supply and install 8x additional LED downlights in education centre",
      quantity: 8,
      unitPrice: 31813,
      totalPrice: 254500,
      sortOrder: 0,
    });

    // ── Client Invoices for Project 1 (Irwin) ────────────────────────────────
    // Contract price: $497,384.73 (49738473 cents)
    // 4 progress payments totalling exactly the contract price.
    // Amounts include GST. ex = total / 1.1 rounded, gst = total - ex.

    // INV-1001 — Deposit 10% = $49,738.47
    const inv1Total = 4973847;
    const inv1Ex   = Math.round(inv1Total / 1.1);
    const inv1Gst  = inv1Total - inv1Ex;
    const [inv1] = await tx.insert(clientInvoices).values({
      invoiceNumber: "INV-1001",
      name: "Deposit — 10% Contract",
      projectId: proj1.id,
      invoiceDate: new Date("2025-03-01"),
      dueDate: new Date("2025-03-14"),
      invoicingMethod: "progress_payments",
      status: "paid",
      sentDate: new Date("2025-03-01"),
      subtotal: inv1Ex,
      gstAmount: inv1Gst,
      totalAmount: inv1Total,
      paidAmount: inv1Total,
      balanceAmount: 0,
      showAmountsIncTax: true,
    }).returning();

    await tx.insert(clientInvoicePayments).values({
      invoiceId: inv1.id,
      amount: inv1Total,
      paymentDate: new Date("2025-03-10"),
      paymentMethod: "EFT",
      reference: "Irwin-Deposit",
    });

    // INV-1002 — Progress Claim 2, Slab & Frame Complete 25% = $124,346.18
    const inv2Total = 12434618;
    const inv2Ex   = Math.round(inv2Total / 1.1);
    const inv2Gst  = inv2Total - inv2Ex;
    const [inv2] = await tx.insert(clientInvoices).values({
      invoiceNumber: "INV-1002",
      name: "Progress Claim 2 — Slab & Frame Complete",
      projectId: proj1.id,
      invoiceDate: new Date("2025-05-01"),
      dueDate: new Date("2025-05-15"),
      invoicingMethod: "progress_payments",
      status: "paid",
      sentDate: new Date("2025-05-01"),
      subtotal: inv2Ex,
      gstAmount: inv2Gst,
      totalAmount: inv2Total,
      paidAmount: inv2Total,
      balanceAmount: 0,
      showAmountsIncTax: true,
    }).returning();

    await tx.insert(clientInvoicePayments).values({
      invoiceId: inv2.id,
      amount: inv2Total,
      paymentDate: new Date("2025-05-12"),
      paymentMethod: "EFT",
      reference: "Irwin-PP2",
    });

    // INV-1003 — Progress Claim 3, Lock-Up Stage 35% = $174,084.66, half paid
    const inv3Total = 17408466;
    const inv3Ex   = Math.round(inv3Total / 1.1);
    const inv3Gst  = inv3Total - inv3Ex;
    const inv3Paid = 8704233; // exactly half
    const [inv3] = await tx.insert(clientInvoices).values({
      invoiceNumber: "INV-1003",
      name: "Progress Claim 3 — Lock-Up Stage",
      projectId: proj1.id,
      invoiceDate: new Date("2025-07-01"),
      dueDate: new Date("2025-07-15"),
      invoicingMethod: "progress_payments",
      status: "partial",
      sentDate: new Date("2025-07-01"),
      subtotal: inv3Ex,
      gstAmount: inv3Gst,
      totalAmount: inv3Total,
      paidAmount: inv3Paid,
      balanceAmount: inv3Total - inv3Paid,
      showAmountsIncTax: true,
    }).returning();

    await tx.insert(clientInvoicePayments).values({
      invoiceId: inv3.id,
      amount: inv3Paid,
      paymentDate: new Date("2025-07-10"),
      paymentMethod: "EFT",
      reference: "Irwin-PP3-partial",
    });

    // INV-1004 — Progress Claim 4, Practical Completion 30% = $149,215.42, unpaid
    // Remainder after 10+25+35 = 30%. Total check: 4973847+12434618+17408466+14921542 = 49738473 ✓
    const inv4Total = 49738473 - inv1Total - inv2Total - inv3Total; // = 14921542
    const inv4Ex   = Math.round(inv4Total / 1.1);
    const inv4Gst  = inv4Total - inv4Ex;
    const [inv4] = await tx.insert(clientInvoices).values({
      invoiceNumber: "INV-1004",
      name: "Progress Claim 4 — Practical Completion",
      projectId: proj1.id,
      invoiceDate: new Date("2025-09-01"),
      dueDate: new Date("2025-09-15"),
      invoicingMethod: "progress_payments",
      status: "sent",
      sentDate: new Date("2025-09-01"),
      subtotal: inv4Ex,
      gstAmount: inv4Gst,
      totalAmount: inv4Total,
      paidAmount: 0,
      balanceAmount: inv4Total,
      showAmountsIncTax: true,
    }).returning();

    // Link all 4 Irwin invoices to the estimate (required for allowances selector)
    await tx.insert(invoiceEstimates).values([
      { invoiceId: inv1.id, estimateId: est1.id },
      { invoiceId: inv2.id, estimateId: est1.id },
      { invoiceId: inv3.id, estimateId: est1.id },
      { invoiceId: inv4.id, estimateId: est1.id },
    ]);

    // Invoice Variations — approved variations claimed on their respective progress invoices
    // var1 (Decking Extension, $8,500) claimed at lock-up; var3 (Lighting, $2,800) at practical completion
    await tx.insert(invoiceVariations).values([
      { invoiceId: inv3.id, variationId: var1.id, claimPercent: 100 },
      { invoiceId: inv4.id, variationId: var3.id, claimPercent: 100 },
    ]);

    // Invoice Allowances — finalized PC items claimed on INV-1003 (lock-up stage)
    // Query IDs because they were inserted via bulk array (no individual .returning())
    const pcItemRows = await tx.select({ id: estimateItems.id, name: estimateItems.name })
      .from(estimateItems)
      .where(and(
        eq(estimateItems.estimateId, est1.id),
        inArray(estimateItems.name, ["Floor Tiles PC", "Kitchen Appliances PC"])
      ));
    const floorTilesItem = pcItemRows.find(r => r.name === "Floor Tiles PC");
    const kitchenAppItem = pcItemRows.find(r => r.name === "Kitchen Appliances PC");
    if (floorTilesItem && kitchenAppItem) {
      await tx.insert(invoiceAllowances).values([
        { invoiceId: inv3.id, estimateItemId: floorTilesItem.id, claimPercent: 100 },
        { invoiceId: inv3.id, estimateItemId: kitchenAppItem.id, claimPercent: 100 },
      ]);
    }

    // Bills for Project 1
    const billDate = (d: string) => new Date(d);
    const billsData = [
      { supplier: chopperRead.id, desc: "Concrete slab pour — Stage 1", total: 1980000, num: "BILL-4501-001", date: "2025-03-15", ccCode: '130' },
      { supplier: chopperRead.id, desc: "Footings & pad preparation", total: 880000, num: "BILL-4501-002", date: "2025-03-28", ccCode: '129' },
      { supplier: hughJackman.id, desc: "Timber frame supply and erection", total: 4620000, num: "BILL-4501-003", date: "2025-04-20", ccCode: '133' },
      { supplier: alfStewart.id, desc: "Plumbing rough-in — wet areas", total: 850000, num: "BILL-4501-004", date: "2025-05-10", ccCode: '125' },
      { supplier: russellCoight.id, desc: "Waterproofing & tiling — wet areas", total: 1100000, num: "BILL-4501-005", date: "2025-06-05", ccCode: '127' },
      { supplier: chrisHemsworth.id, desc: "Electrical rough-in", total: 1400000, num: "BILL-4501-006", date: "2025-06-18", ccCode: '125' },
      { supplier: blueysBuilding.id, desc: "Timber, fixings & sundry materials", total: 600000, num: "BILL-4501-007", date: "2025-07-02", ccCode: '100' },
    ];

    for (const b of billsData) {
      const gst = Math.round(b.total / 11);
      const subtotal = b.total - gst;
      const [bill] = await tx.insert(bills).values({
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

      await tx.insert(billLineItems).values({
        billId: bill.id,
        lineType: "custom",
        description: b.desc,
        quantity: 1,
        unitPrice: subtotal,
        total: subtotal,
        tax: "GST on expenses",
        order: 0,
        costCodeId: cc[b.ccCode] || null,
      });
    }

    // ─── TIMESHEETS for Project 1 ──────────────────────────────────────────────
    const tsEntries = [
      { date: "2025-03-03", dur: 8,   desc: "Site induction & safety setup, demolition preparation",       ccCode: '126', rate: 95, end: "15:00:00" },
      { date: "2025-03-05", dur: 9.5, desc: "Supervise strip-out, asbestos removal coordination",          ccCode: '126', rate: 95, end: "16:30:00" },
      { date: "2025-03-10", dur: 8,   desc: "Site prep and earthworks supervision",                         ccCode: '129', rate: 95, end: "15:00:00" },
      { date: "2025-03-17", dur: 10,  desc: "Footings inspection, formwork coordination",                   ccCode: '130', rate: 95, end: "17:00:00" },
      { date: "2025-03-24", dur: 9,   desc: "Slab pour supervision — Stage 1",                              ccCode: '130', rate: 95, end: "16:00:00" },
      { date: "2025-04-07", dur: 8.5, desc: "Frame delivery inspection, set out",                           ccCode: '128', rate: 95, end: "15:30:00" },
      { date: "2025-04-14", dur: 8,   desc: "Timber frame erection supervision",                            ccCode: '133', rate: 95, end: "15:00:00" },
      { date: "2025-04-28", dur: 9,   desc: "Frame progress inspection, roof framing coordination",         ccCode: '138', rate: 95, end: "16:00:00" },
      { date: "2025-06-02", dur: 8,   desc: "Plumbing rough-in inspection, client walkthrough",             ccCode: '125', rate: 95, end: "15:00:00" },
      { date: "2025-06-09", dur: 7.5, desc: "Electrical rough-in sign-off, site management",               ccCode: '125', rate: 95, end: "14:30:00" },
      { date: "2025-07-07", dur: 8,   desc: "Joinery delivery check, cabinetry installation review",       ccCode: '123', rate: 95, end: "15:00:00" },
      { date: "2025-07-21", dur: 8.5, desc: "Tiling & waterproofing inspection",                           ccCode: '127', rate: 95, end: "15:30:00" },
      { date: "2025-08-11", dur: 9,   desc: "Painting contractor review, defects list",                    ccCode: '127', rate: 95, end: "16:00:00" },
      { date: "2025-09-15", dur: 8,   desc: "Practical completion inspection walk, punch list",             ccCode: '121', rate: 95, end: "15:00:00" },
      { date: "2025-10-06", dur: 6,   desc: "Final defects rectification supervision",                     ccCode: '127', rate: 95, end: "13:00:00" },
    ];

    for (const t of tsEntries) {
      await tx.insert(timesheets).values({
        projectId: proj1.id,
        userId,
        date: new Date(t.date),
        startTime: "07:00:00",
        endTime: t.end,
        duration: t.dur,
        breakDuration: 0.5,
        description: t.desc,
        status: "approved",
        hourlyRate: String(t.rate),
        total: String(Math.round(t.dur * t.rate * 100) / 100),
        costCodeId: cc[t.ccCode] || null,
        invoiced: false,
        isActive: false,
      } as any);
    }

    // ─── BUDGET for Project 1 ─────────────────────────────────────────────────
    const [budget1] = await tx.insert(budgets).values({
      projectId: proj1.id,
      name: "Project Budget",
      status: "active",
      baselineAmount: 0,
      revisedAmount: 0,
      actualAmount: 0,
      forecastAmount: 0,
      varianceAmount: 0,
      profitAmount: 0,
      profitPercent: 0,
    } as any).returning();

    // Estimate-based budgeted amounts grouped by cost code
    const budgetLines = [
      { ccCode: '126', title: '126 - Labour - Demolition',       budgeted: 23430,  actual: 0        },
      { ccCode: '129', title: '129 - Labour - Excavation',       budgeted: 24200,  actual: 800000   },
      { ccCode: '130', title: '130 - Labour - Concrete Works',   budgeted: 42350,  actual: 1800000  },
      { ccCode: '133', title: '133 - Labour - Framing',          budgeted: 57200,  actual: 4200000  },
      { ccCode: '138', title: '138 - Labour - Roof Framing',     budgeted: 37400,  actual: 0        },
      { ccCode: '127', title: '127 - Labour - Work to Existing', budgeted: 58700,  actual: 1000000  },
      { ccCode: '123', title: '123 - Labour - General Carpentry',budgeted: 49500,  actual: 0        },
      { ccCode: '125', title: '125 - Labour - Site Services',    budgeted: 57200,  actual: 2045454  },
      { ccCode: '142', title: '142 - Labour - External Linings', budgeted: 40150,  actual: 0        },
      { ccCode: '119', title: '119 - Site Clean',                budgeted: 17600,  actual: 0        },
      { ccCode: '100', title: '100 - Preliminaries',             budgeted: 0,      actual: 545455   },
    ];

    let sortOrder = 0;
    for (const line of budgetLines) {
      const forecast = line.actual + Math.max(0, line.budgeted - line.actual);
      const variance = line.budgeted - forecast;
      const variancePercent = line.budgeted > 0 ? Math.round((variance / line.budgeted) * 100) : 0;
      await tx.insert(budgetLineItems).values({
        budgetId: budget1.id,
        costCodeId: cc[line.ccCode] || null,
        costCodeTitle: line.title,
        categoryTitle: "",
        budgetedAmount: line.budgeted,
        actualAmount: line.actual,
        variationAmount: 0,
        forecastAmount: forecast,
        variance,
        variancePercent,
        profitAmount: variance,
        sortOrder: sortOrder++,
      } as any);
    }

    // Schedule for Project 1
    const [sched1] = await tx.insert(schedules).values({
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
      await tx.insert(scheduleItems).values({
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
      await tx.insert(notes).values({
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
    const [diaryTemplate] = await tx.insert(siteDiaryTemplates).values({
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
    await tx.insert(siteDiaryEntries).values([
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

    // ─── SCOPE for Project 1 ──────────────────────────────────────────────────
    // Scope flows from pre-construction planning through to practical completion.
    // Each stage maps to the estimate groups and schedule milestones.
    await tx.insert(scopeStages).values([
      { companyId, projectId: proj1.id, name: "Pre-Construction",       displayOrder: 0 },
      { companyId, projectId: proj1.id, name: "Demolition & Preparation", displayOrder: 1 },
      { companyId, projectId: proj1.id, name: "Framing & Structure",     displayOrder: 2 },
      { companyId, projectId: proj1.id, name: "Fit-Out",                 displayOrder: 3 },
      { companyId, projectId: proj1.id, name: "External Works",          displayOrder: 4 },
    ]);

    await tx.insert(scopeItems).values([
      // Pre-Construction
      { companyId, projectId: proj1.id, stage: "Pre-Construction", title: "Engage structural engineer for slab & frame certification", itemType: "scope", contentType: "text", displayOrder: 0, needsRfi: true, isCompleted: true },
      { companyId, projectId: proj1.id, stage: "Pre-Construction", title: "Issue RFQ for concrete slab pour", itemType: "scope", contentType: "text", displayOrder: 1, needsRfq: true, isCompleted: true },
      { companyId, projectId: proj1.id, stage: "Pre-Construction", title: "Confirm PC & PS allowances with client — floor tiles and kitchen appliances", itemType: "scope", contentType: "text", description: "Allowances: Floor Tiles $13,200 inc GST | Kitchen Appliances $19,800 inc GST | Site Drainage PS $7,150 inc GST", displayOrder: 2, isCompleted: true },
      // Demolition & Preparation
      { companyId, projectId: proj1.id, stage: "Demolition & Preparation", title: "Strip-out and demolition of existing structure", itemType: "scope", contentType: "text", displayOrder: 0, isCompleted: true },
      { companyId, projectId: proj1.id, stage: "Demolition & Preparation", title: "Asbestos identification, removal & disposal (licensed Class A contractor)", itemType: "scope", contentType: "text", description: "Must engage Class A licensed removalist. Obtain clearance certificate before frame commences.", displayOrder: 1, isCompleted: true },
      { companyId, projectId: proj1.id, stage: "Demolition & Preparation", title: "Site prep and earthworks to engineer's finished floor levels", itemType: "scope", contentType: "text", displayOrder: 2, isCompleted: true },
      // Framing & Structure
      { companyId, projectId: proj1.id, stage: "Framing & Structure", title: "Concrete slab to structural engineer's specification (125mm slab confirmed — RFI-001)", itemType: "scope", contentType: "text", displayOrder: 0, isCompleted: true },
      { companyId, projectId: proj1.id, stage: "Framing & Structure", title: "Timber frame supply and erection to AS 1684", itemType: "scope", contentType: "text", description: "Frame inspection by certifier required before lock-up. Certifier: Beerwah Council Building Inspection Services.", displayOrder: 1, isCompleted: true },
      { companyId, projectId: proj1.id, stage: "Framing & Structure", title: "Roof structure, sarking, and metal deck sheeting", itemType: "scope", contentType: "text", displayOrder: 2, isCompleted: true },
      // Fit-Out
      { companyId, projectId: proj1.id, stage: "Fit-Out", title: "Plumbing rough-in and fit-off", itemType: "scope", contentType: "text", displayOrder: 0, isCompleted: true },
      { companyId, projectId: proj1.id, stage: "Fit-Out", title: "Electrical rough-in and fit-off", itemType: "scope", contentType: "text", displayOrder: 1, isCompleted: true },
      { companyId, projectId: proj1.id, stage: "Fit-Out", title: "Floor tiles — PC item $13,200 allowance (Travertine 600x600 confirmed)", itemType: "scope", contentType: "text", description: "Client confirmed: Concept Tile & Timber Travertine Effect 600x600. Selection approved June 2025. Within allowance.", displayOrder: 2, isCompleted: true },
      { companyId, projectId: proj1.id, stage: "Fit-Out", title: "Joinery and cabinetry", itemType: "scope", contentType: "text", displayOrder: 3, isCompleted: true },
      { companyId, projectId: proj1.id, stage: "Fit-Out", title: "Kitchen appliances — PC item $19,800 allowance (Smeg Opera Series confirmed)", itemType: "scope", contentType: "text", description: "Client confirmed: Smeg Opera Series package. On allowance — no variation required.", displayOrder: 4, isCompleted: false },
      { companyId, projectId: proj1.id, stage: "Fit-Out", title: "Painting and decorating — all internal surfaces", itemType: "scope", contentType: "text", displayOrder: 5, isCompleted: false },
      // External Works
      { companyId, projectId: proj1.id, stage: "External Works", title: "External decking — spotted gum hardwood (incl. VAR-001 extension +18m²)", itemType: "scope", contentType: "text", description: "Total deck area approx 52m². VAR-001 approved $8,500.", displayOrder: 0, isCompleted: false },
      { companyId, projectId: proj1.id, stage: "External Works", title: "Fencing & gates", itemType: "scope", contentType: "text", displayOrder: 1, isCompleted: false },
      { companyId, projectId: proj1.id, stage: "External Works", title: "Landscaping and stormwater drainage to council requirements", itemType: "scope", contentType: "text", displayOrder: 2, isCompleted: false },
      { companyId, projectId: proj1.id, stage: "External Works", title: "Wildlife habitat restoration & fauna-exclusion fencing", itemType: "scope", contentType: "text", description: "Retain and restore habitat corridor along eastern boundary. Fauna-proof fencing to council permit conditions. Engage licensed ecologist.", displayOrder: 3, isCompleted: false },
    ]);

    // ─── SELECTIONS for Project 1 ─────────────────────────────────────────────
    // Selections track the client's choices for PC/PS items and finishes.
    // These link directly to the allowance items in the estimate.
    const [sel1] = await tx.insert(selections).values({
      projectId: proj1.id,
      name: "Floor Tile Selection",
      category: "Tiles",
      room: "Living, Hallway & Wet Areas",
      description: "600x600mm rectified porcelain floor tiles for main living areas, hallway and all wet areas. PC allowance $13,200 inc GST.",
      selectionType: "selection",
      status: "approved",
      deadline: new Date("2025-06-01"),
      allowance: 1320000,
      clientCanChange: false,
      clientCanSeePrice: true,
      createdBy: userId,
    }).returning();

    await tx.insert(selectionOptions).values([
      {
        selectionId: sel1.id,
        name: "Travertine Effect 600x600 Porcelain — SELECTED",
        brand: "Concept Tile & Timber",
        description: "Rectified 600x600mm travertine-effect porcelain. Suitable for wet areas. Slip rating R10. Grouted with Charcoal Mapei 112.",
        sku: "CTT-600TR-BG",
        unitCost: 6500,
        unitTax: 650,
        gstInclusive: false,
        quantity: 120,
        unitType: "m2",
        totalCost: 858000,
        visibleToClient: true,
        isSelectedByClient: true,
        sortOrder: 0,
      },
      {
        selectionId: sel1.id,
        name: "Honed White Marble-Look 600x600",
        brand: "Stone & Ceramic Co.",
        description: "Honed white marble-effect rectified tile. Premium finish. Not selected by client.",
        sku: "SC-600WM-HN",
        unitCost: 8900,
        unitTax: 890,
        gstInclusive: false,
        quantity: 120,
        unitType: "m2",
        totalCost: 1176000,
        visibleToClient: true,
        isSelectedByClient: false,
        sortOrder: 1,
      },
    ]);

    const [sel2] = await tx.insert(selections).values({
      projectId: proj1.id,
      name: "Kitchen Appliance Selection",
      category: "Appliances",
      room: "Kitchen",
      description: "PC item for kitchen appliances — freestanding oven, cooktop, rangehood and dishwasher. Allowance $19,800 inc GST.",
      selectionType: "selection",
      status: "approved",
      deadline: new Date("2025-06-15"),
      allowance: 1980000,
      clientCanChange: false,
      clientCanSeePrice: true,
      createdBy: userId,
    }).returning();

    await tx.insert(selectionOptions).values([
      {
        selectionId: sel2.id,
        name: "Smeg Opera Series Package — SELECTED",
        brand: "Smeg",
        description: "TR4110RO freestanding oven, KT6CLX3 5-burner cooktop, KS50 rangehood, DWAI315X dishwasher. Confirmed by client June 2025.",
        sku: "SMEG-PKG-OPERA",
        unitCost: 1800000,
        unitTax: 180000,
        gstInclusive: false,
        quantity: 1,
        unitType: "ea",
        totalCost: 1980000,
        visibleToClient: true,
        isSelectedByClient: true,
        sortOrder: 0,
      },
      {
        selectionId: sel2.id,
        name: "Fisher & Paykel Series 9 Package",
        brand: "Fisher & Paykel",
        description: "Series 9 90cm oven, 5-burner induction cooktop, chimney hood and integrated dishwasher.",
        sku: "FP-PKG-S9",
        unitCost: 1650000,
        unitTax: 165000,
        gstInclusive: false,
        quantity: 1,
        unitType: "ea",
        totalCost: 1815000,
        visibleToClient: true,
        isSelectedByClient: false,
        sortOrder: 1,
      },
    ]);

    const [sel3] = await tx.insert(selections).values({
      projectId: proj1.id,
      name: "External Cladding Selection",
      category: "Cladding",
      room: "External — North & East Elevations",
      description: "Feature wall cladding for north and east elevations. Client to confirm before fix-out.",
      selectionType: "selection",
      status: "pending",
      deadline: new Date("2025-08-01"),
      clientCanChange: true,
      clientCanSeePrice: false,
      createdBy: userId,
    }).returning();

    await tx.insert(selectionOptions).values([
      {
        selectionId: sel3.id,
        name: "Weathertex Selvedge Vertical 150",
        brand: "Weathertex",
        description: "Australian-made natural woodfibre cladding. Selvedge Vertical 150mm profile. Low maintenance.",
        sku: "WTX-SV150",
        unitCost: 4500,
        unitTax: 450,
        gstInclusive: false,
        quantity: 85,
        unitType: "m2",
        totalCost: 425000,
        visibleToClient: true,
        isSelectedByClient: false,
        sortOrder: 0,
      },
      {
        selectionId: sel3.id,
        name: "Scyon Stria Compressed Sheet",
        brand: "James Hardie",
        description: "Horizontal-groove compressed fibre cement sheet. Low embodied carbon, BAL-rated.",
        sku: "SC-STRIA-HRZ",
        unitCost: 5200,
        unitTax: 520,
        gstInclusive: false,
        quantity: 85,
        unitType: "m2",
        totalCost: 492000,
        visibleToClient: true,
        isSelectedByClient: false,
        sortOrder: 1,
      },
    ]);

    // ─── DEFECTS for Project 1 ────────────────────────────────────────────────
    // Logged at various stages — one resolved, one in progress, one open.
    await tx.insert(defects).values([
      {
        projectId: proj1.id,
        title: "Cracked render on north external wall",
        description: "Hairline crack approx 600mm long on north wall render, running from window corner downward. Likely thermal movement.",
        location: "North wall, above kitchen window",
        type: "subcontractor",
        priority: "medium",
        status: "resolved",
        trade: "Rendering",
        assignedContactId: russellCoight.id,
        assignedContactName: "Russell Coight",
        dateIdentified: new Date("2025-08-11"),
        dueDate: new Date("2025-08-25"),
        dateResolved: new Date("2025-08-20"),
        notes: "Russell Coight patched with matching render and re-textured. Passed inspection. Resolved.",
        createdBy: userId,
        createdByName: "Lenny Builder",
      },
      {
        projectId: proj1.id,
        title: "Stormwater outlet not to specification — clearance from boundary",
        description: "Rear stormwater outlet installed at 400mm from boundary. Engineering spec requires minimum 600mm clearance per council drainage plan.",
        location: "Rear yard, south-east corner",
        type: "subcontractor",
        priority: "high",
        status: "in_progress",
        trade: "Plumbing & Drainage",
        assignedContactId: alfStewart.id,
        assignedContactName: "Alf Stewart",
        dateIdentified: new Date("2025-09-15"),
        dueDate: new Date("2025-10-01"),
        notes: "Alf Stewart to relocate outlet by 200mm. Awaiting council approval for revised drainage layout. Council response expected within 10 business days.",
        createdBy: userId,
        createdByName: "Lenny Builder",
      },
      {
        projectId: proj1.id,
        title: "Missing gutter end cap — east elevation north-east corner",
        description: "Cast aluminium OG gutter on east elevation is missing the end cap at the north-east corner. Water discharging onto footpath during rain.",
        location: "East elevation, north-east corner",
        type: "builder",
        priority: "low",
        status: "open",
        trade: "Roofing",
        dateIdentified: new Date("2025-10-06"),
        dueDate: new Date("2025-10-20"),
        notes: "Roofer to supply and install matching end cap. Low risk — minor aesthetic and drainage defect.",
        createdBy: userId,
        createdByName: "Lenny Builder",
      },
    ]);

    // ─── CHECKLISTS for Project 1 ─────────────────────────────────────────────
    // Frame inspection (completed pre lock-up) and lock-up inspection (in progress)
    const [cl1] = await tx.insert(checklistInstances).values({
      projectId: proj1.id,
      companyId,
      name: "Frame Stage Inspection",
      description: "Pre-lock-up frame inspection as required by building certifier. All items signed off before cladding installed.",
      status: "completed",
      priority: "high",
      dueDate: new Date("2025-05-01"),
      completedAt: new Date("2025-04-30"),
      completedBy: userId,
      completedByName: "Lenny Builder",
      assigneeId: userId,
      assigneeName: "Lenny Builder",
      createdBy: userId,
      createdByName: "Lenny Builder",
    }).returning();

    const [clg1a] = await tx.insert(checklistInstanceGroups).values({
      instanceId: cl1.id,
      name: "Structural Compliance",
      order: 0,
      status: "completed",
      completedAt: new Date("2025-04-30"),
      completedByName: "Lenny Builder",
    }).returning();

    await tx.insert(checklistInstanceItems).values([
      { instanceId: cl1.id, groupId: clg1a.id, description: "Frame erected to structural engineer's plan (Rev C)", responseType: "checkbox", status: "completed", completedAt: new Date("2025-04-30"), completedByName: "Lenny Builder", order: 0 },
      { instanceId: cl1.id, groupId: clg1a.id, description: "All connections bolted and metal-strapped per AS 1684", responseType: "checkbox", status: "completed", completedAt: new Date("2025-04-30"), completedByName: "Lenny Builder", order: 1 },
      { instanceId: cl1.id, groupId: clg1a.id, description: "Top plates doubled and continuous over all openings", responseType: "checkbox", status: "completed", completedAt: new Date("2025-04-30"), completedByName: "Lenny Builder", order: 2 },
      { instanceId: cl1.id, groupId: clg1a.id, description: "Window and door lintels correct size and minimum bearing length", responseType: "checkbox", status: "completed", completedAt: new Date("2025-04-30"), completedByName: "Lenny Builder", order: 3 },
      { instanceId: cl1.id, groupId: clg1a.id, description: "Frame plumb, square and level within tolerance", responseType: "checkbox", status: "completed", completedAt: new Date("2025-04-30"), completedByName: "Lenny Builder", order: 4 },
    ]);

    const [clg1b] = await tx.insert(checklistInstanceGroups).values({
      instanceId: cl1.id,
      name: "Roof & Waterproofing Prep",
      order: 1,
      status: "completed",
      completedAt: new Date("2025-04-30"),
      completedByName: "Lenny Builder",
    }).returning();

    await tx.insert(checklistInstanceItems).values([
      { instanceId: cl1.id, groupId: clg1b.id, description: "Sarking installed to roof before metal deck sheeting", responseType: "checkbox", status: "completed", completedAt: new Date("2025-04-30"), completedByName: "Lenny Builder", order: 0 },
      { instanceId: cl1.id, groupId: clg1b.id, description: "Flashings installed to all penetrations and wall junctions", responseType: "checkbox", status: "completed", completedAt: new Date("2025-04-30"), completedByName: "Lenny Builder", order: 1 },
      { instanceId: cl1.id, groupId: clg1b.id, description: "Eaves fire-stop installed (BAL-rated as per permit)", responseType: "checkbox", status: "completed", completedAt: new Date("2025-04-30"), completedByName: "Lenny Builder", order: 2 },
    ]);

    const [cl2] = await tx.insert(checklistInstances).values({
      projectId: proj1.id,
      companyId,
      name: "Lock-Up Stage Inspection",
      description: "Lock-up sign-off checklist before fit-off commences. External envelope and rough-in services must be complete.",
      status: "in_progress",
      priority: "high",
      dueDate: new Date("2025-07-01"),
      assigneeId: userId,
      assigneeName: "Lenny Builder",
      createdBy: userId,
      createdByName: "Lenny Builder",
    }).returning();

    const [clg2a] = await tx.insert(checklistInstanceGroups).values({
      instanceId: cl2.id,
      name: "External Envelope",
      order: 0,
      status: "completed",
      completedAt: new Date("2025-06-28"),
      completedByName: "Lenny Builder",
    }).returning();

    await tx.insert(checklistInstanceItems).values([
      { instanceId: cl2.id, groupId: clg2a.id, description: "All external cladding and windows installed and weather-sealed", responseType: "checkbox", status: "completed", completedAt: new Date("2025-06-28"), completedByName: "Lenny Builder", order: 0 },
      { instanceId: cl2.id, groupId: clg2a.id, description: "Roof fully sheeted, flashings in place, gutters and downpipes installed", responseType: "checkbox", status: "completed", completedAt: new Date("2025-06-28"), completedByName: "Lenny Builder", order: 1 },
      { instanceId: cl2.id, groupId: clg2a.id, description: "All external doors hung, weather-stripped, and lockable", responseType: "checkbox", status: "completed", completedAt: new Date("2025-06-28"), completedByName: "Lenny Builder", order: 2 },
    ]);

    const [clg2b] = await tx.insert(checklistInstanceGroups).values({
      instanceId: cl2.id,
      name: "Rough-In Services",
      order: 1,
      status: "in_progress",
    }).returning();

    await tx.insert(checklistInstanceItems).values([
      { instanceId: cl2.id, groupId: clg2b.id, description: "Plumbing rough-in inspected and approved by certifier", responseType: "checkbox", status: "completed", completedAt: new Date("2025-06-10"), completedByName: "Lenny Builder", order: 0 },
      { instanceId: cl2.id, groupId: clg2b.id, description: "Electrical rough-in inspected and approved by certifier", responseType: "checkbox", status: "completed", completedAt: new Date("2025-06-18"), completedByName: "Lenny Builder", order: 1 },
      { instanceId: cl2.id, groupId: clg2b.id, description: "Waterproofing applied to all wet areas and passed inspection", responseType: "checkbox", status: "pending", order: 2 },
      { instanceId: cl2.id, groupId: clg2b.id, description: "Ceiling and wall insulation installed prior to lock-up lining", responseType: "checkbox", status: "pending", order: 3 },
    ]);

    // ─── RFQs for Project 1 ───────────────────────────────────────────────────
    // RFQ-001: Concrete slab (accepted — led to BILL-4501-001/002)
    // RFQ-002: Floor tile supply (sent — awaiting quote from Russell Coight)
    const [rfq1] = await tx.insert(rfqs).values({
      rfqNumber: "4501-RFQ-001",
      projectId: proj1.id,
      companyId,
      title: "Concrete Slab Pour — Stage 1 & Pad Footings",
      description: "Supply of concrete and labour for ground floor slab pour and pad footings per structural engineer's Rev C drawings.",
      scope: "Supply and pour 32MPa concrete for ground floor slab (125mm) and pad footings per structural engineer Rev C drawings. Includes pump hire, formwork strip-out and spoil removal. Site: Irwin Wildlife Compound, Beerwah QLD.",
      dueDate: new Date("2025-02-28"),
      status: "accepted",
      sentAt: new Date("2025-02-15"),
      supplierIds: [chopperRead.id],
      supplierNames: ["Chopper Read's Concrete & Intimidation"],
      createdBy: userId,
      createdByName: "Lenny Builder",
    }).returning();

    await tx.insert(rfqItems).values([
      { rfqId: rfq1.id, description: "Concrete supply — 32MPa with plasticiser, 48m³", quantity: "48", unit: "m3", unitPrice: 32000, displayOrder: 0 },
      { rfqId: rfq1.id, description: "Concrete pump hire (full day)", quantity: "1", unit: "day", unitPrice: 180000, displayOrder: 1 },
      { rfqId: rfq1.id, description: "Formwork strip-out and spoil removal", quantity: "1", unit: "allow", unitPrice: 85000, displayOrder: 2 },
      { rfqId: rfq1.id, description: "Curing compound (Sika Antisol S)", quantity: "1", unit: "allow", unitPrice: 22000, displayOrder: 3 },
    ]);

    await tx.insert(rfqQuotes).values({
      rfqId: rfq1.id,
      supplierId: chopperRead.id,
      supplierName: "Chopper Read's Concrete & Intimidation",
      totalAmount: 2860000,
      leadTime: "5 business days",
      validUntil: new Date("2025-03-31"),
      notes: "Price includes 32MPa with plasticiser. Pump hire included. Don't be late with the payment. Early start 5:30am required for pour day.",
      status: "accepted",
      acceptedAt: new Date("2025-02-28"),
    });

    const [rfq2] = await tx.insert(rfqs).values({
      rfqNumber: "4501-RFQ-002",
      projectId: proj1.id,
      companyId,
      title: "Floor Tile Supply — PC Item ($13,200 allowance)",
      description: "Supply of 600x600mm rectified porcelain tiles for living areas, hallway and wet areas. Qty approx 120m².",
      scope: "Supply only of 600x600mm rectified porcelain tiles to client's confirmed selection (Travertine Effect, Concept Tile & Timber CTT-600TR-BG), matching grout and flexible adhesive. Qty approx 120m² + 10% waste allowance = 132m². Delivery to site on agreed date.",
      dueDate: new Date("2025-05-20"),
      status: "sent",
      sentAt: new Date("2025-05-05"),
      supplierIds: [russellCoight.id],
      supplierNames: ["Russell Coight Tiling & Waterproofing"],
      createdBy: userId,
      createdByName: "Lenny Builder",
    }).returning();

    await tx.insert(rfqItems).values([
      { rfqId: rfq2.id, description: "CTT-600TR-BG Travertine Effect 600x600 Porcelain (incl. 10% waste)", quantity: "132", unit: "m2", unitPrice: 6500, displayOrder: 0 },
      { rfqId: rfq2.id, description: "Mapei Charcoal 112 grout (15kg bags)", quantity: "12", unit: "bag", unitPrice: 3500, displayOrder: 1 },
      { rfqId: rfq2.id, description: "Mapei Keraflex Maxi flexible tile adhesive (20kg)", quantity: "18", unit: "bag", unitPrice: 2800, displayOrder: 2 },
      { rfqId: rfq2.id, description: "Delivery to site (Beerwah QLD)", quantity: "1", unit: "allow", unitPrice: 35000, displayOrder: 3 },
    ]);

    // ─── RFIs for Project 1 ───────────────────────────────────────────────────
    // RFI-001: Slab thickness (answered & closed pre-construction)
    // RFI-002: Kitchen appliance PC confirmation (open — awaiting client written confirmation)
    const [rfi1] = await tx.insert(rfis).values({
      rfiNumber: "4501-RFI-001",
      projectId: proj1.id,
      companyId,
      subject: "Slab thickness confirmation — education centre extension",
      question: "Revised structural drawings received 14/02/2025 reference both 100mm and 125mm slab thickness for the education centre extension (Sheets S1.2 and S1.4 conflict). Which takes precedence? Please confirm before formwork commences.",
      directedToType: "engineer",
      directedToName: "Paul Hogan — Crocodile Dundee Engineering",
      directedToEmail: "paul.hogan@dundeeengineering.com.au",
      priority: "high",
      status: "closed",
      dueDate: new Date("2025-02-20"),
      response: "Confirmed — use 125mm slab thickness throughout for the education centre extension. Drawings will be updated and issued as Rev C by 21/02/2025. Use 100mm for the main dwelling slab only as shown on S1.1.",
      respondedByName: "Paul Hogan (Structural Engineer)",
      respondedAt: new Date("2025-02-19"),
      closedAt: new Date("2025-02-19"),
      sentAt: new Date("2025-02-14"),
      createdById: userId,
      createdByName: "Lenny Builder",
    }).returning();

    await tx.insert(rfiComments).values({
      rfiId: rfi1.id,
      content: "Thanks Paul — Rev C drawings received and confirmed. Proceeding with 125mm for education centre. Formwork commences Monday 3 March.",
      createdById: userId,
      createdByName: "Lenny Builder",
    });

    const [rfi2] = await tx.insert(rfis).values({
      rfiNumber: "4501-RFI-002",
      projectId: proj1.id,
      companyId,
      subject: "Kitchen appliance PC item — written confirmation of Smeg selection",
      question: "Client Steve Irwin verbally confirmed the Smeg Opera Series kitchen package (Smeg-PKG-OPERA) at the June 2025 progress meeting. Please provide written confirmation that this selection is within the PC allowance of $19,800 inc GST and that no variation is required.",
      directedToType: "client",
      directedToName: "Steve Irwin",
      directedToEmail: "steve@irwins.com.au",
      priority: "normal",
      status: "submitted",
      dueDate: new Date("2025-07-05"),
      sentAt: new Date("2025-06-25"),
      createdById: userId,
      createdByName: "Lenny Builder",
    }).returning();

    await tx.insert(rfiComments).values({
      rfiId: rfi2.id,
      content: "Steve — just following up on the Smeg selection confirmation. The Opera Series package lands exactly on the $19,800 allowance so there's nothing extra to pay. We just need your written sign-off so we can place the order. Happy to take an email reply as confirmation.",
      createdById: userId,
      createdByName: "Lenny Builder",
    });

    // ─── MINUTES for Project 1 ────────────────────────────────────────────────
    await tx.insert(minutes).values([
      {
        projectId: proj1.id,
        title: "Pre-Construction Meeting — Site Initiation",
        meetingDate: new Date("2025-02-10"),
        location: "Irwin Wildlife Compound, 1770 Steve Irwin Way, Beerwah QLD 4519",
        attendees: [
          { name: "Steve Irwin (Client)" },
          { name: "Terri Irwin (Client)" },
          { name: "Lenny Builder (Builder / Contract Administrator)" },
          { name: "Paul Hogan (Structural Engineer — Crocodile Dundee Engineering)" },
        ],
        contentHtml: "<h3>1. Project Overview</h3><p>Lenny Builder confirmed project scope per the signed contract dated 14/01/2025. Contract sum: $497,384.73 inc GST.</p><h3>2. Construction Program</h3><p>Start: 3 March 2025. Practical completion target: 31 October 2025. Program was issued and acknowledged by all parties.</p><h3>3. PC & PS Allowances</h3><p>Client confirmed: Floor tile allowance $13,200 inc GST — selection required by 1 June. Kitchen appliance allowance $19,800 inc GST — selection required by 15 June. Site drainage PS $7,150 inc GST — pending design confirmation.</p><h3>4. Site Access & House Rules</h3><p>Keys handed over. Hours: Mon–Fri 7am–5pm, Sat 7am–12pm. Wildlife exclusion zone on east boundary confirmed — 10m setback. All workers to complete site induction before commencing.</p><h3>5. Action Items</h3><p>See list below.</p>",
        contentText: "Pre-Construction Meeting. Contract $497,384.73. Program issued. PC items confirmed. Site access arrangements agreed.",
        actionItems: [
          { description: "Issue Rev C structural drawings (125mm slab confirmed)", assignee: "Paul Hogan", dueDate: "2025-02-21", completed: true },
          { description: "Confirm tile and appliance selection timeline with client", assignee: "Lenny Builder", dueDate: "2025-03-01", completed: true },
          { description: "Erect site fencing and wildlife exclusion barriers before works commence", assignee: "Lenny Builder", dueDate: "2025-03-03", completed: true },
          { description: "Issue RFQ-001 for concrete slab", assignee: "Lenny Builder", dueDate: "2025-02-15", completed: true },
        ],
        ownerId: userId,
        ownerName: "Lenny Builder",
      },
      {
        projectId: proj1.id,
        title: "Progress Meeting — Frame Complete & Lock-Up Review",
        meetingDate: new Date("2025-06-25"),
        location: "Zoom — Irwin Wildlife Compound Project",
        attendees: [
          { name: "Steve Irwin (Client)" },
          { name: "Terri Irwin (Client)" },
          { name: "Lenny Builder (Builder)" },
        ],
        contentHtml: "<h3>1. Progress Update</h3><p>Frame completed and signed off 30 April. Lock-up approx 85% complete. Windows installed, roof sheeted. External doors outstanding — ETA 30 June.</p><h3>2. Selections Confirmed</h3><p>Floor tiles: Travertine Effect 600x600 from Concept Tile & Timber — within allowance. Kitchen appliances: Smeg Opera Series — $19,800, exactly on allowance, no variation required. Appliance order to be placed by 28 June.</p><h3>3. Variations</h3><p>VAR-001 (decking extension 18m²) — approved and signed. VAR-002 (plumbing relocation) — under client review. Response required by 5 July. VAR-003 (additional lighting) — approved.</p><h3>4. Progress Claim 3</h3><p>INV-1003 will be issued 1 July covering lock-up stage ($174,084.66). Includes VAR-001 and PC allowances for tiles and appliances. Client acknowledged.</p>",
        contentText: "June 2025 progress meeting. Lock-up 85% complete. PC items confirmed on allowance. Variations discussed. INV-1003 to issue 1 July.",
        actionItems: [
          { description: "Issue INV-1003 — lock-up progress claim", assignee: "Lenny Builder", dueDate: "2025-07-01", completed: true },
          { description: "Place order for Smeg Opera Series appliance package", assignee: "Lenny Builder", dueDate: "2025-06-28", completed: true },
          { description: "Client to confirm VAR-002 plumbing relocation in writing", assignee: "Steve Irwin", dueDate: "2025-07-05", completed: false },
          { description: "Follow up RFI-002 — kitchen appliance written confirmation", assignee: "Lenny Builder", dueDate: "2025-07-01", completed: false },
        ],
        ownerId: userId,
        ownerName: "Lenny Builder",
      },
    ]);

    // ─── PROJECT NOTES for Project 1 ──────────────────────────────────────────
    // General notes (type "note") pinned for easy reference — different from tasks.
    await tx.insert(notes).values([
      {
        companyId,
        title: "Wildlife exclusion zone — east boundary",
        content: "10m exclusion zone on east boundary per council planning permit. No machinery, materials storage or site offices within this zone. All workers briefed at site induction. Ecologist contact: Dr Bindi Irwin (not actually Steve's daughter — different Bindi) 0400 111 222.",
        type: "note",
        projectId: proj1.id,
        scope: "project",
        author: "Lenny Builder",
        ownerId: userId,
        pinned: true,
      },
      {
        companyId,
        title: "Key contacts — structural engineer & certifier",
        content: "Structural engineer: Paul Hogan — Crocodile Dundee Engineering — 0412 345 678 — paul.hogan@dundeeengineering.com.au. Building certifier: Beerwah Council Building Inspection Services — bookings via council portal. 48hr notice required for all stage inspections.",
        type: "note",
        projectId: proj1.id,
        scope: "project",
        author: "Lenny Builder",
        ownerId: userId,
        pinned: false,
      },
    ]);

    // ─── 3. PROJECT 2: DAME EDNA'S PENTHOUSE MAKEOVER ─────────────────────────

    const [proj2] = await tx.insert(projects).values({
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

    const [est2] = await tx.insert(estimates).values({
      name: "Penthouse Makeover Estimate",
      projectId: proj2.id,
      status: "draft",
      isLocked: false,
      taxRate: 10,
      ownerId: userId,
    }).returning();

    const [grp2a] = await tx.insert(estimateGroups).values({ estimateId: est2.id, name: "Kitchen Renovation", order: 0 }).returning();
    const [grp2b] = await tx.insert(estimateGroups).values({ estimateId: est2.id, name: "Bathroom Refresh", order: 1 }).returning();
    const [grp2c] = await tx.insert(estimateGroups).values({ estimateId: est2.id, name: "Living Areas", order: 2 }).returning();

    await tx.insert(estimateItems).values([
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

    // Bills for Project 2
    const bills2 = [
      { supplier: captainFeathersword.id, desc: "Site investigation and soil report", total: 198000, num: "BILL-4502-001", date: "2025-10-15" },
      { supplier: mrSquiggle.id, desc: "Architect & design fee — concept phase", total: 935000, num: "BILL-4502-002", date: "2025-11-01" },
      { supplier: blueysBuilding.id, desc: "Council DA application fee", total: 242000, num: "BILL-4502-003", date: "2025-11-20" },
    ];

    for (const b of bills2) {
      const gst = Math.round(b.total / 11);
      const subtotal = b.total - gst;
      const [bill] = await tx.insert(bills).values({
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

      await tx.insert(billLineItems).values({
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
    const inv2001ExTax = 1090909;
    const inv2001Gst = Math.round(inv2001ExTax * 0.1);

    await tx.insert(clientInvoices).values({
      invoiceNumber: "INV-2001",
      name: "Preliminary Works — Design & Investigations",
      projectId: proj2.id,
      invoiceDate: new Date("2025-11-30"),
      dueDate: new Date("2025-12-14"),
      invoicingMethod: "progress_payments",
      status: "draft",
      subtotal: inv2001ExTax,
      gstAmount: inv2001Gst,
      totalAmount: inv2001ExTax + inv2001Gst,
      paidAmount: 0,
      balanceAmount: inv2001ExTax + inv2001Gst,
      showAmountsIncTax: true,
    });

    // Tasks for project 2
    const tasks2 = [
      { title: "Submit planning application to Council", status: "todo", content: "Prepare DA documents and lodge with Moonee Valley City Council. Allow 8-12 weeks for approval." },
      { title: "Confirm fixture selections with Dame Edna", status: "in-progress", content: "Book showroom visit at Kylie Minogue Kitchens & Bathrooms. Dame Edna has strong opinions on purple tapware." },
      { title: "Client presentation — concept designs", status: "todo", content: "Present concept designs and mood boards to Dame Edna. Ensure gladioli motif is incorporated into feature tiles." },
    ];

    for (const t of tasks2) {
      await tx.insert(notes).values({
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

    const [proj3] = await tx.insert(projects).values({
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
      await tx.insert(notes).values({
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

    // ─── PAYMENT TERMS OPTIONS ─────────────────────────────────────────────────
    await tx.insert(paymentTermsOptions).values([
      { companyId, name: "Due on Receipt", dueValue: 0,  dueType: "days", isInvoiceDefault: true, isBillDefault: false, isActive: true, sortOrder: 0 },
      { companyId, name: "Net 7",          dueValue: 7,  dueType: "days", isInvoiceDefault: true, isBillDefault: true,  isActive: true, sortOrder: 1 },
      { companyId, name: "Net 14",         dueValue: 14, dueType: "days", isInvoiceDefault: true, isBillDefault: true,  isActive: true, sortOrder: 2 },
      { companyId, name: "Net 30",         dueValue: 30, dueType: "days", isInvoiceDefault: true, isBillDefault: true,  isActive: true, sortOrder: 3 },
      { companyId, name: "Net 60",         dueValue: 60, dueType: "days", isInvoiceDefault: true, isBillDefault: false, isActive: true, sortOrder: 4 },
    ]);

    return {
      success: true,
      counts: {
        contacts: 14,
        projects: 3,
        invoices: 3,
        bills: 10,
        tasks: 10,
      },
    };
  });
}
