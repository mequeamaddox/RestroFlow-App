import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Response } from "express";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

const IS_PROD = process.env.NODE_ENV === "production";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Internal object reference — opaque to callers, used between
// getObjectEntityFile() and downloadObject().
// ---------------------------------------------------------------------------

type ObjectRef =
  | { type: "s3"; key: string }
  | { type: "local"; filePath: string };

// ---------------------------------------------------------------------------
// S3 config helpers
// ---------------------------------------------------------------------------

interface S3Config {
  client: S3Client;
  bucket: string;
}

function buildS3Config(): S3Config | null {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  const missing = (
    [
      !bucket && "AWS_S3_BUCKET",
      !region && "AWS_REGION",
      !accessKeyId && "AWS_ACCESS_KEY_ID",
      !secretAccessKey && "AWS_SECRET_ACCESS_KEY",
    ] as (string | false)[]
  ).filter(Boolean) as string[];

  if (missing.length > 0) {
    const msg = `Missing required AWS S3 env vars: ${missing.join(", ")}`;
    if (IS_PROD) {
      throw new Error(`[ObjectStorage] ${msg}`);
    }
    console.warn(`⚠️  [ObjectStorage] ${msg} — using local disk fallback (dev only)`);
    return null;
  }

  const client = new S3Client({
    region: region!,
    credentials: {
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
    },
  });

  return { client, bucket: bucket! };
}

/**
 * Call once at server startup.  In production this will throw immediately
 * if any of the four required env vars are absent, preventing the server
 * from starting in a broken state.
 */
export function validateObjectStorageConfig(): void {
  if (IS_PROD) {
    buildS3Config(); // throws on missing vars
    console.log("✅ [ObjectStorage] AWS S3 configured (production)");
  } else {
    const cfg = buildS3Config();
    if (cfg) {
      console.log("✅ [ObjectStorage] AWS S3 configured (development)");
    } else {
      console.log("⚠️  [ObjectStorage] Using local disk fallback (development)");
    }
  }
}

// ---------------------------------------------------------------------------
// Content-type inference for local-disk fallback
// ---------------------------------------------------------------------------

const EXT_CT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".txt": "text/plain",
};

// ---------------------------------------------------------------------------
// ObjectStorageService
// ---------------------------------------------------------------------------

export class ObjectStorageService {
  private s3: S3Config | null;

  constructor() {
    this.s3 = buildS3Config();
  }

  // -------------------------------------------------------------------------
  // uploadBuffer — server-side upload (multer memoryStorage → S3 / local disk)
  //
  // Returns: /objects/{subdir}/{uuid}   — stable app-internal path
  // -------------------------------------------------------------------------
  async uploadBuffer(
    buffer: Buffer,
    contentType: string,
    subdir = "invoices"
  ): Promise<string> {
    const objectId = randomUUID();
    const appPath = `/objects/${subdir}/${objectId}`;

    if (this.s3) {
      const key = `${subdir}/${objectId}`;
      await this.s3.client.send(
        new PutObjectCommand({
          Bucket: this.s3.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        })
      );
      console.log(
        `[ObjectStorage] Uploaded to S3: s3://${this.s3.bucket}/${key}`
      );
    } else {
      if (IS_PROD) {
        throw new Error(
          "[ObjectStorage] AWS S3 not configured — cannot store files in production"
        );
      }
      // Dev-only local disk fallback
      const localPath = path.join("uploads", subdir, objectId);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, buffer);
      console.log(`[ObjectStorage] Saved to local disk (dev): ${localPath}`);
    }

    return appPath;
  }

  // -------------------------------------------------------------------------
  // getObjectEntityFile — resolves /objects/... to an ObjectRef for download
  // -------------------------------------------------------------------------
  async getObjectEntityFile(objectPath: string): Promise<ObjectRef> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    // /objects/{subdir}/{uuid}  →  {subdir}/{uuid}
    const key = objectPath.slice("/objects/".length);

    if (this.s3) {
      try {
        await this.s3.client.send(
          new HeadObjectCommand({ Bucket: this.s3.bucket, Key: key })
        );
      } catch (err: any) {
        const status = err.$metadata?.httpStatusCode;
        if (err.name === "NotFound" || status === 404 || status === 403) {
          throw new ObjectNotFoundError();
        }
        throw err;
      }
      return { type: "s3", key };
    }

    // Dev fallback
    const localPath = path.join("uploads", key);
    if (!fs.existsSync(localPath)) throw new ObjectNotFoundError();
    return { type: "local", filePath: localPath };
  }

  // -------------------------------------------------------------------------
  // downloadObject — stream an ObjectRef to an Express response
  // -------------------------------------------------------------------------
  async downloadObject(
    ref: ObjectRef,
    res: Response,
    cacheTtlSec = 3600
  ): Promise<void> {
    try {
      if (ref.type === "s3") {
        const result = await this.s3!.client.send(
          new GetObjectCommand({ Bucket: this.s3!.bucket, Key: ref.key })
        );

        res.set({
          "Content-Type": result.ContentType || "application/octet-stream",
          "Cache-Control": `private, max-age=${cacheTtlSec}`,
          ...(result.ContentLength
            ? { "Content-Length": String(result.ContentLength) }
            : {}),
        });

        // AWS SDK v3 returns a Node.js Readable in Node.js environments
        const body = result.Body as NodeJS.ReadableStream;
        body.on("error", (err) => {
          console.error("[ObjectStorage] S3 stream error:", err);
          if (!res.headersSent)
            res.status(500).json({ error: "Error streaming file" });
        });
        body.pipe(res);
      } else {
        // Local disk (dev fallback)
        const ext = path.extname(ref.filePath).toLowerCase();
        res.set({
          "Content-Type": EXT_CT[ext] || "application/octet-stream",
          "Cache-Control": `private, max-age=${cacheTtlSec}`,
        });
        fs.createReadStream(ref.filePath).on("error", (err) => {
          console.error("[ObjectStorage] Local stream error:", err);
          if (!res.headersSent)
            res.status(500).json({ error: "Error streaming file" });
        }).pipe(res);
      }
    } catch (err) {
      console.error("[ObjectStorage] Error downloading file:", err);
      if (!res.headersSent)
        res.status(500).json({ error: "Error downloading file" });
    }
  }

  // -------------------------------------------------------------------------
  // getObjectEntityUploadURL — presigned S3 PUT URL for direct browser uploads
  // -------------------------------------------------------------------------
  async getObjectEntityUploadURL(): Promise<string> {
    if (!this.s3) {
      throw new Error(
        "[ObjectStorage] AWS S3 not configured — presigned upload URLs unavailable"
      );
    }

    const objectId = randomUUID();
    const key = `uploads/${objectId}`;

    const command = new PutObjectCommand({
      Bucket: this.s3.bucket,
      Key: key,
    });

    const url = await getSignedUrl(this.s3.client, command, {
      expiresIn: 900,
    });
    return url;
  }

  // -------------------------------------------------------------------------
  // normalizeObjectEntityPath — convert an external URL to /objects/... path
  // -------------------------------------------------------------------------
  normalizeObjectEntityPath(rawPath: string): string {
    // Already normalised
    if (rawPath.startsWith("/objects/")) return rawPath;

    try {
      const url = new URL(rawPath);
      if (url.hostname.includes("amazonaws.com")) {
        // Virtual-hosted: {bucket}.s3.{region}.amazonaws.com/{key}
        if (this.s3 && url.hostname.startsWith(this.s3.bucket + ".")) {
          const key = url.pathname.replace(/^\//, "");
          return `/objects/${key}`;
        }
        // Path-style: s3.{region}.amazonaws.com/{bucket}/{key}
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts.length >= 2) {
          const key = parts.slice(1).join("/");
          return `/objects/${key}`;
        }
      }
    } catch {
      // Not a URL — return as-is
    }

    return rawPath;
  }
}
