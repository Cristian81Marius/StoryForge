/**
 * Extragere din comori-od.ro (sursa folosită și de skill: „600 de istorioare” a pr. Iosif Trifa).
 *
 * Pagina e Next.js; conținutul vine în payload-ul RSC (`self.__next_f.push([1,"…"])`) ca obiect
 * `article` cu `verses`: rânduri de segmente {type: "normal" | "bible-ref", text}.
 * Păstrăm doar textul autorului: segmentele "normal" și "bible-ref" (trimiterile scrise de autor în
 * text, ex. „(Fapte 2, 37)”). NU importăm: `bible-refs` (textele versetelor adăugate de site),
 * `tags`, `paragraphs` (duplicat cu adnotări), poza autorului și alte metadate ale ediției.
 */
import { cleanTitle, type ImportedStory } from "./types";

export const COMORI_BASE = "https://comori-od.ro";
export const COMORI_BOOK_URL = `${COMORI_BASE}/book/600-de-istorioare`;

export interface ComoriIndexEntry {
  number: number;
  slug: string;
  url: string;
}

/** Lista articolelor cărții, în ordine. Prefețele („cuvant-inainte…”) și orice link fără număr sunt ignorate. */
export function parseComoriIndex(html: string): ComoriIndexEntry[] {
  const seen = new Set<string>();
  const out: ComoriIndexEntry[] = [];
  // Slug-urile pot conține caractere speciale (ex. „&lt;&lt;mancarea&gt;&gt;”, „:”): le decodăm din HTML și le codăm în URL.
  for (const m of html.matchAll(/href="\/article\/((\d{1,3})-[^"]*?-600-de-istorioare-pr-iosif-trifa)"/g)) {
    const slug = decodeHtmlEntities(m[1]);
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({ number: Number(m[2]), slug, url: `${COMORI_BASE}/article/${encodeURIComponent(slug)}` });
  }
  return out.sort((a, b) => a.number - b.number);
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Nume de fișier sigur pentru cache (slug-urile pot conține < > : etc., interzise pe Windows). */
export function cacheKeyForSlug(slug: string): string {
  return slug.replace(/[^a-z0-9-]/gi, "_");
}

/** Concatenează payload-ul RSC (șirurile JSON din self.__next_f.push). */
function rscPayload(html: string): string {
  const parts: string[] = [];
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      parts.push(JSON.parse(m[1]) as string);
    } catch {
      /* fragment non-text: ignorat */
    }
  }
  return parts.join("");
}

/** Extrage un obiect JSON care începe la poziția dată (numără acoladele, ține cont de șiruri). */
function readJsonObject(s: string, start: number): unknown {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return JSON.parse(s.slice(start, i + 1));
    }
  }
  throw new Error("obiect JSON neterminat");
}

interface ComoriArticle {
  title?: string;
  author?: string;
  full_book?: string;
  verses?: Array<Array<{ type?: string; text?: string }>>;
}

export function parseComoriArticle(html: string, url?: string): ImportedStory {
  const payload = rscPayload(html);
  const key = '"article":{';
  const at = payload.indexOf(key);
  if (at < 0) throw new Error("obiectul article lipsește din pagină");
  const article = readJsonObject(payload, at + key.length - 1) as ComoriArticle;

  const rawTitle = article.title ?? "";
  const num = rawTitle.match(/^\s*(\d{1,3})\s*\./);
  if (!num) throw new Error(`titlul nu începe cu un număr: „${rawTitle}”`);

  const warnings: string[] = [];
  const lines = (article.verses ?? []).map((line) =>
    line
      .filter((seg) => {
        if (seg.type === "normal" || seg.type === "bible-ref") return true;
        warnings.push(`segment de tip necunoscut „${seg.type}” omis`);
        return false;
      })
      .map((seg) => seg.text ?? "")
      .join("")
      .replace(/[ \t]+/g, " ")
      .trim(),
  );
  const text = lines.filter(Boolean).join("\n\n");
  if (article.author && !/trifa/i.test(article.author)) warnings.push(`autor neașteptat: ${article.author}`);

  return { number: Number(num[1]), title: cleanTitle(rawTitle), text, sourceUrl: url, warnings, skip: false };
}
