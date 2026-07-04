---
name: Mention notification tenant validation
description: Why @mention notification fan-out must validate mentioned user IDs against the company
---

Rule: any notify*Mentions helper (e.g. notifyTaskCommentMentions, RFI/comment
equivalents) must resolve parsed mention userIds against
`storage.getUsersByCompany(companyId)` and drop any ID not in that set BEFORE
calling `createNotification`.

**Why:** mention markup is `@[Name](userId:uuid)` stored verbatim in user
content. `createNotification` → `sendPushForNotification` delivers by userId
only, with no company check. A user who knows another company's user UUID could
craft a mention and leak the task title/preview cross-tenant via in-app
notification + mobile push. Found in task #415 code review.

**How to apply:** filter in the domainNotifications helper (server-side), not the
route. Route-level getOwnedTask only scopes the task, not the mention targets.
