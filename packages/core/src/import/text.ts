/**
 * Împărțirea unui text (TXT, sau extras din DOCX/PDF) în istorioare.
 *
 * Un titlu de istorioară e un rând de forma „12. Titlul” (număr 1–600, punct, titlu scurt, fără punct final
 * de frază). Tot ce e ÎNAINTE de primul titlu (prefața, „Cuvânt înainte”) e ignorat și raportat.
 * Rezultatul trece obligatoriu prin previzualizare și confirmare manuală.
 */
import { cleanTitle, type ImportedStory } from "./types";

const HEADING = /^\s*(\d{1,3})\s*[.)]\s+(\S.{0,100}?)\s*$/;

/** `expectedNext` = null pentru primul titlu (un fișier poate conține doar o parte din carte). */
function looksLikeHeading(line: string, expectedNext: number | null): RegExpMatchArray | null {
  const m = line.match(HEADING);
  if (!m) return null;
  const n = Number(m[1]);
  const title = m[2];
  if (n < 1 || n > 600) return null;
  // Un rând numerotat din interiorul unei istorioare (ex. o listă „1. …”) e de obicei o frază lungă
  // sau nu urmează numerotarea. Acceptăm doar titluri scurte, fără punct de final de frază.
  if (title.length > 90) return null;
  if (/[.!?;:,]$/.test(title) && !/(\.\.\.|…)$/.test(title)) return null;
  // Preferăm numărul așteptat; acceptăm și salturi (raportate la validare).
  if (expectedNext !== null && n !== expectedNext && Math.abs(n - expectedNext) > 25) return null;
  return m;
}

export interface SplitResult {
  stories: ImportedStory[];
  /** Textul dinaintea primului titlu (prefață etc.), ignorat. */
  preamble: string;
}

export function splitStories(fullText: string): SplitResult {
  const lines = fullText.replace(/\r\n?/g, "\n").split("\n");
  const stories: ImportedStory[] = [];
  const preamble: string[] = [];
  let cur: { number: number; title: string; body: string[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const text = cur.body
      .join("\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    stories.push({ number: cur.number, title: cleanTitle(`${cur.number}. ${cur.title}`), text, warnings: [], skip: false });
  };
  for (const line of lines) {
    const m = looksLikeHeading(line, cur ? cur.number + 1 : null);
    if (m) {
      flush();
      cur = { number: Number(m[1]), title: m[2], body: [] };
    } else if (cur) {
      cur.body.push(line);
    } else {
      preamble.push(line);
    }
  }
  flush();
  return { stories, preamble: preamble.join("\n").trim() };
}
