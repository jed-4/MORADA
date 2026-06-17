---
name: Bill paidAmount is payment-managed
description: Why bill saves must not send paidAmount, and the integer-cents crash it caused.
---

`bills.paidAmount` is an integer **cents** column, but the BillDetail form carries it in
**dollars** (loaded as `paidAmount / 100`) purely as a defaultValue — there is no input for
it. It is otherwise managed only by recording payments + `syncBillPaidStatus`.

**The crash:** spreading the form value back into the save payload sent e.g. `$47.50 -> 47.5`
straight into the integer column → Postgres `invalid input syntax for type integer: '47.5'`
→ 500 on any bill edit (e.g. changing a cost code).

**Rule:** on bill **update**, OMIT paidAmount entirely (PATCH uses `insertBillSchema.partial()`,
and `updateBill` only spreads provided fields, so omission is safe and also avoids clobbering a
value payments/Xero changed since the form loaded). On **create**, it's 0.

**How to apply:** any time you build a bill save payload, treat money fields as cents and do
NOT pass through payment-managed fields from the form.
