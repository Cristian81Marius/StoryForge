import type { PrismaClient } from "@prisma/client";
import { isoWeekday, utcToLocal, isReview, STATUS_LABEL, transition, type Logger, type StoryStatus } from "@storyforge/core";
import { claimOnce, isoWeekKey, nextInQueue, startStory, thresholdAlerts } from "@storyforge/core/services";
import { appUrl, sendEmail } from "./notify";

type Rhythm = { storiesPerWeek?: number; days?: number[]; hour?: string; timezone?: string };

/**
 * Sarcinile programate, rulate de worker la fiecare minut. Fiecare acțiune e unică prin CronRun
 * (cheie unică), deci mai multe instanțe de worker sau reporniri nu o dublează.
 */
export async function cronTick(db: PrismaClient, log: Logger, now = new Date()) {
  await weeklyStart(db, log, now);
  await notifyAwaitingReview(db, log);
  await markPublished(db, log, now);
  await dailyConnectionCheck(db, now);
  for (const a of await thresholdAlerts(db, now)) {
    if (await claimOnce(db, a.key, "threshold", { message: a.message })) await sendEmail(db, log, `[StoryForge] Prag depășit`, `${a.message}\n\n${appUrl("/usage")}`);
  }
}

/**
 * Ritmul săptămânal: în zilele alese, la ora aleasă (fusul din Setări), pornește SCRIPT_DRAFT pentru
 * următoarele povești din coadă. O poveste produce ambele limbi, deci servește toate canalele.
 * Totalul pe săptămână nu depășește `storiesPerWeek`.
 */
export async function weeklyStart(db: PrismaClient, log: Logger, now: Date) {
  const s = await db.settings.findUnique({ where: { id: "global" } });
  const r = (s?.rhythm ?? {}) as Rhythm;
  const perWeek = r.storiesPerWeek ?? 0;
  const days = r.days?.length ? r.days : [2];
  const tz = r.timezone || "Europe/Bucharest";
  if (perWeek <= 0) return;
  if (!(await db.channel.count({ where: { active: true } }))) return;
  const local = utcToLocal(now, tz);
  if (!days.includes(isoWeekday(now, tz)) || local.slice(11, 16) < (r.hour ?? "09:00")) return;
  const dayKey = `start:${local.slice(0, 10)}`;
  const weekKey = isoWeekKey(new Date(`${local.slice(0, 10)}T12:00:00Z`));
  const startedThisWeek = await db.cronRun.findMany({ where: { kind: "weekly-start", detail: { path: ["week"], equals: weekKey } } });
  const already = startedThisWeek.reduce((a, c) => a + ((c.detail as { count?: number }).count ?? 0), 0);
  const remainingDays = days.filter((d) => d >= isoWeekday(now, tz)).length;
  const todayCount = Math.min(perWeek - already, Math.ceil((perWeek - already) / Math.max(1, remainingDays)));
  if (todayCount <= 0) return;
  if (!(await claimOnce(db, dayKey, "weekly-start", { week: weekKey, count: 0 }))) return;
  const started: number[] = [];
  for (let i = 0; i < todayCount; i++) {
    const next = await nextInQueue(db);
    if (!next) break;
    await startStory(db, next.id);
    started.push(next.number);
  }
  await db.cronRun.update({ where: { key: dayKey }, data: { detail: { week: weekKey, count: started.length, stories: started } } });
  log.info("cron.weekly_start", { week: weekKey, started });
  if (!started.length) await sendEmail(db, log, "[StoryForge] Coada e goală", `Ritmul săptămânal nu a găsit povești în coadă.\n\n${appUrl("/import")}`);
}

/** Email când ceva așteaptă aprobarea (o singură dată pe versiune). */
export async function notifyAwaitingReview(db: PrismaClient, log: Logger) {
  const stories = await db.story.findMany({
    where: { status: { in: ["SCRIPT_REVIEW", "VIDEO_REVIEW", "VOICE_REVIEW", "FINAL_REVIEW", "SOCIAL_REVIEW"] } },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  for (const st of stories) {
    const v = st.versions[0];
    if (!v || v.decision || !isReview(st.status as StoryStatus)) continue;
    if (!(await claimOnce(db, `notify:${v.id}`, "notify"))) continue;
    await sendEmail(
      db,
      log,
      `[StoryForge] De aprobat: ${st.number}. ${st.title} — ${STATUS_LABEL[st.status as StoryStatus]}`,
      `Istorioara nr. ${st.number} „${st.title}” așteaptă aprobarea ta (${STATUS_LABEL[st.status as StoryStatus]}, versiunea ${v.number}).\n\n${appUrl(`/stories/${st.id}`)}`,
    );
  }
}

/** SCHEDULED → PUBLISHED după ce a trecut ora ultimei postări a poveștii. */
export async function markPublished(db: PrismaClient, log: Logger, now: Date) {
  const stories = await db.story.findMany({ where: { status: "SCHEDULED" }, include: { schedules: true } });
  for (const st of stories) {
    const active = st.schedules.filter((s) => s.status !== "FAILED");
    if (!active.length || active.some((s) => s.scheduledAt > now)) continue;
    const t = transition("SCHEDULED", { type: "PUBLISHED" });
    await db.$transaction([
      db.story.updateMany({ where: { id: st.id, status: "SCHEDULED" }, data: { status: t.next } }),
      db.schedule.updateMany({ where: { storyId: st.id, status: "SCHEDULED" }, data: { status: "PUBLISHED" } }),
    ]);
    log.info("cron.published", { story: st.number });
  }
}

export async function dailyConnectionCheck(db: PrismaClient, now: Date) {
  const cfg = ((await db.integration.findUnique({ where: { type: "METRICOOL" } }))?.config ?? {}) as { mode?: string };
  if (!cfg.mode || cfg.mode === "manual") return;
  if (await claimOnce(db, `check:${now.toISOString().slice(0, 10)}`, "metricool-check")) await db.job.create({ data: { kind: "social.check" } });
}
