/**
 * Demo faza 1 (date mock, fără consum din abonament):
 *  - pornește prima poveste din coadă (NEW → SCRIPT_DRAFT)
 *  - cere modificări pe o poveste în VIDEO_REVIEW (→ VIDEO_DRAFT, cu feedback)
 *  - rulează workerul în mod mock până golește coada
 *  - afișează statusurile și versiunile rezultate
 * Rulare: npm run demo   (după `npm run db:reset`)
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { startStory, decide } from "../packages/core/src/services/index";

const root = resolve(import.meta.dirname, "..");
const db = new PrismaClient();

const first = await db.story.findFirstOrThrow({ where: { status: "NEW", excluded: false }, orderBy: { position: "asc" } });
await startStory(db, first.id);
const vr = await db.story.findFirstOrThrow({ where: { status: "VIDEO_REVIEW" } });
await decide(db, vr.id, "REQUEST_CHANGES", "scena 4: personajul principal mai mare");
console.log(`pornit: nr. ${first.number}; feedback pe nr. ${vr.number}`);

execFileSync(process.execPath, ["--import", "tsx", "apps/worker/src/index.ts", "--once"], {
  cwd: root,
  stdio: ["ignore", "ignore", "inherit"],
  env: { ...process.env, STORYFORGE_MOCK_AGENTS: "1", WORKER_POLL_MS: "100" },
});

for (const s of await db.story.findMany({
  where: { id: { in: [first.id, vr.id] } },
  include: { versions: { orderBy: [{ stage: "asc" }, { number: "asc" }] }, jobs: { include: { runs: true } } },
})) {
  console.log(`nr. ${s.number}: ${s.status}`);
  console.log(`  versiuni: ${s.versions.map((v) => `${v.stage} v${v.number}${v.inputFeedback ? ` (feedback: „${v.inputFeedback}”)` : ""}`).join(", ")}`);
  console.log(`  joburi: ${s.jobs.map((j) => `${j.kind}=${j.status} (${j.runs.length} rulări)`).join(", ")}`);
}
await db.$disconnect();
