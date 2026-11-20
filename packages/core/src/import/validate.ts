import { EXPECTED_STORIES, type ImportedStory, type ImportReport } from "./types";

const MIN_CHARS = 120;
const MAX_CHARS = 12_000;

/** Adaugă avertismente pe fiecare istorioară și produce raportul de import. Nu modifică textul. */
export function validateImport(items: ImportedStory[], expected = EXPECTED_STORIES): { items: ImportedStory[]; report: ImportReport } {
  const counts = new Map<number, number>();
  for (const s of items) counts.set(s.number, (counts.get(s.number) ?? 0) + 1);

  const out = items.map((s) => {
    const w = new Set(s.warnings);
    const len = s.text.trim().length;
    if (len === 0) w.add("text gol");
    else if (len < MIN_CHARS) w.add(`text foarte scurt (${len} caractere)`);
    if (len > MAX_CHARS) w.add(`text foarte lung (${len} caractere): poate conține și istorioara următoare`);
    if ((counts.get(s.number) ?? 0) > 1) w.add("număr duplicat");
    if (/cuv[âa]nt[- ]?[îi]nainte|prefa[țt][ăa]/i.test(s.title)) w.add("pare prefață, nu istorioară");
    if (/^\s*(nota|n\.\s*red|notă)/im.test(s.text)) w.add("conține o posibilă notă editorială");
    if (/\[\d+\]|\(\*\)/.test(s.text)) w.add("conține trimiteri la note de subsol");
    return { ...s, warnings: [...w] };
  });

  const present = new Set(items.map((s) => s.number));
  const missing: number[] = [];
  for (let n = 1; n <= expected; n++) if (!present.has(n)) missing.push(n);
  const duplicates = [...counts.entries()].filter(([, c]) => c > 1).map(([n]) => n);

  const blocking: string[] = [];
  if (missing.length) blocking.push(`${missing.length} numere lipsă`);
  if (duplicates.length) blocking.push(`${duplicates.length} numere duplicate`);
  const empty = out.filter((s) => !s.text.trim()).length;
  if (empty) blocking.push(`${empty} istorioare fără text`);

  return {
    items: out.sort((a, b) => a.number - b.number),
    report: { total: items.length, expected, missing, duplicates, withWarnings: out.filter((s) => s.warnings.length).length, blocking },
  };
}
