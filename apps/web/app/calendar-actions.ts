"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { zonedToUtc } from "@storyforge/core";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * Mutarea unei postări: data/ora se introduc în fusul orar al CANALULUI. Pentru postările deja programate
 * în Metricool se pune în coadă `social.reschedule` (actualizare prin API sau MCP).
 */
export async function moveScheduleAction(form: FormData) {
  if (!(await verifySession((await cookies()).get(SESSION_COOKIE)?.value))) redirect("/login");
  const id = String(form.get("id"));
  const local = String(form.get("when") ?? ""); // YYYY-MM-DDTHH:mm (input datetime-local)
  const s = await prisma.schedule.findUniqueOrThrow({ where: { id }, include: { channel: true } });
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) redirect("/calendar?flash=" + encodeURIComponent("Dată invalidă"));
  const at = zonedToUtc(local, s.channel.timezone);
  if (at.getTime() < Date.now() + 15 * 60_000) redirect("/calendar?flash=" + encodeURIComponent("Data trebuie să fie în viitor (minimum 15 minute)"));
  await prisma.schedule.update({ where: { id }, data: { scheduledAt: at } });
  if (s.status === "SCHEDULED" && s.externalId && s.mode !== "MANUAL") {
    await prisma.job.create({ data: { storyId: s.storyId, kind: "social.reschedule", input: { scheduleId: s.id } } });
  }
  revalidatePath("/calendar");
  redirect("/calendar?flash=" + encodeURIComponent(s.mode !== "MANUAL" && s.externalId ? "Mutat; actualizarea în Metricool e în coadă." : "Mutat în calendar."));
}

export async function markPublishedAction(form: FormData) {
  if (!(await verifySession((await cookies()).get(SESSION_COOKIE)?.value))) redirect("/login");
  await prisma.schedule.update({ where: { id: String(form.get("id")) }, data: { status: "PUBLISHED" } });
  revalidatePath("/calendar");
  redirect("/calendar");
}
