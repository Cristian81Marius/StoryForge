import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { makeLogger } from "@storyforge/core";
import { isoWeekKey, weekStart } from "@storyforge/core/services";
import { weeklyStart, markPublished, notifyAwaitingReview } from "../src/cron";

describe("săptămâna ISO", () => {
  it("chei și început", () => {
    expect(isoWeekKey(new Date("2026-11-20T10:00:00Z"))).toBe("2026-W47");
    expect(isoWeekKey(new Date("2027-01-01T10:00:00Z"))).toBe("2026-W53");
    expect(weekStart(new Date("2026-11-20T10:00:00Z")).toISOString()).toBe("2026-11-16T00:00:00.000Z");
  });
});

// Teste cu baza de date de test (numele trebuie să se termine în _test). Sărite dacă baza nu e disponibilă.
const url = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/storyforge_test";
const db = new PrismaClient({ datasources: { db: { url } } });
const log = makeLogger({}, () => {});
let dbOk = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbOk = /_test(\?|$)/.test(url);
} catch {
  dbOk = false;
}

describe.skipIf(!dbOk)("cron (bază de test)", () => {
  // vineri 20 nov 2026, 10:00 în București = 08:00 UTC
  const now = new Date("2026-11-20T08:00:00Z");

  beforeAll(async () => {
    await db.$transaction([db.cronRun.deleteMany(), db.schedule.deleteMany(), db.job.deleteMany(), db.version.deleteMany(), db.story.deleteMany(), db.channel.deleteMany(), db.book.deleteMany()]);
    const book = await db.book.create({ data: { title: "Carte test cron", author: "Autor" } });
    for (let n = 1; n <= 5; n++) await db.story.create({ data: { bookId: book.id, number: n, title: `T${n}`, text: "x", sourceReference: `nr. ${n}`, position: n * 10, excluded: n === 1 } });
    await db.channel.create({ data: { name: "RO", language: "ro", platforms: ["tiktok"] } });
    await db.settings.upsert({
      where: { id: "global" },
      update: { rhythm: { storiesPerWeek: 3, days: [5, 6], hour: "09:00", timezone: "Europe/Bucharest" } },
      create: { id: "global", rhythm: { storiesPerWeek: 3, days: [5, 6], hour: "09:00", timezone: "Europe/Bucharest" } },
    });
  });
  afterAll(async () => {
    await db.$transaction([db.cronRun.deleteMany(), db.job.deleteMany(), db.schedule.deleteMany(), db.version.deleteMany(), db.story.deleteMany(), db.channel.deleteMany(), db.book.deleteMany()]);
    await db.$disconnect();
  });

  it("înainte de oră nu pornește nimic", async () => {
    await weeklyStart(db, log, new Date("2026-11-20T06:30:00Z")); // 08:30 RO
    expect(await db.story.count({ where: { status: "SCRIPT_DRAFT" } })).toBe(0);
  });

  it("vineri: 2 din 3 (zilele rămase: vineri, sâmbătă), în ordinea cozii, sărind peste cele excluse; o singură dată pe zi", async () => {
    await weeklyStart(db, log, now);
    await weeklyStart(db, log, new Date(now.getTime() + 3600_000));
    const started = await db.story.findMany({ where: { status: "SCRIPT_DRAFT" }, orderBy: { number: "asc" } });
    expect(started.map((s) => s.number)).toEqual([2, 3]);
    expect(await db.job.count({ where: { kind: "script.draft" } })).toBe(2);
  });

  it("sâmbătă: restul de 1 până la 3 pe săptămână", async () => {
    await weeklyStart(db, log, new Date("2026-11-21T08:00:00Z"));
    expect(await db.story.count({ where: { status: "SCRIPT_DRAFT" } })).toBe(3);
  });

  it("notificarea pentru review se trimite o singură dată pe versiune", async () => {
    const st = await db.story.findFirstOrThrow({ where: { number: 2 } });
    await db.story.update({ where: { id: st.id }, data: { status: "SCRIPT_REVIEW" } });
    const v = await db.version.create({ data: { storyId: st.id, stage: "SCRIPT", number: 1, payload: {} } });
    await notifyAwaitingReview(db, log);
    await notifyAwaitingReview(db, log);
    expect(await db.cronRun.count({ where: { key: `notify:${v.id}` } })).toBe(1);
  });

  it("SCHEDULED → PUBLISHED după ultima postare", async () => {
    const st = await db.story.findFirstOrThrow({ where: { number: 4 } });
    const ch = await db.channel.findFirstOrThrow();
    await db.story.update({ where: { id: st.id }, data: { status: "SCHEDULED" } });
    await db.schedule.create({ data: { storyId: st.id, channelId: ch.id, platform: "tiktok", scheduledAt: new Date(now.getTime() + 3600_000), status: "SCHEDULED" } });
    await markPublished(db, log, now);
    expect((await db.story.findUniqueOrThrow({ where: { id: st.id } })).status).toBe("SCHEDULED");
    await markPublished(db, log, new Date(now.getTime() + 2 * 3600_000));
    expect((await db.story.findUniqueOrThrow({ where: { id: st.id } })).status).toBe("PUBLISHED");
  });
});
