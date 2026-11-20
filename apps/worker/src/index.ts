import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { makeLogger } from "@storyforge/core";
import { appendJobLog, claimJob, requeueStale } from "@storyforge/core/services";
import { HANDLERS } from "./handlers";
import { spawnClaude, UsageLimitError } from "./runner";
import { makeRecorder } from "./ctx";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
process.env.STORYFORGE_ROOT ??= repoRoot;
const db = new PrismaClient();
const workerId = process.env.WORKER_ID ?? "worker-1";
const pollMs = Number(process.env.WORKER_POLL_MS ?? 5000);
const mock = process.env.STORYFORGE_MOCK_AGENTS === "1";
const workDir = resolve(repoRoot, process.env.WORK_DIR ?? "work");
const once = process.argv.includes("--once");
const log = makeLogger({ svc: "worker", workerId });

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    log.info("worker.stopping", { sig });
    stopping = true;
  });

export async function processOne(): Promise<boolean> {
  const job = await claimJob(db, workerId);
  if (!job) return false;
  const jlog = makeLogger({ svc: "worker", workerId, jobId: job.id, kind: job.kind, storyId: job.storyId }, (e) => {
    console.log(JSON.stringify(e));
    void appendJobLog(db, job.id, e).catch(() => {});
  });
  const handler = HANDLERS[job.kind];
  try {
    if (!handler) throw new Error(`Tip de job necunoscut: ${job.kind}`);
    jlog.info("job.start", { attempt: job.attempts });
    await handler({ db, job, log: jlog, repoRoot, workDir, exec: spawnClaude(), mock, record: makeRecorder(db, job.id) });
    await db.job.update({ where: { id: job.id }, data: { status: "SUCCEEDED", finishedAt: new Date(), lockedBy: null, error: null } });
    jlog.info("job.ok");
  } catch (e) {
    if (e instanceof UsageLimitError) {
      await db.job.update({ where: { id: job.id }, data: { status: "WAITING_LIMIT", runAfter: e.retryAt, lockedBy: null, lockedAt: null, error: e.message } });
      jlog.warn("job.usage_limit", { retryAt: e.retryAt.toISOString() });
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      await db.job.update({ where: { id: job.id }, data: { status: "FAILED", finishedAt: new Date(), lockedBy: null, error: msg.slice(0, 8000) } });
      jlog.error("job.failed", { error: msg });
    }
  }
  return true;
}

async function main() {
  log.info("worker.start", { mock, pollMs, workDir });
  const stale = await requeueStale(db, 2 * 60 * 60_000);
  if (stale) log.warn("worker.requeued_stale", { count: stale });
  while (!stopping) {
    const did = await processOne().catch((e) => {
      log.error("worker.loop_error", { error: String(e) });
      return false;
    });
    if (once && !did) break;
    if (!did) await new Promise((r) => setTimeout(r, pollMs));
  }
  await db.$disconnect();
  log.info("worker.stopped");
}

void main();
