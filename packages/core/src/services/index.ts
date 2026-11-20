import type { Prisma, PrismaClient } from "@prisma/client";
import { transition, STAGE_DEF, type PipelineEvent, type Stage, type StoryStatus, type JobRequest, stageOfStatus, TransitionError } from "../pipeline";

type Tx = Prisma.TransactionClient | PrismaClient;

export class ConflictError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ConflictError";
  }
}

async function enqueue(tx: Tx, storyId: string, jobs: JobRequest[]) {
  for (const j of jobs) {
    await tx.job.create({ data: { storyId, kind: j.kind, stage: j.stage, input: j.input as Prisma.InputJsonValue } });
  }
}

/** Aplică o tranziție cu blocare optimistă pe status (nimeni nu a schimbat povestea între timp). */
async function apply(tx: Tx, storyId: string, expected: StoryStatus, next: StoryStatus) {
  const r = await tx.story.updateMany({ where: { id: storyId, status: expected }, data: { status: next } });
  if (r.count !== 1) throw new ConflictError("Povestea a fost modificată între timp. Reîncarcă pagina.");
}

export async function latestVersion(tx: Tx, storyId: string, stage: Stage) {
  return tx.version.findFirst({ where: { storyId, stage }, orderBy: { number: "desc" } });
}

export type ReviewAction = "APPROVE" | "REQUEST_CHANGES" | "REJECT";

/** Decizia din UI pe un *_REVIEW. */
export async function decide(db: PrismaClient, storyId: string, action: ReviewAction, comment?: string) {
  return db.$transaction(async (tx) => {
    const story = await tx.story.findUniqueOrThrow({ where: { id: storyId } });
    const from = story.status as StoryStatus;
    const stage = stageOfStatus(from);
    if (!stage) throw new TransitionError(`Nicio etapă activă pentru ${from}`, from, action);
    const version = await latestVersion(tx, storyId, stage);
    if (!version) throw new ConflictError("Nu există nicio versiune de decis");
    if (version.decision) throw new ConflictError("Versiunea curentă a fost deja decisă");

    const event: PipelineEvent =
      action === "APPROVE"
        ? { type: "APPROVE" }
        : action === "REQUEST_CHANGES"
          ? { type: "REQUEST_CHANGES", comment: comment ?? "" }
          : { type: "REJECT", comment };
    const res = transition(from, event, { currentVersionId: version.id });

    await tx.version.update({
      where: { id: version.id },
      data: {
        decision: action === "APPROVE" ? "APPROVED" : action === "REQUEST_CHANGES" ? "CHANGES_REQUESTED" : "REJECTED",
        decisionComment: comment?.trim() || null,
        decidedAt: new Date(),
      },
    });
    await apply(tx, storyId, from, res.next);
    await enqueue(tx, storyId, res.jobs);
    return res;
  });
}

/** NEW → SCRIPT_DRAFT (manual sau din cron). */
export async function startStory(db: PrismaClient, storyId: string) {
  return db.$transaction(async (tx) => {
    const story = await tx.story.findUniqueOrThrow({ where: { id: storyId } });
    if (story.excluded) throw new ConflictError("Povestea e exclusă din coadă");
    const res = transition(story.status as StoryStatus, { type: "START" });
    await apply(tx, storyId, story.status as StoryStatus, res.next);
    await enqueue(tx, storyId, res.jobs);
    return res;
  });
}

/** Folosit de worker: salvează versiunea nouă și mută povestea în *_REVIEW. */
export async function saveDraftVersion(
  db: PrismaClient,
  args: { storyId: string; stage: Stage; jobId: string; payload: unknown; files?: unknown[]; inputFeedback?: string | null; parentVersionId?: string | null },
) {
  return db.$transaction(async (tx) => {
    const story = await tx.story.findUniqueOrThrow({ where: { id: args.storyId } });
    const res = transition(story.status as StoryStatus, { type: "DRAFT_READY", stage: args.stage });
    const last = await latestVersion(tx, args.storyId, args.stage);
    const v = await tx.version.create({
      data: {
        storyId: args.storyId,
        stage: args.stage,
        number: (last?.number ?? 0) + 1,
        payload: args.payload as Prisma.InputJsonValue,
        files: (args.files ?? []) as Prisma.InputJsonValue,
        inputFeedback: args.inputFeedback ?? null,
        parentVersionId: args.parentVersionId ?? last?.id ?? null,
        jobId: args.jobId,
      },
    });
    await apply(tx, args.storyId, story.status as StoryStatus, res.next);
    return v;
  });
}

/** Următoarea poveste din coadă (pentru cron). */
export async function nextInQueue(db: PrismaClient, bookId?: string) {
  return db.story.findFirst({
    where: { status: "NEW", excluded: false, ...(bookId ? { bookId } : {}) },
    orderBy: [{ position: "asc" }, { number: "asc" }],
  });
}

/** Mută o poveste în coadă cu o poziție (sus/jos), schimbând poziția cu vecinul. */
export async function moveInQueue(db: PrismaClient, storyId: string, dir: "up" | "down") {
  return db.$transaction(async (tx) => {
    const s = await tx.story.findUniqueOrThrow({ where: { id: storyId } });
    const neighbor = await tx.story.findFirst({
      where: { bookId: s.bookId, status: "NEW", position: dir === "up" ? { lt: s.position } : { gt: s.position } },
      orderBy: { position: dir === "up" ? "desc" : "asc" },
    });
    if (!neighbor) return false;
    await tx.story.update({ where: { id: s.id }, data: { position: neighbor.position } });
    await tx.story.update({ where: { id: neighbor.id }, data: { position: s.position } });
    return true;
  });
}

export async function setExcluded(db: PrismaClient, storyId: string, excluded: boolean) {
  return db.story.update({ where: { id: storyId }, data: { excluded } });
}

/**
 * Preia atomic următorul job (FOR UPDATE SKIP LOCKED) — sigur cu mai multe instanțe de worker.
 */
export async function claimJob(db: PrismaClient, workerId: string) {
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "Job" SET status = 'RUNNING', "lockedBy" = ${workerId}, "lockedAt" = now(),
           "startedAt" = COALESCE("startedAt", now()), attempts = attempts + 1
    WHERE id = (
      SELECT id FROM "Job"
      WHERE status IN ('QUEUED','WAITING_LIMIT') AND "runAfter" <= now()
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id`;
  if (!rows.length) return null;
  return db.job.findUnique({ where: { id: rows[0].id } });
}

/** Joburi blocate (worker oprit în timpul rulării) — le repunem în coadă. */
export async function requeueStale(db: PrismaClient, olderThanMs: number) {
  const r = await db.job.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - olderThanMs) } },
    data: { status: "QUEUED", lockedBy: null, lockedAt: null },
  });
  return r.count;
}

export async function appendJobLog(db: PrismaClient, jobId: string, entry: Record<string, unknown>) {
  // jsonb concat: atomic, fără read-modify-write
  await db.$executeRaw`UPDATE "Job" SET logs = logs || ${JSON.stringify([entry])}::jsonb WHERE id = ${jobId}`;
}

/** Re-pune în coadă un job eșuat (buton „Reîncearcă” în UI). */
export async function retryJob(db: PrismaClient, jobId: string) {
  const r = await db.job.updateMany({
    where: { id: jobId, status: "FAILED" },
    data: { status: "QUEUED", error: null, runAfter: new Date(), lockedBy: null, lockedAt: null },
  });
  if (r.count !== 1) throw new ConflictError("Jobul nu e în starea FAILED");
}

export { STAGE_DEF };
export * from "./import";
export * from "./integrations";
export * from "./usage";
