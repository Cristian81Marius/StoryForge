import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Job, PrismaClient } from "@prisma/client";
import { mockPayload, renderAttribution, ScenaristOutput, STAGE_DEF, type Logger, type Stage } from "@storyforge/core";
import { saveDraftVersion } from "@storyforge/core/services";
import { runAgent, type Exec } from "./runner";
import { loadAgentMeta } from "./agents";
import { scenaristPrompt } from "./prompts";

export interface HandlerCtx {
  db: PrismaClient;
  job: Job;
  log: Logger;
  repoRoot: string;
  workDir: string;
  exec: Exec;
  mock: boolean;
}

type JobInput = { previousVersionId?: string; feedback?: string; approvedVersionId?: string; versionId?: string };

async function loadStory(ctx: HandlerCtx) {
  if (!ctx.job.storyId) throw new Error("Jobul nu are poveste");
  return ctx.db.story.findUniqueOrThrow({ where: { id: ctx.job.storyId }, include: { book: true } });
}

function recorder(ctx: HandlerCtx) {
  return async (r: import("./runner").RunRecord) => {
    await ctx.db.run.create({
      data: {
        jobId: ctx.job.id,
        agent: r.agent,
        model: r.model,
        effort: r.effort,
        attempt: r.attempt,
        inputTokens: r.usage.inputTokens,
        outputTokens: r.usage.outputTokens,
        cacheReadTokens: r.usage.cacheReadTokens,
        cacheCreationTokens: r.usage.cacheCreationTokens,
        costUsd: r.usage.costUsd,
        modelUsage: (r.usage.modelUsage ?? undefined) as object | undefined,
        durationMs: Math.round(r.usage.durationMs),
        durationApiMs: r.usage.durationApiMs ? Math.round(r.usage.durationApiMs) : null,
        numTurns: r.usage.numTurns ?? null,
        exitCode: r.exitCode,
        sessionId: r.usage.sessionId,
        outputValid: r.outputValid,
        error: r.error?.slice(0, 4000),
      },
    });
  };
}

/** Etapă simulată (faza 1): produce payload-ul mock și o înregistrare Run cu cost 0. */
async function mockStage(ctx: HandlerCtx, stage: Stage) {
  const story = await loadStory(ctx);
  const input = ctx.job.input as JobInput;
  const last = await ctx.db.version.findFirst({ where: { storyId: story.id, stage }, orderBy: { number: "desc" } });
  const payload = mockPayload(stage, story, story.book.author, input.feedback, (last?.number ?? 0) + 1);
  await ctx.db.run.create({ data: { jobId: ctx.job.id, agent: `mock:${stage.toLowerCase()}`, model: "mock", outputValid: true } });
  await saveDraftVersion(ctx.db, {
    storyId: story.id,
    stage,
    jobId: ctx.job.id,
    payload,
    inputFeedback: input.feedback ?? null,
    parentVersionId: input.previousVersionId ?? null,
  });
  ctx.log.info("stage.mock_done", { stage });
}

async function scriptDraft(ctx: HandlerCtx) {
  if (ctx.mock) return mockStage(ctx, "SCRIPT");
  const story = await loadStory(ctx);
  const input = ctx.job.input as JobInput;
  const previous = input.previousVersionId ? await ctx.db.version.findUnique({ where: { id: input.previousVersionId } }) : null;

  const dir = resolve(ctx.workDir, `ep-${String(story.number).padStart(3, "0")}`);
  mkdirSync(dir, { recursive: true });
  const inputPath = resolve(dir, `input-${ctx.job.id}.json`);
  const attr = { author: story.book.author, number: story.number, title: story.title, book: story.book.title };
  writeFileSync(
    inputPath,
    JSON.stringify(
      {
        story: { number: story.number, title: story.title, sourceReference: story.sourceReference, text: story.text },
        book: { title: story.book.title, author: story.book.author, skill: story.book.skillName, animationProvider: story.book.animationProvider },
        attribution: { ro: renderAttribution({ template: story.book.attributionRo, ...attr }), en: renderAttribution({ template: story.book.attributionEn, ...attr }) },
        previousVersion: previous ? { number: previous.number, payload: previous.payload } : null,
        feedback: input.feedback ?? null,
        outputDir: dir,
      },
      null,
      2,
    ),
  );

  const meta = loadAgentMeta(ctx.repoRoot, "scenarist");
  const out = await runAgent({
    agent: "scenarist",
    model: meta.model,
    effort: meta.effort,
    prompt: scenaristPrompt({ inputPath, workDir: dir, storyNumber: story.number, hasFeedback: !!input.feedback }),
    schema: ScenaristOutput,
    cwd: ctx.repoRoot,
    exec: ctx.exec,
    record: recorder(ctx),
    log: ctx.log,
    allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Skill", "Bash(python3:*)", "Bash(python:*)"],
  });

  // Trasabilitate: storyboard-ul trebuie să indice istorioara corectă.
  if (out.storyboard.source.storyNumber !== story.number) throw new Error(`Storyboard pentru nr. ${out.storyboard.source.storyNumber}, așteptat ${story.number}`);

  await saveDraftVersion(ctx.db, {
    storyId: story.id,
    stage: "SCRIPT",
    jobId: ctx.job.id,
    payload: out,
    inputFeedback: input.feedback ?? null,
    parentVersionId: input.previousVersionId ?? null,
  });
}

/** Etapele care se implementează în fazele 3–5; până atunci rulează doar în mod mock. */
function notYet(stage: Stage, phase: number) {
  return async (ctx: HandlerCtx) => {
    if (ctx.mock) return mockStage(ctx, stage);
    throw new Error(`Etapa ${STAGE_DEF[stage].label} se implementează în faza ${phase}. Pornește workerul cu STORYFORGE_MOCK_AGENTS=1 pentru demo.`);
  };
}

async function socialSchedule(ctx: HandlerCtx) {
  if (!ctx.mock) throw new Error("Programarea Metricool se implementează în faza 5.");
  const story = await loadStory(ctx);
  const channels = await ctx.db.channel.findMany({ where: { active: true } });
  let day = 1;
  for (const ch of channels)
    for (const platform of ch.platforms)
      await ctx.db.schedule.create({
        data: { storyId: story.id, channelId: ch.id, platform, scheduledAt: new Date(Date.now() + day++ * 86400_000), status: "MANUAL", versionId: (ctx.job.input as JobInput).versionId },
      });
  ctx.log.info("social.mock_scheduled", { count: day - 1 });
}

export const HANDLERS: Record<string, (ctx: HandlerCtx) => Promise<void>> = {
  "script.draft": scriptDraft,
  "video.draft": notYet("VIDEO", 3),
  "voice.draft": notYet("VOICE", 4),
  "final.render": notYet("FINAL", 3),
  "social.draft": notYet("SOCIAL", 5),
  "social.schedule": socialSchedule,
};
