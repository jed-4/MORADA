/**
 * The on-disk object store used in development.
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.test.json server/__tests__/local-object-storage.test.ts
 *
 * Two of these are not about convenience. Object names arrive from request
 * paths, so traversal has to be refused rather than resolved; and this backend
 * must never engage in production, where writing client documents to a
 * container's ephemeral disk would lose them on the next restart and nobody
 * would find out until a client asked for their proposal.
 */
import assert from "node:assert";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "morada-objects-"));
process.env.LOCAL_OBJECT_STORAGE_DIR = root;
delete process.env.NODE_ENV;

const { LocalObjectFile, isLocalObjectStorage, localObjectRoot, localUploadName } =
  await import("../replit_integrations/object_storage/localObjectStorage");

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

await check("a stored object comes back byte for byte", async () => {
  const file = new LocalObjectFile(localUploadName("abc"));
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  await file.save(bytes, { contentType: "image/png", metadata: { companyId: "co-1" } });
  const [back] = await file.download();
  assert.deepStrictEqual([...back], [...bytes]);
});

await check("content type and custom metadata survive", async () => {
  const [meta] = await new LocalObjectFile(localUploadName("abc")).getMetadata();
  assert.strictEqual(meta.contentType, "image/png");
  assert.strictEqual(meta.metadata?.companyId, "co-1");
  assert.strictEqual(meta.size, 7);
});

await check("exists() answers honestly either way", async () => {
  assert.deepStrictEqual(await new LocalObjectFile(localUploadName("abc")).exists(), [true]);
  assert.deepStrictEqual(await new LocalObjectFile(localUploadName("nope")).exists(), [false]);
});

await check("setMetadata MERGES, so an ACL write does not drop the company", async () => {
  // setObjectAclPolicy writes one key. Replacing the object would orphan the
  // companyId the upload recorded.
  const file = new LocalObjectFile(localUploadName("abc"));
  await file.setMetadata({ metadata: { "custom:aclPolicy": '{"visibility":"private"}' } });
  const [meta] = await file.getMetadata();
  assert.strictEqual(meta.metadata?.companyId, "co-1", "companyId must survive an ACL write");
  assert.strictEqual(meta.metadata?.["custom:aclPolicy"], '{"visibility":"private"}');
  assert.strictEqual(meta.contentType, "image/png", "content type must survive too");
});

await check("delete removes the object AND its metadata", async () => {
  const file = new LocalObjectFile(localUploadName("doomed"));
  await file.save(Buffer.from("x"), { contentType: "text/plain" });
  await file.delete();
  assert.deepStrictEqual(await file.exists(), [false]);
  assert.ok(!existsSync(join(root, "uploads", "doomed.meta.json")), "metadata sidecar must go too");
});

await check("traversal out of the store is refused, not resolved", async () => {
  for (const escape of ["../../../etc/passwd", "uploads/../../.env", "..", "a/../../b"]) {
    await assert.rejects(
      async () => { await new LocalObjectFile(escape).exists(); },
      /Refusing to read outside/,
      `${escape} must be refused`,
    );
  }
});

await check("an absolute-looking name stays INSIDE the store", async () => {
  /* Object names have no leading slash in a bucket, so one is stripped rather
     than treated as the filesystem root: "/etc/hosts" is an object called
     etc/hosts in this store, NOT the machine's hosts file. Asserted because
     the alternative — resolving it against / — would be a file-read primitive
     on any path an attacker could get into an objectPath. */
  await new LocalObjectFile("/etc/hosts").save(Buffer.from("decoy"), { contentType: "text/plain" });
  assert.ok(existsSync(join(root, "etc", "hosts")), "must land under the store root");

  const file = new LocalObjectFile("/uploads/slashy");
  await file.save(Buffer.from("y"), { contentType: "text/plain" });
  assert.ok(existsSync(join(root, "uploads", "slashy")));
});

await check("an explicit directory is honoured", () => {
  assert.strictEqual(localObjectRoot(), root);
  assert.strictEqual(isLocalObjectStorage(), true);
});

await check("production NEVER stores objects on disk", () => {
  // Even with the directory explicitly set — a misconfigured deploy must not
  // quietly write client documents somewhere they will be lost.
  process.env.NODE_ENV = "production";
  assert.strictEqual(isLocalObjectStorage(), false);
  delete process.env.NODE_ENV;
});

await check("outside production, a real bucket still wins", () => {
  const dir = process.env.LOCAL_OBJECT_STORAGE_DIR;
  delete process.env.LOCAL_OBJECT_STORAGE_DIR;
  process.env.PRIVATE_OBJECT_DIR = "/bucket/private";
  assert.strictEqual(isLocalObjectStorage(), false, "a configured bucket is used as-is");
  delete process.env.PRIVATE_OBJECT_DIR;
  assert.strictEqual(isLocalObjectStorage(), true, "and without one, disk takes over");
  process.env.LOCAL_OBJECT_STORAGE_DIR = dir;
});

rmSync(root, { recursive: true, force: true });
console.log(`\n${passed} local-object-storage checks passed`);
