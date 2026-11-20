/**
 * Pornește un import de pe comori-od.ro (echivalentul butonului din UI): creează importul în FETCHING
 * și jobul `book.import.comori`, pe care îl procesează workerul. Rezultatul apare în /import pentru
 * previzualizare și confirmare manuală.
 * Rulare: npm run import:comori [-- --limit 20]
 */
import { PrismaClient } from "@prisma/client";
import { ensureBook } from "../packages/core/src/services/import";

const db = new PrismaClient();
const li = process.argv.indexOf("--limit");
const limit = li > 0 ? Number(process.argv[li + 1]) : undefined;

const book = await ensureBook(db);
const imp = await db.bookImport.create({ data: { bookId: book.id, source: "comori-od", status: "FETCHING", progress: 0 } });
await db.job.create({ data: { kind: "book.import.comori", input: { importId: imp.id, ...(limit ? { limit } : {}) } } });
console.log(`import ${imp.id} pus în coadă${limit ? ` (primele ${limit})` : ""}; pornește workerul dacă nu rulează.`);
await db.$disconnect();
