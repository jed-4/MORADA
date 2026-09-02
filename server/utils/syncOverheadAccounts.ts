import { db } from "../db";
import { eq, inArray } from "drizzle-orm";
import { xeroService } from "../services/xeroService";
import { overheadCategories, overheadItems } from "@shared/schema";

export interface AccountSyncResult {
  created: number;
  updated: number;
}

/**
 * Mirror the company's Xero chart of accounts into overhead_items.
 *
 * Previously this only ever ran when somebody pressed "Sync accounts from Xero"
 * in the UI, which made overhead_items a hand-refreshed snapshot: any account
 * added or re-coded in Xero afterwards had no row in Monthly Actuals and its
 * spend was invisible. It now also runs nightly, immediately before the actuals
 * sync, so the account list is current before any figures are written.
 */
export async function syncOverheadAccountsForCompany(
  companyId: string,
  connectionId: string,
): Promise<AccountSyncResult> {
  const accounts = await xeroService.getAccounts(connectionId);
  if (!accounts.length) return { created: 0, updated: 0 };


  // Fetch existing categories and items for this company
  const existingCats = await db.select().from(overheadCategories).where(eq(overheadCategories.companyId, companyId));
  const existingItems = await db.select().from(overheadItems)
    .innerJoin(overheadCategories, eq(overheadItems.categoryId, overheadCategories.id))
    .where(eq(overheadCategories.companyId, companyId));

  // Cleanup: remove any existing overhead items that originated from a Xero
  // direct-cost account. Direct costs have their own collapsible section in
  // the UI now and must not double-count under Overheads. Cascading delete
  // wipes their overhead_month_actuals rows automatically.
  const directCostItemIds = existingItems
    .filter(r => r.overhead_items.xeroAccountType === "DIRECTCOSTS")
    .map(r => r.overhead_items.id);
  if (directCostItemIds.length > 0) {
    await db.delete(overheadItems).where(inArray(overheadItems.id, directCostItemIds));
  }
  // Drop any "Direct Costs" category that's now empty after the deletion
  const directCostCats = existingCats.filter(c => c.name.toLowerCase() === "direct costs");
  for (const cat of directCostCats) {
    const remaining = await db.select({ id: overheadItems.id }).from(overheadItems).where(eq(overheadItems.categoryId, cat.id));
    if (remaining.length === 0) {
      await db.delete(overheadCategories).where(eq(overheadCategories.id, cat.id));
    }
  }

  // Simplified category mapping: only EXPENSE-style accounts become overhead items.
  // DIRECTCOSTS accounts are intentionally omitted — they're handled by the
  // Direct Costs section and pulled directly from the P&L breakdown JSONB.
  const TYPE_LABEL: Record<string, string> = {
    EXPENSE: "Overheads",
    OVERHEADS: "Overheads",
    CURRLIAB: "Overheads",
  };

  // Legacy category names that should be merged into the simplified categories
  const LEGACY_TO_TARGET: Record<string, string> = {
    "general expenses": "overheads",
    "current liabilities": "overheads",
  };

  // Migrate items from legacy categories to their target categories
  for (const [legacyName, targetName] of Object.entries(LEGACY_TO_TARGET)) {
    const legacyCat = existingCats.find(c => c.name.toLowerCase() === legacyName);
    if (!legacyCat) continue;
    // Ensure target category exists
    let targetCat = existingCats.find(c => c.name.toLowerCase() === targetName);
    if (!targetCat) {
      const label = targetName === "overheads" ? "Overheads" : "Direct Costs";
      const [nc] = await db.insert(overheadCategories).values({ companyId, name: label, sortOrder: 0 }).returning();
      targetCat = nc;
      existingCats.push(targetCat);
    }
    // Move all items from legacy to target
    await db.update(overheadItems).set({ categoryId: targetCat.id }).where(eq(overheadItems.categoryId, legacyCat.id));
    // Delete now-empty legacy category
    await db.delete(overheadCategories).where(eq(overheadCategories.id, legacyCat.id));
  }

  // Re-fetch current state after migration
  const currentCats = await db.select().from(overheadCategories).where(eq(overheadCategories.companyId, companyId));
  const currentItems = await db.select().from(overheadItems)
    .innerJoin(overheadCategories, eq(overheadItems.categoryId, overheadCategories.id))
    .where(eq(overheadCategories.companyId, companyId));

  const catByName = new Map(currentCats.map(c => [c.name.toLowerCase(), c.id]));
  const itemByCode = new Map(currentItems
    .filter(r => r.overhead_items.xeroAccountCode)
    .map(r => [r.overhead_items.xeroAccountCode as string, r.overhead_items.id]));

  let created = 0;
  let updated = 0;

  for (const acc of accounts) {
    const accCode: string = acc.Code?.trim() || "";
    if (!accCode) continue; // skip accounts with no code — no stable upsert key
    const accName: string = acc.Name || "";
    const accType: string = acc.Type || "EXPENSE";
    // Skip direct-cost accounts entirely — they belong in the Direct Costs section, not Overheads
    if (accType === "DIRECTCOSTS") continue;
    const catLabel = TYPE_LABEL[accType] || "Overheads";

    // Upsert category by name
    let catId = catByName.get(catLabel.toLowerCase());
    if (!catId) {
      const [newCat] = await db.insert(overheadCategories)
        .values({ companyId, name: catLabel, sortOrder: 0 })
        .returning();
      catId = newCat.id;
      catByName.set(catLabel.toLowerCase(), catId);
    }

    // Upsert item by xeroAccountCode
    const existingItemId = accCode ? itemByCode.get(accCode) : null;
    if (existingItemId) {
      // Update name and xeroAccountType only — preserve budget, frequency and buildproGroup
      await db.update(overheadItems)
        .set({ name: accName, xeroSynced: true, xeroAccountCode: accCode || null, xeroAccountType: accType || null })
        .where(eq(overheadItems.id, existingItemId));
      updated++;
    } else {
      // Create new item
      const [newItem] = await db.insert(overheadItems).values({
        categoryId: catId,
        name: accName,
        frequency: "monthly",
        budgetCents: 0,
        xeroAccountCode: accCode || null,
        xeroAccountType: accType || null,
        xeroSynced: true,
        notes: null,
        sortOrder: 0,
      }).returning();
      created++;
      if (accCode && newItem) itemByCode.set(accCode, newItem.id);
    }
  }

  return { created, updated };
}
