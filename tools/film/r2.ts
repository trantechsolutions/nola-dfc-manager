// The clips the manager plays (supabase/functions/film-clip), as plain MP4s in a private Cloudflare R2 bucket.
// Settings in private/film/.r2.json (never committed; lines starting with // are comments):
//   { "endpoint": "https://<account>.r2.cloudflarestorage.com", "accessKeyId": "…", "secretAccessKey": "…",
//     "clipsBucket": "…" }
// Nobody reads the bucket directly; the manager hands out short-lived links. Errors never print the file.
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export interface R2Object { size: number; etag: string }
export interface ClipsR2Config { endpoint: string; accessKeyId: string; secretAccessKey: string; clipsBucket: string }

export function loadClipsR2(file: string): ClipsR2Config | null {
  if (!existsSync(file)) return null;
  let c: Partial<ClipsR2Config>;
  try {
    const raw = readFileSync(file, "utf8").replace(/^﻿/, "");
    c = JSON.parse(raw.split(/\r?\n/).filter(l => !/^\s*\/\//.test(l)).join("\n"));
  } catch {
    throw new Error(`${file} isn't valid JSON (contents not shown).`);
  }
  if (!c.clipsBucket) return null;
  const missing = (["endpoint", "accessKeyId", "secretAccessKey"] as const).filter(k => !c[k]);
  if (missing.length) throw new Error(`${file} is missing: ${missing.join(", ")}`);
  return c as ClipsR2Config;
}

export function clipsClient(c: ClipsR2Config) {
  const s3 = new S3Client({
    region: "auto", endpoint: c.endpoint,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  });
  const Bucket = c.clipsBucket;
  return {
    /** key → { size, etag } for every object under prefix. */
    async list(prefix: string) {
      const out = new Map<string, R2Object>();
      let token: string | undefined;
      do {
        const r = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token }));
        for (const o of r.Contents ?? []) out.set(o.Key!, { size: o.Size ?? 0, etag: (o.ETag ?? "").replace(/"/g, "") });
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token);
      return out;
    },
    /** Uploads unless an identical object (same MD5) is already there. Returns true if uploaded. */
    async put(key: string, buf: Buffer, existing: Map<string, R2Object>) {
      const md5 = createHash("md5").update(buf).digest("hex");
      const have = existing.get(key);
      if (have && have.size === buf.length && have.etag === md5) return false;
      await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: buf, ContentType: "video/mp4", CacheControl: "private, no-cache" }));
      return true;
    },
    async remove(keys: string[]) {
      for (let i = 0; i < keys.length; i += 1000) {
        await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys.slice(i, i + 1000).map(Key => ({ Key })) } }));
      }
      return keys.length;
    },
  };
}
