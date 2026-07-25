// Founding member programme backend. Uses raw pool queries (same approach as
// the billing endpoints and referrals.ts).
//
// Flow:
//  1. A company with no subscription yet is ELIGIBLE while spots remain
//     (checkout advertises the offer and attaches the Studio coupon/trial).
//  2. The spot is only CLAIMED when the subscription actually activates —
//     the Stripe webhook sees foundingClaim=1 on the subscription metadata
//     and calls claimFoundingSpot, which re-checks the cap atomically.
//  3. Once is_founding_member is set it is never unset; the flag is what
//     grants the Studio coupon on any later plan change.

import { pool } from "./db";
import { FOUNDING_MEMBER_LIMIT } from "./config/plans";

export async function countFoundingMembers(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM companies WHERE is_founding_member = true`,
  );
  return rows[0]?.c ?? 0;
}

export async function foundingSpotsLeft(): Promise<number> {
  return Math.max(0, FOUNDING_MEMBER_LIMIT - (await countFoundingMembers()));
}

/**
 * Mark a company as a founding member iff it isn't one already AND the cap
 * still has room. The cap re-check lives inside the UPDATE so two concurrent
 * webhook deliveries can't reasonably overshoot the limit.
 */
export async function claimFoundingSpot(companyId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE companies
        SET is_founding_member = true, founding_member_at = NOW()
      WHERE id = $1
        AND is_founding_member = false
        AND (SELECT COUNT(*) FROM companies WHERE is_founding_member = true) < $2`,
    [companyId, FOUNDING_MEMBER_LIMIT],
  );
  return (rowCount ?? 0) > 0;
}
