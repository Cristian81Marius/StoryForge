"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";
import { getStorage } from "@storyforge/core";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const COLOR = /^#[0-9a-f]{6}$/i;
const MUSIC_TYPES: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/wav": "wav", "audio/x-wav": "wav" };
const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/svg+xml": "svg", "image/jpeg": "jpg" };

/** Template-ul outro-ului (culori, text, logo). Fonturile rămân cele ale canalului: Cinzel + Lora. */
export async function saveTemplateAction(form: FormData) {
  if (!(await verifySession((await cookies()).get(SESSION_COOKIE)?.value))) redirect("/login");
  const current = ((await prisma.settings.findUnique({ where: { id: "global" } }))?.template ?? {}) as Record<string, unknown>;
  const accent = String(form.get("accent") ?? "");
  const template: Record<string, unknown> = {
    ...current,
    brandName: String(form.get("brandName") ?? "").slice(0, 40) || undefined,
    tagline: { ro: String(form.get("taglineRo") ?? "").slice(0, 60) || undefined, en: String(form.get("taglineEn") ?? "").slice(0, 60) || undefined },
    accent: COLOR.test(accent) ? accent : undefined,
    durationSec: Math.min(8, Math.max(2.5, Number(form.get("durationSec")) || 4)),
  };
  const logo = form.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const ext = LOGO_TYPES[logo.type];
    if (!ext || logo.size > 2 * 1024 * 1024) redirect("/settings?flash=" + encodeURIComponent("Logo: PNG, JPG sau SVG, max 2 MB"));
    const dir = mkdtempSync(join(tmpdir(), "sf-logo-"));
    const p = join(dir, `logo.${ext}`);
    writeFileSync(p, Buffer.from(await logo.arrayBuffer()));
    const key = `brand/logo-${Date.now()}.${ext}`;
    await getStorage().putFile(key, p);
    rmSync(dir, { recursive: true, force: true });
    template.logoKey = key;
  }
  if (form.get("removeLogo") === "on") delete template.logoKey;
  template.musicVolumeDb = Math.max(-40, Math.min(-6, Number(form.get("musicVolumeDb")) || -22));
  const music = form.get("music");
  if (music instanceof File && music.size > 0) {
    const ext = MUSIC_TYPES[music.type];
    if (!ext || music.size > 20 * 1024 * 1024) redirect("/settings?flash=" + encodeURIComponent("Muzică: MP3, M4A sau WAV, max 20 MB"));
    const dir = mkdtempSync(join(tmpdir(), "sf-music-"));
    const p = join(dir, `muzica.${ext}`);
    writeFileSync(p, Buffer.from(await music.arrayBuffer()));
    const key = `brand/muzica-${Date.now()}.${ext}`;
    await getStorage().putFile(key, p);
    rmSync(dir, { recursive: true, force: true });
    template.musicKey = key;
  }
  if (form.get("removeMusic") === "on") delete template.musicKey;
  await prisma.settings.upsert({
    where: { id: "global" },
    update: { template: template as Prisma.InputJsonValue },
    create: { id: "global", template: template as Prisma.InputJsonValue },
  });
  revalidatePath("/settings");
  redirect("/settings?flash=" + encodeURIComponent("Template salvat. Se aplică la următoarea randare finală."));
}
