import { z } from "zod";

/** O istorioară extrasă dintr-o sursă, înainte de confirmare. */
export const ImportedStory = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  /** DOAR textul istorioarei (fără prefață, note editoriale, ilustrații, versete adăugate de editor). */
  text: z.string(),
  sourceUrl: z.string().optional(),
  /** Avertismente pentru această istorioară (afișate la previzualizare). */
  warnings: z.array(z.string()).default([]),
  /** Exclusă de utilizator la previzualizare. */
  skip: z.boolean().default(false),
});
export type ImportedStory = z.infer<typeof ImportedStory>;

export interface ImportReport {
  total: number;
  expected: number;
  missing: number[];
  duplicates: number[];
  withWarnings: number;
  /** Probleme care blochează confirmarea fără bifa „confirm oricum”. */
  blocking: string[];
}

export const EXPECTED_STORIES = 600;

/** „nr. 20 — Urechi mântuite” */
export function sourceReferenceFor(s: Pick<ImportedStory, "number" | "title">): string {
  return `nr. ${s.number} — ${s.title}`;
}

/** Titlul fără numărul din față și fără punctele de suspensie decorative: „1. Urechi mântuite...” → „Urechi mântuite”. */
export function cleanTitle(raw: string): string {
  return raw
    .replace(/^\s*\d{1,3}\s*[.)]\s*/, "")
    .replace(/\s*(\.\.\.|…)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}
