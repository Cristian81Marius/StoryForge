"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/** Directorul de lucru (același cu al workerului; aplicația și workerul rulează pe același calculator). */
function workDir() {
  return resolve(process.env.STORYFORGE_ROOT ?? process.cwd(), process.env.WORK_DIR || "work");
}

/**
 * Upload manual de narațiune (alternativa la Speko): un fișier audio pe scenă și limbă,
 * salvat ca work/ep-NNN/upload/<lang>/sNN.<ext>. Jobul voice.draft cu providerul „manual” le preia.
 */
export async function uploadSceneAudioAction(form: FormData) {
  if (!(await verifySession((await cookies()).get(SESSION_COOKIE)?.value))) redirect("/login");
  const storyId = String(form.get("storyId"));
  const lang = String(form.get("lang")) === "en" ? "en" : "ro";
  const story = await prisma.story.findUniqueOrThrow({ where: { id: storyId } });
  const dir = resolve(workDir(), `ep-${String(story.number).padStart(3, "0")}`, "upload", lang);
  mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const [name, value] of form.entries()) {
    const m = name.match(/^s(\d{2})$/);
    if (!m || !(value instanceof File) || value.size === 0) continue;
    if (value.size > 25 * 1024 * 1024) continue;
    // fișierul ajunge ca sNN.wav; motorul citește orice format audio prin ffmpeg
    writeFileSync(resolve(dir, `s${m[1]}.wav`), Buffer.from(await value.arrayBuffer()));
    n++;
  }
  revalidatePath(`/stories/${storyId}`);
  redirect(`/stories/${storyId}?flash=${encodeURIComponent(`${n} fișiere audio încărcate (${lang.toUpperCase()}). Apasă „Reîncearcă” pe jobul voice.draft.`)}`);
}

export async function setTtsProviderAction(form: FormData) {
  if (!(await verifySession((await cookies()).get(SESSION_COOKIE)?.value))) redirect("/login");
  const provider = String(form.get("ttsProvider")) === "manual" ? "manual" : "speko";
  await prisma.book.update({ where: { id: String(form.get("bookId")) }, data: { ttsProvider: provider } });
  revalidatePath("/settings");
  redirect("/settings?flash=" + encodeURIComponent(`Vocea: ${provider === "manual" ? "upload manual" : "Speko"}`));
}
