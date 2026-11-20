import { Readable } from "node:stream";
import { cookies } from "next/headers";
import { getStorage, safeKey } from "@storyforge/core";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Servește fișierele episoadelor din storage (local sau S3), doar pentru admin, cu suport Range. */
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (!(await verifySession((await cookies()).get(SESSION_COOKIE)?.value))) return new Response("Neautorizat", { status: 401 });
  let key: string;
  try {
    key = safeKey((await params).key.map(decodeURIComponent).join("/"));
  } catch {
    return new Response("Cheie invalidă", { status: 400 });
  }
  const m = req.headers.get("range")?.match(/^bytes=(\d+)-(\d*)$/);
  const range = m ? { start: Number(m[1]), end: m[2] ? Number(m[2]) : undefined } : undefined;
  const r = await getStorage().read(key, range);
  if (!r) return new Response("Nu există", { status: 404 });

  const headers: Record<string, string> = {
    "content-type": r.contentType,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
    "x-content-type-options": "nosniff",
    // fișierele încărcate (ex. un logo SVG) nu pot rula scripturi dacă sunt deschise direct
    "content-security-policy": "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'",
  };
  // paginile HTML generate se descarcă, nu se randează în originea aplicației
  if (r.contentType.startsWith("text/html")) headers["content-disposition"] = `attachment; filename="${key.split("/").pop()}"`;
  if (r.range) {
    headers["content-range"] = `bytes ${r.range.start}-${r.range.end}/${r.size}`;
    headers["content-length"] = String(r.range.end - r.range.start + 1);
    return new Response(Readable.toWeb(r.stream) as ReadableStream, { status: 206, headers });
  }
  headers["content-length"] = String(r.size);
  return new Response(Readable.toWeb(r.stream) as ReadableStream, { status: 200, headers });
}
