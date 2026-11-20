import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Job, PrismaClient } from "@prisma/client";
import { mockPayload, renderAttribution, ScenaristOutput, type Stage } from "@storyforge/core";
import { saveDraftVersion } from "@storyforge/core/services";
import { runAgent, type Exec } from "./runner";
import { loadAgentMeta } from "./agents";
import { scenaristPrompt } from "./prompts";
import { prepareEpisodeDir } from "./episode-dir";
import { runComoriImport } from "./import-comori";

export type { HandlerCtx } from "./ctx";
import type { HandlerCtx } from "./ctx";
import { videoDraft, finalRender } from "./video";
import { voiceDraft } from "./voice";
import { socialDraft, socialSchedule, socialReschedule, socialCheck } from "./social";

type JobInput = { previousVersionId?: string; feedback?: string; approvedVersionId?: string; versionId?: string };

async function loadStory(ctx: HandlerCtx) {
  if (!ctx.job.storyId) throw new Error("Jobul nu are poveste");
  return ctx.db.story.findUniqueOrThrow({ where: { id: ctx.job.storyId }, include: { book: true } });
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

  const ep = prepareEpisodeDir(ctx.repoRoot, ctx.workDir, story.number);
  const inputPath = resolve(ep.dir, `input-${ctx.job.id}.json`);
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
        /** Paginile ep-NNN-ro.html / ep-NNN-en.html se scriu AICI, lângă motor (căile relative din șablon). */
        outputDir: ep.pipeline,
        outputDirRelative: ep.rel(ep.pipeline),
        styleDir: ep.rel(ep.stil),
        engineReadme: ep.rel(resolve(ep.pipeline, "README-v2.md")),
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
    prompt: scenaristPrompt({ inputPath: ep.rel(inputPath), workDir: ep.rel(ep.dir), storyNumber: story.number, hasFeedback: !!input.feedback }),
    schema: ScenaristOutput,
    cwd: ctx.repoRoot,
    exec: ctx.exec,
    record: ctx.record,
    log: ctx.log,
    allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Skill", "Bash(python3:*)", "Bash(python:*)"],
  });

  // Trasabilitate: storyboard-ul trebuie să indice istorioara corectă.
  if (out.storyboard.source.storyNumber !== story.number) throw new Error(`Storyboard pentru nr. ${out.storyboard.source.storyNumber}, așteptat ${story.number}`);
  // Paginile HTML declarate trebuie să existe (output-ul §3 al skill-ului).
  const files = (["ro", "en"] as const).map((lang) => {
    const rel = out.storyboard.render.files[lang];
    if (!rel || !existsSync(resolve(ctx.repoRoot, rel))) throw new Error(`Pagina ${lang} lipsește: ${rel ?? "(nedeclarată)"}`);
    return { key: rel, kind: "page", lang, mime: "text/html" };
  });

  await saveDraftVersion(ctx.db, {
    storyId: story.id,
    stage: "SCRIPT",
    jobId: ctx.job.id,
    payload: out,
    files,
    inputFeedback: input.feedback ?? null,
    parentVersionId: input.previousVersionId ?? null,
  });
}

async function bookImportComori(ctx: HandlerCtx) {
  const { importId, limit } = ctx.job.input as { importId: string; limit?: number };
  try {
    await runComoriImport({ db: ctx.db, importId, cacheDir: resolve(ctx.workDir, "cache/comori"), log: ctx.log, limit });
  } catch (e) {
    await ctx.db.bookImport.update({ where: { id: importId }, data: { status: "FAILED", error: (e as Error).message } });
    throw e;
  }
}

/** Mod demo: rânduri în calendar, toate manuale. */
async function mockSchedule(ctx: HandlerCtx) {
  const story = await loadStory(ctx);
  const channels = await ctx.db.channel.findMany({ where: { active: true } });
  let day = 1;
  for (const ch of channels)
    for (const platform of ch.platforms)
      await ctx.db.schedule.create({
        data: { storyId: story.id, channelId: ch.id, platform, lang: ch.language, scheduledAt: new Date(Date.now() + day++ * 86400_000), status: "MANUAL", versionId: (ctx.job.input as JobInput).versionId },
      });
}

export const HANDLERS: Record<string, (ctx: HandlerCtx) => Promise<void>> = {
  "book.import.comori": bookImportComori,
  "script.draft": scriptDraft,
  "video.draft": (ctx) => (ctx.mock ? mockStage(ctx, "VIDEO") : videoDraft(ctx)),
  "voice.draft": (ctx) => (ctx.mock ? mockStage(ctx, "VOICE") : voiceDraft(ctx)),
  "final.render": (ctx) => (ctx.mock ? mockStage(ctx, "FINAL") : finalRender(ctx)),
  "social.draft": (ctx) => (ctx.mock ? mockStage(ctx, "SOCIAL") : socialDraft(ctx)),
  "social.reschedule": socialReschedule,
  "social.check": socialCheck,
  "social.schedule": (ctx) => (ctx.mock ? mockSchedule(ctx) : socialSchedule(ctx)),
};
