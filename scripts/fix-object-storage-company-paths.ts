// One-off data fix: object-storage paths stored with a folder label where the
// company id belongs.
//
// uploadObjectEntity(buffer, mime, companyId) bakes its third argument into
// the served URL (/objects/company/<companyId>/uploads/<id>), but the
// selections-attachment and template-image upload routes passed the literal
// strings "selections" / "templates". The serving route rejects any request
// whose company segment isn't the caller's company id, so every affected
// image 404ed for everyone. The upload call sites are fixed in code; this
// script repairs the rows already stored with the bad segment by joining
// through to the real owning company.
//
// Idempotent — re-running matches nothing once paths are fixed.
//
// Usage:
//   npx tsx --env-file=<path-to-.env> scripts/fix-object-storage-company-paths.ts
//
// Per prod DB ops convention: run manually, never via db:push.

import { sql } from "drizzle-orm";
import { db } from "../server/db";

async function main() {
  // Option attachments → option → selection → project → company
  const attachments = await db.execute(sql`
    UPDATE option_attachments oa
    SET file_path = regexp_replace(oa.file_path, '^/objects/company/(selections|templates)/', '/objects/company/' || p.company_id || '/')
    FROM selection_options so
    JOIN selections s ON s.id = so.selection_id
    JOIN projects p ON p.id = s.project_id
    WHERE oa.option_id = so.id
      AND oa.file_path ~ '^/objects/company/(selections|templates)/'
  `);
  console.log(`option_attachments fixed: ${attachments.rowCount}`);

  // Product images (paths copied from option attachments via save-to-library)
  const productImages = await db.execute(sql`
    UPDATE product_images pi
    SET file_path = regexp_replace(pi.file_path, '^/objects/company/(selections|templates)/', '/objects/company/' || pr.company_id || '/')
    FROM products pr
    WHERE pi.product_id = pr.id
      AND pi.file_path ~ '^/objects/company/(selections|templates)/'
  `);
  console.log(`product_images fixed: ${productImages.rowCount}`);

  // Template imageUrls live inside selection_templates.template_data (jsonb).
  // Blunt but safe: the bad prefix only ever appears in image-path strings.
  const templates = await db.execute(sql`
    UPDATE selection_templates st
    SET template_data = replace(
      replace(st.template_data::text, '"/objects/company/templates/', '"/objects/company/' || st.company_id || '/'),
      '"/objects/company/selections/', '"/objects/company/' || st.company_id || '/'
    )::jsonb
    WHERE st.template_data::text ~ '"/objects/company/(selections|templates)/'
  `);
  console.log(`selection_templates fixed: ${templates.rowCount}`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
