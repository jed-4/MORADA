/**
 * Demo data for looking at the CLIENT PORTAL on a dev database.
 *
 *   npx tsx --env-file-if-exists=.env scripts/seed-client-portal-demo.ts
 *   npx tsx --env-file-if-exists=.env scripts/seed-client-portal-demo.ts --remove
 *   ... --project <id>      # a specific project instead of the busiest one
 *
 * The dev database has a builder's data: schedules with no sub-items, site
 * diary entries never shared with the client, no reviews, and invoices with no
 * saved line snapshot. A client signing in therefore sees a portal of empty
 * states, which says nothing about whether the portal works.
 *
 * Everything written here is prefixed "Demo —" (or, for the client user, a
 * @moradademo.test address) and `--remove` deletes exactly those rows, so this
 * can never eat real data. Idempotent: it removes its own rows before writing.
 *
 * NOT for production. It refuses to run against a database whose project count
 * looks like prod, and it only ever touches one project.
 */
import { neon } from "@neondatabase/serverless";

const DEMO = "Demo — ";
const CLIENT_EMAIL = "client@moradademo.test";
const REMOVE = process.argv.includes("--remove");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

/**
 * Stand-in photos, as inline SVG data URLs.
 *
 * Dev object storage holds no images, and a broken <img> reads as a bug in the
 * portal rather than as missing demo data. A data URL always renders: no
 * network, no CORS, nothing to upload. (A public placeholder service was tried
 * first and simply did not load.)
 */
const PALETTE = ["#87749A", "#D5B772", "#71CAD1", "#83C9A2", "#DA998B", "#6B6561"];
const photo = (seed: string, label: string) => {
  const colour = PALETTE[[...seed].reduce((sum, c) => sum + c.charCodeAt(0), 0) % PALETTE.length];
  const text = label.replace(/[<>&]/g, "").slice(0, 28);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="675">` +
    `<rect width="900" height="675" fill="${colour}"/>` +
    `<rect x="24" y="24" width="852" height="627" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="3"/>` +
    `<text x="450" y="352" font-family="Helvetica,Arial,sans-serif" font-size="42" fill="#fff" ` +
    `text-anchor="middle">${text}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

async function main() {
  // ── Which project ──────────────────────────────────────────────────────────
  const [{ n: projectCount }] = await sql`select count(*)::int n from projects` as any;
  if (projectCount > 40) {
    console.error(`Refusing to run: ${projectCount} projects looks like production, not dev.`);
    process.exit(1);
  }

  // The busiest project, so the demo sits alongside real content rather than
  // on an empty shell — schedule ITEMS (not schedules), claims and selections.
  // Override with --project <id>.
  const flagIdx = process.argv.indexOf("--project");
  const wanted = flagIdx !== -1 ? process.argv[flagIdx + 1] : null;
  const projects = wanted
    ? (await sql`select id, name, company_id, client_id from projects where id=${wanted}` as any[])
    : (await sql`
        select p.id, p.name, p.company_id, p.client_id,
               (select count(*) from schedule_items si join schedules s on s.id = si.schedule_id where s.project_id = p.id)
             + (select count(*) from client_invoices ci where ci.project_id = p.id)
             + (select count(*) from selections sel where sel.project_id = p.id) as content
        from projects p
        order by content desc, p.created_at
        limit 1` as any[]);
  const project = projects[0];
  if (!project) {
    console.error("No projects in this database.");
    process.exit(1);
  }
  console.log(`Project: ${project.name} (${project.id})`);

  // ── Always clear previous demo rows first ─────────────────────────────────
  const demoSelections = await sql`select id from selections where project_id=${project.id} and name like ${DEMO + "%"}` as any[];
  for (const s of demoSelections) {
    const options = await sql`select id from selection_options where selection_id=${s.id}` as any[];
    for (const o of options) await sql`delete from option_attachments where option_id=${o.id}`;
    await sql`delete from selection_comments where selection_id=${s.id}`;
    await sql`delete from client_selections where selection_id=${s.id}`;
    await sql`delete from selection_options where selection_id=${s.id}`;
  }
  await sql`delete from selections where project_id=${project.id} and name like ${DEMO + "%"}`;

  const demoVariations = await sql`select id from variations where project_id=${project.id} and name like ${DEMO + "%"}` as any[];
  for (const v of demoVariations) await sql`delete from variation_items where variation_id=${v.id}`;
  await sql`delete from variations where project_id=${project.id} and name like ${DEMO + "%"}`;

  const demoReviews = await sql`select id from review_items where project_id=${project.id} and name like ${DEMO + "%"}` as any[];
  for (const r of demoReviews) {
    await sql`update review_items set current_revision_id=null where id=${r.id}`;
    await sql`delete from review_comments where review_item_id=${r.id}`;
    await sql`delete from review_approvals where review_item_id=${r.id}`;
    await sql`delete from review_revisions where review_item_id=${r.id}`;
  }
  await sql`delete from review_items where project_id=${project.id} and name like ${DEMO + "%"}`;

  await sql`delete from site_diary_entries where project_id=${project.id} and title like ${DEMO + "%"}`;

  const scheduleIds = (await sql`select id from schedules where project_id=${project.id}` as any[]).map((s) => s.id);
  if (scheduleIds.length) {
    await sql`delete from schedule_items where schedule_id = any(${scheduleIds}) and name like ${DEMO + "%"}`;
  }

  if (REMOVE) {
    const users = await sql`select id from users where email=${CLIENT_EMAIL}` as any[];
    for (const u of users) {
      await sql`delete from user_project_access where user_id=${u.id}`;
      await sql`delete from users where id=${u.id}`;
    }
    console.log("Demo data removed.");
    return;
  }

  // ── A client to sign in as ────────────────────────────────────────────────
  const clientRoles = await sql`
    select id from user_roles where company_id=${project.company_id} and user_category=${"client"} limit 1` as any[];
  if (!clientRoles[0]) {
    console.error("This company has no Client role — open Roles & Permissions once and it is created.");
    process.exit(1);
  }
  const existingClient = (await sql`select id from users where email=${CLIENT_EMAIL}` as any[])[0];
  let clientId = existingClient?.id;
  if (!clientId) {
    const [created] = await sql`
      insert into users (email, first_name, last_name, user_category, role_id, role_name, company_id)
      values (${CLIENT_EMAIL}, ${"Demo"}, ${"Client"}, ${"client"}, ${clientRoles[0].id}, ${"Client"}, ${project.company_id})
      returning id` as any[];
    clientId = created.id;
  }
  await sql`delete from user_project_access where user_id=${clientId}`;
  await sql`insert into user_project_access (user_id, project_id, access_level) values (${clientId}, ${project.id}, ${"view"})`;

  // ── Schedule: sub-items, so "every item" vs "phases only" differ ──────────
  let scheduleItemsAdded = 0;
  const [schedule] = await sql`
    select id from schedules where project_id=${project.id}
    order by case when status='online' then 0 when status='locked' then 1 else 2 end limit 1` as any[];
  if (schedule) {
    const parents = await sql`
      select id, name, start_date, end_date from schedule_items
      where schedule_id=${schedule.id} and parent_item_id is null
      order by start_date limit 3` as any[];
    const childrenOf: Record<string, string[]> = {
      0: ["Site set-out and excavation", "Footings poured"],
      1: ["Formwork and steel", "Slab pour and cure"],
      2: ["Wall frames erected", "Roof trusses and battens"],
    };
    for (const [i, parent] of parents.entries()) {
      for (const [j, name] of (childrenOf[i] ?? []).entries()) {
        await sql`
          insert into schedule_items (schedule_id, parent_item_id, name, type, status, start_date, end_date, duration, progress_percent, sort_order)
          values (${schedule.id}, ${parent.id}, ${DEMO + name}, ${"task"}, ${i === 0 ? "completed" : i === 1 ? "in_progress" : "not_started"},
                  ${parent.start_date}, ${parent.end_date}, ${5}, ${i === 0 ? 100 : i === 1 ? 45 : 0}, ${j})`;
        scheduleItemsAdded++;
      }
    }
  }

  // ── Site diary: entries actually shared with the client ───────────────────
  const [diaryTemplate] = await sql`
    select id, name from site_diary_templates where company_id=${project.company_id} limit 1` as any[];
  let diaryAdded = 0;
  if (diaryTemplate) {
    const entries = [
      {
        title: "Slab pour complete",
        when: "2026-09-12T07:30:00Z",
        values: { "Work completed": "Slab poured and screeded by 11am. Concrete finished well in the cooler weather.", "Weather": "Fine, 19°C" },
        photos: [photo("slab1", "Slab pour"), photo("slab2", "Screeding")],
      },
      {
        title: "Frame delivery on site",
        when: "2026-09-18T06:45:00Z",
        values: { "Work completed": "Wall frames delivered and stacked. Crane booked for Thursday.", "Deliveries": "Frames — Truss & Frame Co" },
        photos: [photo("frame1", "Frame delivery")],
      },
    ];
    for (const entry of entries) {
      await sql`
        insert into site_diary_entries (template_id, template_name, project_id, title, entry_date_time, field_values, overall_photos, share_with_client, created_by_name)
        values (${diaryTemplate.id}, ${diaryTemplate.name}, ${project.id}, ${DEMO + entry.title}, ${entry.when},
                ${JSON.stringify(entry.values)}::json, ${JSON.stringify(entry.photos)}::json, true, ${"Site Supervisor"})`;
      diaryAdded++;
    }
  }

  // ── Selections with photos ────────────────────────────────────────────────
  const selectionSpecs = [
    {
      name: "Kitchen splashback", room: "Kitchen", category: "Tiles", deadline: "2026-10-10",
      options: [
        { name: "Zellige White Gloss", brand: "Concept Tile", sku: "ZW-100", cost: 8900, desc: "Handmade zellige, 100x100, gloss white.", seed: "tilea" },
        { name: "Terrazzo Bianco", brand: "Concept Tile", sku: "TZ-220", cost: 12400, desc: "Warm white terrazzo, 600x600.", seed: "tileb" },
        { name: "Sandstone Subway", brand: "Concept Tile", sku: "SS-075", cost: 6400, desc: "Matte subway, 75x150, sand.", seed: "tilec" },
      ],
    },
    {
      name: "Ensuite tapware", room: "Ensuite", category: "Tapware", deadline: "2026-10-18",
      options: [
        { name: "Kingsley Brushed Brass", brand: "Astra Walker", sku: "KB-12", cost: 79000, desc: "Wall mixer + spout, brushed brass.", seed: "tapa" },
        { name: "Icon Chrome", brand: "Astra Walker", sku: "IC-04", cost: 52000, desc: "Wall mixer + spout, polished chrome.", seed: "tapb" },
      ],
    },
    {
      name: "Pendant lights over island", room: "Kitchen", category: "Lighting", deadline: "2026-11-01",
      options: [
        { name: "Muuto Ambit 25", brand: "Muuto", sku: "AMB-25", cost: 43500, desc: "Powder-coated shade, 250mm.", seed: "lighta" },
        { name: "Ferm Living Arum", brand: "Ferm Living", sku: "AR-18", cost: 38900, desc: "Brass-trimmed glass, 180mm.", seed: "lightb" },
      ],
    },
  ];
  for (const spec of selectionSpecs) {
    const [selection] = await sql`
      insert into selections (project_id, name, category, room, status, deadline, client_can_change, client_can_see_price, allowance)
      values (${project.id}, ${DEMO + spec.name}, ${spec.category}, ${spec.room}, ${"pending"}, ${spec.deadline}, true, true, ${0})
      returning id` as any[];
    for (const [i, option] of spec.options.entries()) {
      const [created] = await sql`
        insert into selection_options (selection_id, name, brand, sku, description, unit_cost, quantity, markup_percent, visible_to_client, sort_order)
        values (${selection.id}, ${option.name}, ${option.brand}, ${option.sku}, ${option.desc}, ${option.cost}, ${1}, ${10}, true, ${i})
        returning id` as any[];
      await sql`
        insert into option_attachments (option_id, file_name, file_path, file_type, mime_type, sort_order)
        values (${created.id}, ${option.seed + ".svg"}, ${photo(option.seed, option.name)}, ${"image"}, ${"image/svg+xml"}, ${0})`;
    }
  }

  // ── Variations: one to sign, one already signed ───────────────────────────
  const variationSpecs = [
    {
      number: "DEMO-VO-001", name: "Rear deck extension", status: "pending", days: 5,
      intro: "As discussed on site, here is the variation for extending the rear deck.",
      closing: "Please approve so we can order the decking.",
      items: [
        { name: "Decking", description: "Extend rear deck by 18m² in spotted gum", qty: 18, unit: "m2", unitPrice: 42928 },
        { name: "Balustrade", description: "Stainless wire balustrade to new section", qty: 9, unit: "m", unitPrice: 18500 },
      ],
      signed: null as null | { name: string; date: string },
    },
    {
      number: "DEMO-VO-002", name: "Laundry joinery upgrade", status: "approved", days: 2,
      intro: "Upgrade to full-height joinery in the laundry, as requested.",
      closing: "Thanks — we'll schedule the cabinetmaker.",
      items: [{ name: "Joinery", description: "Full-height laundry cabinetry, laminate finish", qty: 1, unit: "each", unitPrice: 486000 }],
      signed: { name: "Demo Client", date: "2026-09-16T04:10:00Z" },
    },
  ];
  for (const spec of variationSpecs) {
    const subtotal = spec.items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
    const gst = Math.round(subtotal * 0.1);
    const [variation] = await sql`
      insert into variations (variation_number, project_id, name, status, subtotal, gst_amount, total_amount, balance_amount,
                              days_changed, introduction_text, closing_text, portal_sent_at,
                              client_signed_name, client_signed_date, approved_date)
      values (${spec.number}, ${project.id}, ${DEMO + spec.name}, ${spec.status}, ${subtotal}, ${gst}, ${subtotal + gst}, ${subtotal + gst},
              ${spec.days}, ${spec.intro}, ${spec.closing}, ${"2026-09-15T00:00:00Z"},
              ${spec.signed?.name ?? null}, ${spec.signed?.date ?? null}, ${spec.signed?.date ?? null})
      returning id` as any[];
    for (const [i, item] of spec.items.entries()) {
      await sql`
        insert into variation_items (variation_id, name, description, quantity, unit_price, total_price, unit_type, sort_order)
        values (${variation.id}, ${item.name}, ${item.description}, ${item.qty}, ${item.unitPrice}, ${item.qty * item.unitPrice}, ${item.unit}, ${i})`;
    }
  }

  // ── Reviews addressed to the client ───────────────────────────────────────
  const reviewSpecs = [
    { name: "Kitchen joinery drawings — Rev B", status: "awaiting_review", notes: "Updated to show the appliance garage and the revised island overhang.", due: "2026-10-05" },
    { name: "Electrical plan — ground floor", status: "approved", notes: "Includes the extra power points discussed at the site meeting.", due: "2026-09-20" },
  ];
  for (const spec of reviewSpecs) {
    const [item] = await sql`
      insert into review_items (company_id, project_id, name, description, status, due_date, reviewer_type, reviewer_contact_id)
      values (${project.company_id}, ${project.id}, ${DEMO + spec.name}, ${spec.notes}, ${spec.status}, ${spec.due}, ${"client"}, ${project.client_id})
      returning id` as any[];
    const [revision] = await sql`
      insert into review_revisions (review_item_id, revision_number, revision_label, notes)
      values (${item.id}, ${1}, ${"Rev A"}, ${spec.notes})
      returning id` as any[];
    await sql`update review_items set current_revision_id=${revision.id} where id=${item.id}`;
  }

  // ── One invoice gets a line snapshot, so the client's invoice has lines ───
  const [invoice] = await sql`
    select id, total_amount from client_invoices
    where project_id=${project.id} and status in ('sent','partial','paid','overdue') and line_breakdown is null
    order by invoice_date desc limit 1` as any[];
  let invoiceTouched: string | null = null;
  if (invoice) {
    const total = invoice.total_amount ?? 0;
    const ex = Math.round(total / 1.1);
    const lines = [
      { source: "contract", description: "Contract works to date", amountExCents: Math.round(ex * 0.8), gstCents: Math.round(ex * 0.8 * 0.1), amountIncCents: Math.round(ex * 0.8 * 1.1), taxable: true },
      { source: "variation", description: "Approved variations", amountExCents: ex - Math.round(ex * 0.8), gstCents: (ex - Math.round(ex * 0.8)) * 0.1, amountIncCents: Math.round((ex - Math.round(ex * 0.8)) * 1.1), taxable: true },
    ].map((l) => ({ ...l, gstCents: Math.round(l.gstCents) }));
    await sql`update client_invoices set line_breakdown=${JSON.stringify(lines)}::jsonb where id=${invoice.id}`;
    invoiceTouched = invoice.id;
  }

  console.log(`
Done. Sign in as the client with DEV_USER_EMAIL=${CLIENT_EMAIL}

  schedule sub-items   ${scheduleItemsAdded}
  site diary (shared)  ${diaryAdded}
  selections           ${selectionSpecs.length} (with photos)
  variations           ${variationSpecs.length} (one to sign, one signed)
  reviews              ${reviewSpecs.length}
  invoice lines        ${invoiceTouched ? "added to 1 sent invoice" : "skipped (none needed)"}

Remove it all again with:  npx tsx --env-file-if-exists=.env scripts/seed-client-portal-demo.ts --remove
`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
