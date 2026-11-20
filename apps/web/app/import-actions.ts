"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { splitStories } from "@storyforge/core/import";
import { detectKind, extractText } from "@storyforge/core/import-files";
import { confirmImport, createPreview, discardImport, ensureBook, setImportSkip, ConflictError } from "@storyforge/core/services";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import type { ActionState } from "./actions";

const MAX_UPLOAD = 30 * 1024 * 1024;

async function requireAdmin() {
  if (!(await verifySession((await cookies()).get(SESSION_COOKIE)?.value))) redirect("/login");
}

export async function uploadBookAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Alege un fișier" };
  if (file.size > MAX_UPLOAD) return { ok: false, message: "Fișierul depășește 30 MB" };
  const kind = detectKind(file.name, file.type);
  if (!kind) return { ok: false, message: "Format acceptat: .txt, .docx, .pdf" };
  let id: string;
  try {
    const text = await extractText(kind, Buffer.from(await file.arrayBuffer()));
    const { stories, preamble } = splitStories(text);
    if (!stories.length) return { ok: false, message: "N-am găsit nicio istorioară (rânduri de forma „12. Titlu”)" };
    const book = await ensureBook(prisma);
    id = (await createPreview(prisma, { bookId: book.id, source: `upload:${kind}`, fileName: file.name, stories, preamble })).id;
  } catch (e) {
    console.error(e);
    return { ok: false, message: `Nu am putut citi fișierul: ${(e as Error).message}` };
  }
  redirect(`/import/${id}`);
}

export async function startComoriImportAction(form: FormData) {
  await requireAdmin();
  const limit = Number(form.get("limit") ?? 0) || undefined;
  const book = await ensureBook(prisma);
  const imp = await prisma.bookImport.create({ data: { bookId: book.id, source: "comori-od", status: "FETCHING", progress: 0 } });
  await prisma.job.create({ data: { kind: "book.import.comori", input: { importId: imp.id, ...(limit ? { limit } : {}) } } });
  redirect(`/import/${imp.id}`);
}

export async function toggleSkipAction(form: FormData) {
  await requireAdmin();
  const id = String(form.get("importId"));
  await setImportSkip(prisma, id, Number(form.get("number")), form.get("skip") === "1");
  revalidatePath(`/import/${id}`);
}

export async function confirmImportAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = String(form.get("importId"));
  let msg: string;
  try {
    const r = await confirmImport(prisma, id, { force: form.get("force") === "on" });
    msg = `Confirmat: ${r.created} create, ${r.updated} actualizate, ${r.keptInProduction} neatinse (deja în producție), ${r.skipped} excluse`;
  } catch (e) {
    if (e instanceof ConflictError) return { ok: false, message: e.message };
    console.error(e);
    return { ok: false, message: "Eroare la confirmare" };
  }
  revalidatePath("/");
  redirect(`/import/${id}?flash=${encodeURIComponent(msg)}`);
}

export async function discardImportAction(form: FormData) {
  await requireAdmin();
  await discardImport(prisma, String(form.get("importId")));
  redirect("/import");
}

/** Șterge poveștile demo [MOCK] (cu versiunile și joburile lor), înainte de producția reală. */
export async function purgeMockAction() {
  await requireAdmin();
  await prisma.story.deleteMany({ where: { title: { startsWith: "[MOCK]" } } });
  revalidatePath("/");
  redirect("/import?flash=" + encodeURIComponent("Datele demo [MOCK] au fost șterse"));
}
