import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
const PROJ='6b19a946-631c-43e7-8c02-caea846e17aa';
async function main(){
  const c = await db.execute(sql`SELECT company_id FROM projects WHERE id = ${PROJ}`);
  const companyId = (((c as any).rows ?? c)[0] as any).company_id;

  const pl = await db.execute(sql`
    INSERT INTO takeoff_plans (project_id, company_id, name, object_path, page_count)
    VALUES (${PROJ}, ${companyId}, 'TKTEST Ground Floor Plan', '/takeoff/tktest.pdf', 3)
    RETURNING id`);
  const planId = (((pl as any).rows ?? pl)[0] as any).id;

  const pages: string[] = [];
  for (const n of [1,2,3]) {
    const pg = await db.execute(sql`
      INSERT INTO takeoff_plan_pages (plan_id, company_id, page_number, is_scaled, scale_ratio)
      VALUES (${planId}, ${companyId}, ${n}, true, 100) RETURNING id`);
    pages.push((((pg as any).rows ?? pg)[0] as any).id);
  }

  const mk = (x:number,pageId:string)=>({pageId, points:[{x,y:0.1},{x:x+0.2,y:0.1},{x:x+0.2,y:0.3},{x,y:0.3}], qty: 5.24});
  const items = [
    { name: "Bath 1 Floor Tiling — porcelain 600x600", type: "area", unit: "m²", geo: [mk(0.1,pages[0])] },
    { name: "Bath 1 Wall Linings to ceiling", type: "area", unit: "m²", geo: [mk(0.1,pages[0]), mk(0.4,pages[1]), mk(0.6,pages[2])] },
    { name: "Feature Wall Tiling — ensuite", type: "area", unit: "m²", geo: [mk(0.2,pages[0]), mk(0.5,pages[1]), mk(0.7,pages[2])] },
  ];
  for (const [i,it] of items.entries()) {
    await db.execute(sql`
      INSERT INTO takeoff_measurements (plan_id, page_id, project_id, company_id, name, measurement_type, color, geometry, quantity, unit, "order")
      VALUES (${planId}, ${pages[0]}, ${PROJ}, ${companyId}, ${it.name}, ${it.type}, ${['#7FBF8F','#A890D4','#DA988A'][i]},
              ${JSON.stringify(it.geo)}::json, ${it.geo.length*5.24}, ${it.unit}, ${i})`);
  }
  console.log("seeded plan", planId, "pages", pages.length, "measurements", items.length);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e?.message??e);process.exit(1);});
