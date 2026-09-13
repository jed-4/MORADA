import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { Readable } from "node:stream";

/**
 * Object storage, on the developer's disk.
 *
 * Uploads in this app go through Replit's GCS sidecar at 127.0.0.1:1106. That
 * process does not exist outside Replit, so on a laptop every upload 500s —
 * and no environment variable fixes it, because the credentials themselves are
 * fetched from the sidecar. The practical effect was that two features could
 * be built and reviewed but never actually exercised until they reached a
 * deployed environment: the proposal's imported PDF pages and the cover-page
 * photo.
 *
 * This is the same storage, backed by a directory. It exists to make those
 * paths runnable locally, NOT to be a production store — see isLocalObjectStorage.
 *
 * ── Why a duck type rather than an interface ────────────────────────────────
 * ObjectStorageService hands GCS `File` objects to downloadObject() and to the
 * ACL helpers, and twenty-odd call sites construct the service directly. The
 * whole surface those paths actually touch is six members: name, exists(),
 * getMetadata(), setMetadata(), createReadStream() and save(). Implementing
 * exactly those means downloadObject and objectAcl work unchanged, and the
 * call sites never learn which backend they are on.
 */

/** Where the files go. Gitignored; safe to delete at any time. */
export function localObjectRoot(): string {
  return resolve(process.env.LOCAL_OBJECT_STORAGE_DIR || ".local-object-storage");
}

/**
 * True when this process should store objects on disk.
 *
 * Production is excluded unconditionally, and not merely by convention: a
 * misconfigured deploy that silently wrote client documents to a container's
 * ephemeral disk would lose them on the next restart, and nobody would find
 * out until a client asked for their proposal. An explicit
 * LOCAL_OBJECT_STORAGE_DIR is honoured outside production only.
 */
export function isLocalObjectStorage(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.LOCAL_OBJECT_STORAGE_DIR) return true;
  // The condition that used to be a 500: a dev machine with no bucket.
  return !process.env.PRIVATE_OBJECT_DIR;
}

interface StoredMetadata {
  contentType?: string;
  /** GCS custom metadata — the ACL policy lives in here. */
  metadata?: Record<string, string>;
}

/**
 * A stored object's absolute path, guarded against traversal.
 *
 * Object names arrive from request paths, so "../../.env" is a shape this must
 * refuse rather than resolve.
 */
function pathFor(name: string): string {
  const root = localObjectRoot();
  const full = resolve(root, name.replace(/^\/+/, ""));
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error(`Refusing to read outside the object store: ${name}`);
  }
  return full;
}

const metaPathFor = (full: string) => `${full}.meta.json`;

/** The members of a GCS File that this codebase actually uses. */
export class LocalObjectFile {
  constructor(public readonly name: string) {}

  private get full(): string {
    return pathFor(this.name);
  }

  async exists(): Promise<[boolean]> {
    return [existsSync(this.full)];
  }

  async getMetadata(): Promise<[{ contentType?: string; size?: number; metadata?: Record<string, string> }]> {
    const full = this.full;
    let stored: StoredMetadata = {};
    try {
      stored = JSON.parse(await readFile(metaPathFor(full), "utf8")) as StoredMetadata;
    } catch {
      // A file written before metadata was recorded, or by hand. Not an error:
      // the caller only needs a content type and a size.
    }
    let size: number | undefined;
    try {
      size = (await stat(full)).size;
    } catch {
      size = undefined;
    }
    return [{ contentType: stored.contentType, size, metadata: stored.metadata }];
  }

  async setMetadata(update: { metadata?: Record<string, string> }): Promise<void> {
    const full = this.full;
    const [current] = await this.getMetadata();
    const next: StoredMetadata = {
      contentType: current.contentType,
      // Merge: setObjectAclPolicy writes one key and must not drop the rest.
      metadata: { ...(current.metadata ?? {}), ...(update.metadata ?? {}) },
    };
    await mkdir(dirname(full), { recursive: true });
    await writeFile(metaPathFor(full), JSON.stringify(next, null, 2));
  }

  createReadStream(): Readable {
    return createReadStream(this.full);
  }

  /** GCS resolves [Buffer]; the tuple is what call sites destructure. */
  async download(): Promise<[Buffer]> {
    return [await readFile(this.full)];
  }

  async delete(): Promise<void> {
    // The metadata sidecar goes with it, or a later write to the same name
    // would inherit the dead object's content type and ACL.
    await Promise.allSettled([rm(this.full, { force: true }), rm(metaPathFor(this.full), { force: true })]);
  }

  async save(
    body: Buffer,
    options?: { contentType?: string; metadata?: Record<string, string> },
  ): Promise<void> {
    const full = this.full;
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
    await writeFile(
      metaPathFor(full),
      JSON.stringify(
        { contentType: options?.contentType, metadata: options?.metadata ?? {} } satisfies StoredMetadata,
        null,
        2,
      ),
    );
  }
}

/** Mirrors the `${dir}/uploads/${id}` layout the GCS paths use. */
export function localUploadName(objectId: string): string {
  return join("uploads", objectId);
}
