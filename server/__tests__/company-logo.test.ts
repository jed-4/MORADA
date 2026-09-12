/**
 * The company logo: upload guards, the public read, and the email URL.
 *
 * This adds the app's only unauthenticated object-ish route, so the shape of
 * what it will and will not serve is worth pinning down rather than trusting.
 *
 * Run (needs a dev server on :3042 and DATABASE_URL):
 *   npx tsx --env-file=.env server/__tests__/company-logo.test.ts
 */
import assert from "node:assert";
import zlib from "node:zlib";
import { renderClientEmail } from "../services/clientEmailShell";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3042";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

/** A tiny valid PNG, built rather than fixtured so the file stays self-contained. */
function tinyPng(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  // Minimal CRC32 so this does not depend on a Node version that exports one.
  function crc32(buf: Buffer): number {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  }
  const w = 4;
  const h = 4;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.concat(
    Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x6e)])),
  );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function post(name: string, bytes: Buffer, type: string) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), name);
  return fetch(`${BASE}/api/company-settings/logo`, { method: "POST", body: form });
}

async function main() {
  console.log("company logo");

  await check("a non-image is refused with a message the UI can show", async () => {
    const res = await post("notes.txt", Buffer.from("not an image"), "text/plain");
    assert.strictEqual(res.status, 400, "should be a client error, not a 500");
    const body = await res.json();
    // multer rejects BEFORE the handler, so without a route-level error
    // middleware this came back as a 500 carrying `message`, which the client
    // does not read — the user saw a generic failure.
    assert.ok(body.error, "the client reads `error`, not `message`");
    assert.match(body.error, /JPEG, PNG, GIF or WebP/);
  });

  await check("an oversize file is refused by size, not by timing out", async () => {
    const res = await post("huge.png", Buffer.alloc(3 * 1024 * 1024, 1), "image/png");
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /smaller than 2 MB/);
  });

  let logoUrl = "";
  await check("a real image uploads and yields a cache-busted public url", async () => {
    const res = await post("logo.png", tinyPng(), "image/png");
    // Read the body ONCE — assert.strictEqual's message argument is evaluated
    // eagerly, so `await res.text()` there consumes it before .json() can.
    const body = await res.json().catch(() => ({}));
    assert.strictEqual(res.status, 200, JSON.stringify(body));
    logoUrl = body.logoUrl;
    assert.match(logoUrl, /^\/api\/public\/company\/[^/]+\/logo\?v=\d+$/);
  });

  await check("the logo serves with NO session, which is the whole point", async () => {
    // A homeowner's mail client has never logged in. Every other object route
    // in the app is behind requireAuth plus a tenant check; this one cannot be.
    const res = await fetch(`${BASE}${logoUrl}`, { headers: { cookie: "" } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("content-type"), "image/png");
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.deepStrictEqual(
      [...bytes.subarray(0, 4)],
      [0x89, 0x50, 0x4e, 0x47],
      "the PNG came back corrupted",
    );
    assert.match(res.headers.get("cache-control") || "", /max-age/);
  });

  await check("the settings endpoint never ships the logo bytes", async () => {
    // It is fetched on most pages; a base64 image on every read is a real cost
    // for data the client cannot use.
    const res = await fetch(`${BASE}/api/company-settings`);
    const body = await res.json();
    assert.ok(body.logoUrl, "logoUrl should still be there — the client renders from it");
    assert.strictEqual(body.logoData, undefined, "logo bytes leaked into the settings payload");
  });

  await check("a company with no logo 404s rather than erroring", async () => {
    const res = await fetch(`${BASE}/api/public/company/00000000-0000-0000-0000-000000000000/logo`);
    assert.strictEqual(res.status, 404);
  });

  await check("the public route serves one resource and cannot be walked", async () => {
    // The object is looked up from the company's own settings row, never from
    // the URL, so there is no path for a caller to supply.
    for (const path of [
      "/api/public/company/x/../../objects/uploads/anything",
      "/api/public/company/x/logo/../../secrets",
    ]) {
      const res = await fetch(`${BASE}${path}`);
      assert.ok(res.status === 404 || res.status === 401, `${path} returned ${res.status}`);
    }
  });

  await check("removing the logo clears it everywhere", async () => {
    const res = await fetch(`${BASE}/api/company-settings/logo`, { method: "DELETE" });
    assert.strictEqual(res.status, 200);
    const after = await fetch(`${BASE}${logoUrl}`);
    assert.strictEqual(after.status, 404, "the public route still serves a removed logo");
    const settings = await (await fetch(`${BASE}/api/company-settings`)).json();
    assert.ok(!settings.logoUrl, "settings still advertise a removed logo");
  });

  await check("a client email resolves the relative logo url to an absolute one", () => {
    // An email is read outside the app. Before this, a relative path failed
    // `new URL()`, safeUrl returned null, and the logo was silently dropped
    // from every branded email.
    process.env.APP_BASE_URL = "https://app.moradaco.com.au";
    const html = renderClientEmail({
      brand: { companyName: "Lighthouse", logoUrl: "/api/public/company/abc/logo?v=1" },
      body: "hello",
    });
    assert.match(html, /<img src="https:\/\/app\.moradaco\.com\.au\/api\/public\/company\/abc\/logo\?v=1"/);
  });

  await check("resolving relative urls did not open a javascript: hole", () => {
    const html = renderClientEmail({
      brand: { companyName: "X", logoUrl: "javascript:alert(1)" },
      body: "b",
    });
    assert.ok(!/<img/.test(html), "a javascript: logo was rendered");
  });

  console.log(`\n${passed} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
