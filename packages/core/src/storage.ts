import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { copyFile, rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Stocarea fișierelor episoadelor (video, audio, imagini). Driverul se alege din mediu:
 *   STORAGE_DRIVER=local (implicit) → STORAGE_DIR (implicit ./storage), pe discul workerului
 *   STORAGE_DRIVER=s3               → S3_* (AWS S3, Cloudflare R2, MinIO …)
 * Cheile sunt căi relative cu „/”, ex. "ep-001/v2/draft-ro.mp4".
 */
export interface StoredObject {
  size: number;
  contentType: string;
}
export interface ReadResult {
  stream: Readable;
  size: number;
  contentType: string;
  /** Intervalul servit (pentru Range / redare video cu derulare). */
  range?: { start: number; end: number };
}

export interface Storage {
  readonly driver: string;
  putFile(key: string, localPath: string, contentType?: string): Promise<StoredObject>;
  read(key: string, range?: { start: number; end?: number }): Promise<ReadResult | null>;
  remove(key: string): Promise<void>;
}

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4a: "audio/mp4",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  html: "text/html; charset=utf-8",
  json: "application/json",
  md: "text/markdown; charset=utf-8",
  zip: "application/zip",
};
export function mimeFor(key: string): string {
  return MIME[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/** Cheile nu pot ieși din rădăcina stocării (fără „..”, fără căi absolute). */
export function safeKey(key: string): string {
  const k = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!k || k.split("/").some((p) => p === ".." || p === "") || /^[a-z]:/i.test(k)) throw new Error(`cheie de stocare invalidă: ${key}`);
  return k;
}

export class LocalStorage implements Storage {
  readonly driver = "local";
  constructor(private readonly root: string) {
    mkdirSync(root, { recursive: true });
  }
  private path(key: string) {
    const p = resolve(this.root, safeKey(key));
    if (!p.startsWith(resolve(this.root) + sep)) throw new Error("cheie în afara stocării");
    return p;
  }
  async putFile(key: string, localPath: string, contentType = mimeFor(key)) {
    const p = this.path(key);
    mkdirSync(dirname(p), { recursive: true });
    await copyFile(localPath, p);
    return { size: statSync(p).size, contentType };
  }
  async read(key: string, range?: { start: number; end?: number }): Promise<ReadResult | null> {
    const p = this.path(key);
    if (!existsSync(p)) return null;
    const size = statSync(p).size;
    if (range) {
      const end = Math.min(range.end ?? size - 1, size - 1);
      return { stream: createReadStream(p, { start: range.start, end }), size, contentType: mimeFor(key), range: { start: range.start, end } };
    }
    return { stream: createReadStream(p), size, contentType: mimeFor(key) };
  }
  async remove(key: string) {
    await rm(this.path(key), { force: true });
  }
}

export class S3Storage implements Storage {
  readonly driver = "s3";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  constructor(
    private readonly cfg: { endpoint?: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean },
  ) {}
  private async s3() {
    if (!this.client) {
      const { S3Client } = await import("@aws-sdk/client-s3");
      this.client = new S3Client({
        endpoint: this.cfg.endpoint || undefined,
        region: this.cfg.region,
        forcePathStyle: this.cfg.forcePathStyle,
        credentials: { accessKeyId: this.cfg.accessKeyId, secretAccessKey: this.cfg.secretAccessKey },
      });
    }
    return this.client;
  }
  async putFile(key: string, localPath: string, contentType = mimeFor(key)) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const size = statSync(localPath).size;
    await (await this.s3()).send(
      new PutObjectCommand({ Bucket: this.cfg.bucket, Key: safeKey(key), Body: createReadStream(localPath), ContentLength: size, ContentType: contentType }),
    );
    return { size, contentType };
  }
  async read(key: string, range?: { start: number; end?: number }): Promise<ReadResult | null> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const r = await (await this.s3()).send(
        new GetObjectCommand({ Bucket: this.cfg.bucket, Key: safeKey(key), Range: range ? `bytes=${range.start}-${range.end ?? ""}` : undefined }),
      );
      const total = r.ContentRange ? Number(String(r.ContentRange).split("/")[1]) : Number(r.ContentLength ?? 0);
      const m = r.ContentRange ? String(r.ContentRange).match(/bytes (\d+)-(\d+)/) : null;
      return {
        stream: r.Body as Readable,
        size: total,
        contentType: r.ContentType ?? mimeFor(key),
        range: m ? { start: Number(m[1]), end: Number(m[2]) } : undefined,
      };
    } catch (e) {
      if ((e as { name?: string }).name === "NoSuchKey") return null;
      throw e;
    }
  }
  async remove(key: string) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.s3()).send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: safeKey(key) }));
  }
}

let cached: Storage | null = null;
export function getStorage(env: NodeJS.ProcessEnv = process.env, repoRoot = env.STORYFORGE_ROOT ?? process.cwd()): Storage {
  if (cached) return cached;
  if ((env.STORAGE_DRIVER ?? "local") === "s3") {
    for (const k of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) if (!env[k]) throw new Error(`${k} lipsește (STORAGE_DRIVER=s3)`);
    cached = new S3Storage({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION || "auto",
      bucket: env.S3_BUCKET!,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      forcePathStyle: env.S3_FORCE_PATH_STYLE !== "false",
    });
  } else {
    cached = new LocalStorage(resolve(repoRoot, env.STORAGE_DIR || "storage"));
  }
  return cached;
}

/** Pentru teste. */
export function resetStorageCache() {
  cached = null;
}

export async function streamToFile(stream: Readable, path: string) {
  mkdirSync(dirname(path), { recursive: true });
  await pipeline(stream, createWriteStream(path));
}
