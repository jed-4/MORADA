/**
 * Object storage, backed by an S3-compatible API (Cloudflare R2).
 *
 * Replaces the previous Replit implementation, which used
 * `@google-cloud/storage` authenticated through a sidecar on
 * http://127.0.0.1:1106 — a process that only exists inside a Replit
 * container, for both credentials and signed-URL minting.
 *
 * ── The one invariant that matters ────────────────────────────────────────
 *
 * The stored path format is UNCHANGED and must stay that way:
 *
 *     /objects/company/<companyId>/uploads/<uuid>   ← what the DB holds
 *     /objects/uploads/<uuid>                       ← legacy rows, still read
 *
 * Those are app-level routes, not storage URLs: no bucket, no host, no
 * provider anywhere in them. That is why the migration is a byte-copy — copy
 * the objects to R2 preserving keys and not one database row changes. Nothing
 * in this file may leak a bucket name or endpoint into a path it returns.
 *
 * ── Key derivation ───────────────────────────────────────────────────────
 *
 * The storage key is derived exactly as the GCS implementation derived it, so
 * a key-preserving copy lands on the same objects:
 *
 *     PRIVATE_OBJECT_DIR = /<legacy-bucket>/<prefix...>
 *                            │               └── keyPrefix
 *                            └── ignored when R2_BUCKET is set
 *
 *     app path  /objects/uploads/<uuid>
 *     entityId            uploads/<uuid>
 *     key       <keyPrefix>/uploads/<uuid>
 *
 * Keeping PRIVATE_OBJECT_DIR in its original `/bucket/prefix` shape means the
 * value does not have to be rewritten during cutover: set R2_BUCKET to the new
 * bucket and the first segment is simply ignored. If PRIVATE_OBJECT_DIR has no
 * prefix segments the key is just `uploads/<uuid>`.
 */
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import type { Response } from "express";
import { Readable } from "stream";

/**
 * Thrown when a key does not exist. Several routes branch on
 * `error.name === "ObjectNotFoundError"` to answer 404 instead of 500, so the
 * name is load-bearing — do not rename it.
 */
export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export interface ObjectMetadata {
  /** MIME type as stored, or undefined when the object carries none. */
  contentType?: string;
  /** Size in bytes. 0 when the store did not report one. */
  size: number;
  /**
   * User metadata stamped at upload time. `companyId` is the one that matters:
   * the Xero attachment push uses it as defence in depth before sending a file
   * to an external system.
   */
  custom: Record<string, string>;
}

/** A 404 from S3 arrives under several names depending on the operation. */
function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e?.name === "NoSuchKey" ||
    e?.name === "NotFound" ||
    e?.$metadata?.httpStatusCode === 404
  );
}

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (cachedClient) return cachedClient;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    const missing = [
      !accountId && "R2_ACCOUNT_ID",
      !accessKeyId && "R2_ACCESS_KEY_ID",
      !secretAccessKey && "R2_SECRET_ACCESS_KEY",
    ].filter(Boolean);
    throw new Error(
      `Object storage is not configured — missing ${missing.join(", ")}. ` +
        `Set the R2 credentials for this environment.`,
    );
  }

  cachedClient = new S3Client({
    // R2 ignores the region but the SDK requires one.
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cachedClient;
}

/** Test seam: drops the memoised client so env changes take effect. */
export function resetObjectStorageClient(): void {
  cachedClient = null;
}

export class ObjectStorageService {
  constructor() {}

  // ── configuration ──────────────────────────────────────────────────────

  /**
   * The configured private object directory, in its original
   * `/<bucket>/<prefix>` form. Kept verbatim so the env var does not need
   * rewriting at cutover.
   */
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. It supplies the key prefix for stored " +
          "objects and must match the prefix the objects were copied under.",
      );
    }
    return dir;
  }

  /** The R2 bucket. Falls back to the leading segment of PRIVATE_OBJECT_DIR. */
  private getBucket(): string {
    const explicit = process.env.R2_BUCKET;
    if (explicit) return explicit;

    const segments = this.getPrivateObjectDir().replace(/^\/+/, "").split("/");
    const legacy = segments[0];
    if (!legacy) {
      throw new Error(
        "R2_BUCKET not set and PRIVATE_OBJECT_DIR has no leading bucket segment.",
      );
    }
    return legacy;
  }

  /**
   * Key prefix: everything in PRIVATE_OBJECT_DIR after the bucket segment.
   * May legitimately be empty.
   */
  private getKeyPrefix(): string {
    const segments = this.getPrivateObjectDir()
      .replace(/^\/+/, "")
      .replace(/\/+$/, "")
      .split("/")
      .filter(Boolean);
    return segments.slice(1).join("/");
  }

  // ── path ↔ key mapping ─────────────────────────────────────────────────

  /**
   * Maps an app-level `/objects/...` path to a storage key.
   *
   * Accepts both stored forms. The `/company/<id>` segment is cosmetic — the
   * bucket is flat and every consumer strips it — so it is stripped here once
   * rather than at each call site. Tenant enforcement lives in the route guard
   * and the signed upload grant, not in this segment; see
   * server/utils/signedGrant.ts for why.
   */
  objectPathToKey(objectPath: string): string {
    if (typeof objectPath !== "string" || !objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    // /objects/company/<id>/uploads/<uuid> → /objects/uploads/<uuid>
    const withoutCompany = objectPath.replace(
      /^\/objects\/company\/[^/]+\//,
      "/objects/",
    );

    const parts = withoutCompany.slice(1).split("/");
    if (parts.length < 2) throw new ObjectNotFoundError();

    const entityId = parts.slice(1).join("/");
    if (!entityId || entityId.includes("..")) throw new ObjectNotFoundError();

    const prefix = this.getKeyPrefix();
    return prefix ? `${prefix}/${entityId}` : entityId;
  }

  // ── low-level, key-addressed ───────────────────────────────────────────

  async getStream(key: string): Promise<{ body: Readable; meta: ObjectMetadata }> {
    let out: GetObjectCommandOutput;
    try {
      out = await getClient().send(
        new GetObjectCommand({ Bucket: this.getBucket(), Key: key }),
      );
    } catch (err) {
      if (isNotFound(err)) throw new ObjectNotFoundError();
      throw err;
    }
    if (!out.Body) throw new ObjectNotFoundError();
    return {
      body: out.Body as Readable,
      meta: {
        contentType: out.ContentType,
        size: Number(out.ContentLength ?? 0),
        custom: out.Metadata ?? {},
      },
    };
  }

  async getBuffer(key: string): Promise<Buffer> {
    const { body } = await this.getStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async getMetadata(key: string): Promise<ObjectMetadata> {
    try {
      const out = await getClient().send(
        new HeadObjectCommand({ Bucket: this.getBucket(), Key: key }),
      );
      return {
        contentType: out.ContentType,
        size: Number(out.ContentLength ?? 0),
        custom: out.Metadata ?? {},
      };
    } catch (err) {
      if (isNotFound(err)) throw new ObjectNotFoundError();
      throw err;
    }
  }

  async put(
    key: string,
    body: Buffer,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    await getClient().send(
      new PutObjectCommand({
        Bucket: this.getBucket(),
        Key: key,
        Body: body,
        ContentType: contentType || "application/octet-stream",
        Metadata: metadata,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await getClient().send(
      new DeleteObjectCommand({ Bucket: this.getBucket(), Key: key }),
    );
  }

  /** Presigned PUT, for the legacy direct-to-storage upload path. */
  async presignPut(key: string, contentType: string | undefined, ttlSec: number): Promise<string> {
    return getSignedUrl(
      getClient(),
      new PutObjectCommand({
        Bucket: this.getBucket(),
        Key: key,
        ContentType: contentType || undefined,
      }),
      { expiresIn: ttlSec },
    );
  }

  // ── app-path addressed (what the routes use) ───────────────────────────

  /** Metadata for a stored `/objects/...` path. */
  async getObjectMetadata(objectPath: string): Promise<ObjectMetadata> {
    return this.getMetadata(this.objectPathToKey(objectPath));
  }

  /** Full contents of a stored `/objects/...` path. */
  async getObjectBuffer(objectPath: string): Promise<Buffer> {
    return this.getBuffer(this.objectPathToKey(objectPath));
  }

  /** Best-effort delete for a stored `/objects/...` path. */
  async deleteObject(objectPath: string): Promise<void> {
    return this.delete(this.objectPathToKey(objectPath));
  }

  /**
   * Streams a stored object to an Express response.
   *
   * Cache-Control is `private` unconditionally. The GCS implementation chose
   * between public and private from an ACL policy that nothing ever wrote —
   * `objectAcl.ts` had no callers — so every object took the private branch in
   * practice. Making that explicit changes no behaviour and removes the last
   * reason to keep an ACL layer.
   */
  async downloadToResponse(
    objectPath: string,
    res: Response,
    cacheTtlSec: number = 3600,
  ): Promise<void> {
    const { body, meta } = await this.getStream(this.objectPathToKey(objectPath));

    res.set({
      "Content-Type": meta.contentType || "application/octet-stream",
      "Cache-Control": `private, max-age=${cacheTtlSec}`,
    });
    if (meta.size > 0) res.set("Content-Length", String(meta.size));

    await new Promise<void>((resolve, reject) => {
      body.on("error", (err) => {
        console.error("[objectStorage] stream error:", err);
        if (!res.headersSent) res.status(500).json({ error: "Error streaming file" });
        // Resolve rather than reject: the response is already answered, and a
        // rejection here would be re-reported as a second failure by callers
        // that map thrown errors onto their own status codes.
        resolve();
      });
      body.on("end", () => resolve());
      body.pipe(res).on("error", reject);
    });
  }

  /**
   * Writes a buffer and returns the app-level path to store on the row.
   *
   * `companyId` is baked into the returned path AND stamped into the object's
   * user metadata. The path segment is cosmetic (see objectPathToKey); the
   * metadata stamp is the one the Xero push actually checks.
   */
  async uploadObjectEntity(
    buffer: Buffer,
    contentType: string,
    companyId: string,
    /** Optional extension, kept on the key so content sniffing has a hint. */
    extension?: string,
  ): Promise<string> {
    const objectId = randomUUID();
    const suffix = extension ? `${objectId}.${extension.replace(/^\./, "")}` : objectId;
    const entityId = `uploads/${suffix}`;
    const prefix = this.getKeyPrefix();

    await this.put(
      prefix ? `${prefix}/${entityId}` : entityId,
      buffer,
      contentType || "application/octet-stream",
      companyId ? { companyId } : undefined,
    );

    return `/objects/company/${companyId}/${entityId}`;
  }

  /**
   * Mints a presigned PUT for the legacy direct-upload flow, together with the
   * app-level path the object will occupy.
   *
   * The GCS version returned only a URL and the caller reverse-engineered the
   * path out of it by string-matching `https://storage.googleapis.com/...`.
   * Returning both removes that coupling to a provider's URL shape.
   */
  async getObjectEntityUploadURL(
    companyId: string,
    contentType?: string,
  ): Promise<{ uploadURL: string; objectPath: string }> {
    const objectId = randomUUID();
    const entityId = `uploads/${objectId}`;
    const prefix = this.getKeyPrefix();
    const key = prefix ? `${prefix}/${entityId}` : entityId;

    const uploadURL = await this.presignPut(key, contentType, 900);
    return { uploadURL, objectPath: `/objects/company/${companyId}/${entityId}` };
  }
}

/** Shared instance. Cheap to construct; the S3 client underneath is memoised. */
export const objectStorage = new ObjectStorageService();
