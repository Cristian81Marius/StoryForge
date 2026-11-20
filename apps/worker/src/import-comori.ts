import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Prisma, PrismaClient } from "@prisma/client";
import { COMORI_BOOK_URL, cacheKeyForSlug, parseComoriArticle, parseComoriIndex, validateImport, type ImportedStory, type Logger } from "@storyforge/core";

export type Fetcher = (url: string) => Promise<string>;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} pentru ${url}`);
  }
}

/** Client generic (fără date personale în User-Agent). */
export const httpFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { "user-agent": "StoryForge-importer/0.1 (+self-hosted)" } });
  if (!res.ok) throw new HttpError(res.status, url);
  return res.text();
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Reîncercări cu pauze progresive pentru 429/5xx și erori de rețea (site-ul răspunde cu 500
 * când primește prea multe cereri). 404 și alte 4xx nu se reîncearcă.
 */
export function withRetry(fetcher: Fetcher, backoffMs: number[], wait: (ms: number) => Promise<void> = sleep): Fetcher {
  return async (url) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fetcher(url);
      } catch (e) {
        const retriable = !(e instanceof HttpError) || e.status === 429 || e.status >= 500;
        if (!retriable || attempt >= backoffMs.length) throw e;
        await wait(backoffMs[attempt]);
      }
    }
  };
}

export interface ComoriImportOpts {
  db: PrismaClient;
  importId: string;
  cacheDir: string;
  fetcher?: Fetcher;
  delayMs?: number;
  log: Logger;
  /** Pentru teste/demo: doar primele N istorioare. */
  limit?: number;
  /** Pauzele între reîncercări (implicit 5 s, 20 s, 60 s). */
  backoffMs?: number[];
  /** După atâtea eșecuri la rând, pauză lungă (implicit 5 eșecuri → 3 minute). */
  breaker?: { failures: number; pauseMs: number };
  wait?: (ms: number) => Promise<void>;
}

/**
 * Descarcă istorioarele de pe comori-od.ro, SECVENȚIAL (site-ul limitează cererile în paralel),
 * cu pagini păstrate în cache (o reluare nu le descarcă din nou), apoi pune importul în PREVIEW.
 */
export async function runComoriImport(o: ComoriImportOpts) {
  const wait = o.wait ?? sleep;
  const fetcher = withRetry(o.fetcher ?? httpFetcher, o.backoffMs ?? [5_000, 20_000, 60_000], wait);
  const delay = o.delayMs ?? 1_500;
  const breaker = o.breaker ?? { failures: 5, pauseMs: 180_000 };
  let consecutiveFailures = 0;
  mkdirSync(o.cacheDir, { recursive: true });

  const cached = async (key: string, url: string) => {
    const p = resolve(o.cacheDir, `${key}.html`);
    if (existsSync(p)) return { html: readFileSync(p, "utf8"), hit: true };
    const html = await fetcher(url);
    writeFileSync(p, html);
    return { html, hit: false };
  };

  const index = parseComoriIndex((await cached("_index", COMORI_BOOK_URL)).html);
  const entries = o.limit ? index.slice(0, o.limit) : index;
  o.log.info("comori.index", { articles: index.length, importing: entries.length });
  if (!entries.length) throw new Error("Lista de istorioare de pe comori-od.ro e goală (structura paginii s-a schimbat?)");

  const stories: ImportedStory[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    try {
      const { html, hit } = await cached(cacheKeyForSlug(e.slug), e.url);
      const s = parseComoriArticle(html, e.url);
      if (s.number !== e.number) s.warnings.push(`numărul din pagină (${s.number}) diferă de cel din cuprins (${e.number})`);
      stories.push(s);
      consecutiveFailures = 0;
      if (!hit && i < entries.length - 1) await wait(delay);
    } catch (err) {
      stories.push({ number: e.number, title: e.slug, text: "", sourceUrl: e.url, warnings: [`extragere eșuată: ${(err as Error).message}`], skip: false });
      if (++consecutiveFailures >= breaker.failures) {
        o.log.warn("comori.pause", { afterFailures: consecutiveFailures, pauseMs: breaker.pauseMs });
        await wait(breaker.pauseMs);
        consecutiveFailures = 0;
      }
    }
    if (i % 10 === 9 || i === entries.length - 1) {
      await o.db.bookImport.update({ where: { id: o.importId }, data: { progress: Math.round(((i + 1) / entries.length) * 100) } });
    }
  }

  const { items, report } = validateImport(stories, o.limit ?? undefined);
  await o.db.bookImport.update({
    where: { id: o.importId },
    data: {
      status: "PREVIEW",
      items: items as unknown as Prisma.InputJsonValue,
      report: { ...report, preamble: "Prefețele („Cuvânt înainte”) de pe site au fost excluse." } as unknown as Prisma.InputJsonValue,
      progress: 100,
    },
  });
  o.log.info("comori.done", { total: report.total, missing: report.missing.length, withWarnings: report.withWarnings });
}
