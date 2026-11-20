/**
 * Seed cu date MOCK pentru faza 1 (UI de aprobare). Textele sunt marcate [MOCK] și NU sunt din carte.
 * Importul real al cărții vine în faza 2.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { mockPayload, STAGES, STAGE_DEF, type Stage, type StoryStatus } from "../packages/core/src";

const db = new PrismaClient();

const STATUSES: StoryStatus[] = [
  "SCRIPT_REVIEW", "SCRIPT_REVIEW", "VIDEO_REVIEW", "VOICE_REVIEW", "FINAL_REVIEW", "SOCIAL_REVIEW",
  "SCRIPT_DRAFT", "SCHEDULED", "PUBLISHED", "REJECTED", "NEW", "NEW", "NEW", "NEW", "NEW", "NEW",
];

async function main() {
  // Gardă: seed-ul golește tabelele. Refuză dacă există povești reale (importate), nemarcate [MOCK].
  const real = await db.story.count({ where: { NOT: { title: { startsWith: "[MOCK]" } } } });
  if (real > 0 && process.env.SEED_ALLOW_WIPE !== "1") {
    throw new Error(`Baza conține ${real} povești reale. Seed-ul mock le-ar șterge; oprit. (SEED_ALLOW_WIPE=1 doar dacă știi ce faci.)`);
  }
  await db.$transaction([
    db.run.deleteMany(), db.job.deleteMany(), db.version.deleteMany(), db.schedule.deleteMany(),
    db.externalCost.deleteMany(), db.story.deleteMany(), db.book.deleteMany(), db.channel.deleteMany(),
  ]);
  await db.settings.upsert({ where: { id: "global" }, update: {}, create: { id: "global" } });

  const book = await db.book.create({ data: { title: "600 de istorioare religioase", author: "Iosif Trifa" } });
  const ro = await db.channel.create({ data: { name: "Istorioare cu tâlc (RO)", language: "ro", platforms: ["tiktok", "instagram", "youtube", "facebook"] } });
  const en = await db.channel.create({ data: { name: "Stories with a Lesson (EN)", language: "en", timezone: "America/New_York", platforms: ["tiktok", "instagram", "youtube", "facebook"] } });

  for (let i = 0; i < STATUSES.length; i++) {
    const status = STATUSES[i];
    const number = i + 1;
    const title = `[MOCK] Istorioara de test ${number}`;
    const story = await db.story.create({
      data: {
        bookId: book.id, number, title, position: number * 10, status,
        text: `[MOCK] Text de test pentru istorioara ${number}. Nu este text din carte; importul real vine în faza 2.\n\nA fost odată un om care aprindea în fiecare seară o lampă…`,
        sourceReference: `nr. ${number} — ${title}`,
        excluded: number === 16,
      },
    });
    // versiunile tuturor etapelor până la statusul curent
    const reachedStages: Stage[] = [];
    for (const s of STAGES) {
      const def = STAGE_DEF[s];
      const order = (x: StoryStatus) => ["NEW", "SCRIPT_DRAFT", "SCRIPT_REVIEW", "VIDEO_DRAFT", "VIDEO_REVIEW", "VOICE_DRAFT", "VOICE_REVIEW", "FINAL_RENDER", "FINAL_REVIEW", "SOCIAL_DRAFT", "SOCIAL_REVIEW", "SCHEDULED", "PUBLISHED"].indexOf(x);
      const cur = status === "REJECTED" ? order("VIDEO_REVIEW") : order(status);
      if (cur >= order(def.review)) reachedStages.push(s);
    }
    for (const s of reachedStages) {
      const isCurrent = STAGE_DEF[s].review === status || (status === "REJECTED" && s === reachedStages.at(-1));
      const twoVersions = s === "SCRIPT" && number === 2;
      const ref = { number, title, sourceReference: story.sourceReference };
      const versions = twoVersions ? 2 : 1;
      for (let v = 1; v <= versions; v++) {
        const last = v === versions;
        const fb = v > 1 ? "Titlul să fie mai scurt și cârligul mai puternic" : undefined;
        await db.version.create({
          data: {
            storyId: story.id, stage: s, number: v,
            payload: mockPayload(s, ref, book.author, fb, v) as Prisma.InputJsonValue,
            inputFeedback: fb ?? null,
            decision: last && isCurrent ? (status === "REJECTED" ? "REJECTED" : null) : v < versions ? "CHANGES_REQUESTED" : "APPROVED",
            decisionComment: v < versions ? "Titlul să fie mai scurt și cârligul mai puternic" : null,
            decidedAt: last && isCurrent && status !== "REJECTED" ? null : new Date(),
          },
        });
      }
    }
    if (status === "SCRIPT_DRAFT") {
      await db.job.create({ data: { storyId: story.id, kind: "script.draft", stage: "SCRIPT", status: "FAILED", attempts: 2, error: "[MOCK] Output JSON invalid de două ori: storyboard.scenes: 4 scene de poveste/învățătură; permis 5–12", finishedAt: new Date() } });
    }
    if (status === "SCHEDULED" || status === "PUBLISHED") {
      for (const ch of [ro, en]) for (const [k, p] of ch.platforms.entries()) {
        await db.schedule.create({ data: { storyId: story.id, channelId: ch.id, platform: p, scheduledAt: new Date(Date.now() + (status === "PUBLISHED" ? -3 : 2 + k) * 86400_000), status: status === "PUBLISHED" ? "PUBLISHED" : "SCHEDULED" } });
      }
    }
  }
  console.log(`seed: ${STATUSES.length} povești mock, 2 canale`);
}

main().finally(() => db.$disconnect());
