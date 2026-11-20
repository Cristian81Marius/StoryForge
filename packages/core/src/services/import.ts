import type { Prisma, PrismaClient } from "@prisma/client";
import { ImportedStory, sourceReferenceFor, validateImport } from "../import";
import { ConflictError } from "./index";

export const DEFAULT_BOOK = { title: "600 de istorioare religioase", author: "Iosif Trifa" };

export async function ensureBook(db: PrismaClient) {
  return (await db.book.findFirst({ where: { title: DEFAULT_BOOK.title } })) ?? db.book.create({ data: DEFAULT_BOOK });
}

/** Creează un import în PREVIEW din istorioarele extrase (validate aici). */
export async function createPreview(db: PrismaClient, args: { bookId: string; source: string; fileName?: string; stories: ImportedStory[]; preamble?: string }) {
  const { items, report } = validateImport(args.stories);
  return db.bookImport.create({
    data: {
      bookId: args.bookId,
      source: args.source,
      fileName: args.fileName,
      status: "PREVIEW",
      items: items as unknown as Prisma.InputJsonValue,
      report: { ...report, preamble: (args.preamble ?? "").slice(0, 4000) } as unknown as Prisma.InputJsonValue,
      progress: 100,
    },
  });
}

export async function setImportSkip(db: PrismaClient, importId: string, number: number, skip: boolean) {
  return db.$transaction(async (tx) => {
    const imp = await tx.bookImport.findUniqueOrThrow({ where: { id: importId } });
    if (imp.status !== "PREVIEW") throw new ConflictError("Importul nu mai e în previzualizare");
    const items = (imp.items as unknown as ImportedStory[]).map((s) => (s.number === number ? { ...s, skip } : s));
    await tx.bookImport.update({ where: { id: importId }, data: { items: items as unknown as Prisma.InputJsonValue } });
  });
}

export interface ConfirmResult {
  created: number;
  updated: number;
  keptInProduction: number;
  skipped: number;
}

/**
 * Confirmarea manuală: creează sau actualizează poveștile în coadă.
 * - Poveștile deja intrate în producție (status ≠ NEW sau cu versiuni) NU sunt atinse.
 * - Ordinea în coadă = numărul original (position = number × 10); reordonarea se face apoi din UI.
 * - Dacă raportul are probleme blocante, confirmarea cere `force`.
 */
export async function confirmImport(db: PrismaClient, importId: string, opts: { force?: boolean } = {}): Promise<ConfirmResult> {
  return db.$transaction(
    async (tx) => {
      const imp = await tx.bookImport.findUniqueOrThrow({ where: { id: importId } });
      if (imp.status !== "PREVIEW") throw new ConflictError("Importul nu mai e în previzualizare");
      const report = imp.report as { blocking?: string[] };
      if (report.blocking?.length && !opts.force)
        throw new ConflictError(`Importul are probleme: ${report.blocking.join("; ")}. Bifează „confirm oricum” dacă le-ai verificat.`);

      const items = (imp.items as unknown as ImportedStory[]).filter((s) => !s.skip && s.text.trim());
      const existing = await tx.story.findMany({ where: { bookId: imp.bookId }, include: { _count: { select: { versions: true } } } });
      const byNumber = new Map(existing.map((s) => [s.number, s]));
      const r: ConfirmResult = { created: 0, updated: 0, keptInProduction: 0, skipped: (imp.items as unknown as ImportedStory[]).length - items.length };

      for (const s of items) {
        const data = { title: s.title, text: s.text, sourceReference: sourceReferenceFor(s) };
        const ex = byNumber.get(s.number);
        if (!ex) {
          await tx.story.create({ data: { ...data, bookId: imp.bookId, number: s.number, position: s.number * 10 } });
          r.created++;
        } else if (ex.status === "NEW" && ex._count.versions === 0) {
          await tx.story.update({ where: { id: ex.id }, data });
          r.updated++;
        } else {
          r.keptInProduction++;
        }
      }
      await tx.bookImport.update({ where: { id: importId }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
      return r;
    },
    { timeout: 60_000 },
  );
}

export async function discardImport(db: PrismaClient, importId: string) {
  const r = await db.bookImport.updateMany({ where: { id: importId, status: { in: ["PREVIEW", "FAILED"] } }, data: { status: "DISCARDED" } });
  if (r.count !== 1) throw new ConflictError("Importul nu poate fi anulat în starea curentă");
}
