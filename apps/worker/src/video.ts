import { existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { getStorage, ProducerOutput, renderAttribution, type ProducerOutput as TProducerOutput } from "@storyforge/core";
import { saveDraftVersion } from "@storyforge/core/services";
import type { HandlerCtx } from "./handlers";
import { prepareEpisodeDir } from "./episode-dir";
import { TrifaV2Provider, spawnPython } from "./animation/trifa-v2";
import type { AnimationProvider, CheckReport, Lang } from "./animation/types";
import { writeOutroPage, appendOutro, hasAudioStream, type OutroTemplate } from "./outro";
import { runAgent } from "./runner";
import { loadAgentMeta } from "./agents";

const LANGS: Lang[] = ["ro", "en"];
type JobInput = { previousVersionId?: string; feedback?: string; approvedVersionId?: string };

export function providerFor(id: string, ctx: Pick<HandlerCtx, "log">): AnimationProvider {
  if (id === "trifa-v2") return new TrifaV2Provider(spawnPython(), ctx.log, { workers: Number(process.env.RENDER_WORKERS || 2) });
  throw new Error(`Provider de animație necunoscut: ${id}`);
}

async function loadStory(ctx: HandlerCtx) {
  return ctx.db.story.findUniqueOrThrow({ where: { id: ctx.job.storyId! }, include: { book: true } });
}

/** Urcă un fișier local în storage și întoarce referința pentru Version.files. */
async function store(local: string, key: string, kind: string, lang?: Lang) {
  const o = await getStorage().putFile(key, local);
  return { key, kind, lang, mime: o.contentType, bytes: o.size };
}

function producerPrompt(p: { inputPath: string; lang: Lang }) {
  return [
    `QA vizual pentru pagina ${p.lang.toUpperCase()} a episodului.`,
    `Input-ul jobului (căile paginii și ale grilei preview_grid.jpg, storyboard-ul aprobat, feedback-ul dacă există) e în: ${p.inputPath}`,
    `Aplică skill-ul istorioare-episod-v2 §4 pasul 1, conform instrucțiunilor tale de agent, apoi întoarce obiectul JSON conform schemei.`,
  ].join("\n");
}

/** VIDEO_DRAFT: skill §4 — preview → QA + reparații (producer) → draft 540×960 fără voce. */
export async function videoDraft(ctx: HandlerCtx) {
  const story = await loadStory(ctx);
  const input = ctx.job.input as JobInput;
  const ep = prepareEpisodeDir(ctx.repoRoot, ctx.workDir, story.number);
  const epRef = { dir: ep.dir, pipeline: ep.pipeline, storyNumber: story.number };
  const provider = providerFor(story.book.animationProvider, ctx);
  const script = await ctx.db.version.findFirst({ where: { storyId: story.id, stage: "SCRIPT", decision: "APPROVED" }, orderBy: { number: "desc" } });
  if (!script) throw new Error("Nu există un scenariu aprobat");
  const keyBase = `ep-${String(story.number).padStart(3, "0")}/video/${ctx.job.id}`;
  const files = [];
  const qa: Partial<Record<Lang, TProducerOutput>> = {};

  for (const lang of LANGS) {
    let grid = await provider.preview(epRef, lang);
    if (!ctx.mock) {
      const inputPath = resolve(ep.dir, `producer-${lang}-${ctx.job.id}.json`);
      writeFileSync(
        inputPath,
        JSON.stringify(
          {
            lang,
            page: ep.rel(resolve(ep.pipeline, `ep-${String(story.number).padStart(3, "0")}-${lang}.html`)),
            previewGrid: ep.rel(grid),
            engineReadme: ep.rel(resolve(ep.pipeline, "README-v2.md")),
            styleReadme: ep.rel(resolve(ep.stil, "README.md")),
            storyboard: (script.payload as { storyboard?: unknown }).storyboard,
            feedback: input.feedback ?? null,
          },
          null,
          2,
        ),
      );
      const meta = loadAgentMeta(ctx.repoRoot, "producer");
      qa[lang] = await runAgent({
        agent: "producer",
        model: meta.model,
        effort: meta.effort,
        prompt: producerPrompt({ inputPath: ep.rel(inputPath), lang }),
        schema: ProducerOutput,
        cwd: ctx.repoRoot,
        exec: ctx.exec,
        record: ctx.record,
        log: ctx.log,
        allowedTools: ["Read", "Edit", "Glob", "Grep", "Skill"],
        timeoutMs: 20 * 60_000,
      });
      // după reparații, grila se refă ca review-ul să vadă starea reală
      if (qa[lang]!.changedScenes.length) grid = await provider.preview(epRef, lang);
    }
    const draft = await provider.draft(epRef, lang);
    files.push(await store(grid, `${keyBase}/preview-${lang}.jpg`, "preview", lang));
    files.push(await store(draft, `${keyBase}/draft-${lang}.mp4`, "draft", lang));
  }

  await saveDraftVersion(ctx.db, {
    storyId: story.id,
    stage: "VIDEO",
    jobId: ctx.job.id,
    payload: { provider: provider.id, qa, scriptVersionId: script.id, note: "Draft 540×960 fără voce: se aprobă mișcarea și compoziția." },
    files,
    inputFeedback: input.feedback ?? null,
    parentVersionId: input.previousVersionId ?? null,
  });
}

async function outroTemplate(ctx: HandlerCtx, ep: { dir: string }): Promise<OutroTemplate> {
  const s = await ctx.db.settings.findUnique({ where: { id: "global" } });
  const t = (s?.template ?? {}) as OutroTemplate & { logoKey?: string };
  let logoPath: string | undefined;
  if (t.logoKey) {
    const r = await getStorage().read(t.logoKey);
    if (r) {
      const { streamToFile } = await import("@storyforge/core");
      logoPath = resolve(ep.dir, `logo${t.logoKey.slice(t.logoKey.lastIndexOf("."))}`);
      await streamToFile(r.stream, logoPath);
    }
  }
  return { ...t, logoPath };
}

/**
 * FINAL_RENDER: skill §5.4–§6 — randare 1080×1920, mixaj (dacă vocea există: work/ep-NNN/audio/<lang>),
 * outro cu atribuirea, verificare (check), copertă.
 */
export async function finalRender(ctx: HandlerCtx) {
  const story = await loadStory(ctx);
  const input = ctx.job.input as JobInput;
  const ep = prepareEpisodeDir(ctx.repoRoot, ctx.workDir, story.number);
  const epRef = { dir: ep.dir, pipeline: ep.pipeline, storyNumber: story.number };
  const provider = providerFor(story.book.animationProvider, ctx);
  const nnn = String(story.number).padStart(3, "0");
  const keyBase = `ep-${nnn}/final/${ctx.job.id}`;
  const tpl = await outroTemplate(ctx, ep);
  const attr = { author: story.book.author, number: story.number, title: story.title, book: story.book.title };
  const files = [];
  const checks: Partial<Record<Lang, CheckReport>> = {};
  const warnings: string[] = [];

  for (const lang of LANGS) {
    const audioDir = resolve(ep.dir, "audio", lang);
    const hasVoice = existsSync(audioDir) && readdirSync(audioDir).some((f) => f.endsWith(".wav"));
    if (!hasVoice) warnings.push(`${lang}: fără narațiune (vocea vine în faza 4); video final fără audio`);
    const out = resolve(ep.dir, "out", lang);
    mkdirSync(out, { recursive: true });
    const episodeVideo = await provider.renderFinal(epRef, lang, resolve(out, `episod-${lang}.mp4`), hasVoice ? audioDir : undefined);

    const outroPage = writeOutroPage(ep.pipeline, lang, renderAttribution({ template: lang === "ro" ? story.book.attributionRo : story.book.attributionEn, ...attr }), tpl);
    const outroVideo = await provider.renderPage(outroPage, resolve(ep.dir, "out", `outro-${lang}`));
    const final = resolve(ep.dir, "livrare", `${nnn}_${lang.toUpperCase()}.mp4`);
    mkdirSync(resolve(ep.dir, "livrare"), { recursive: true });
    await appendOutro(episodeVideo, outroVideo, final, await hasAudioStream(episodeVideo));

    checks[lang] = await provider.check(epRef, final, resolve(out, "check"));
    const cover = await provider.cover(epRef, lang, resolve(ep.dir, "livrare", `coperta_${lang.toUpperCase()}.jpg`));
    files.push(await store(final, `${keyBase}/${nnn}_${lang.toUpperCase()}.mp4`, "final", lang));
    files.push(await store(cover, `${keyBase}/coperta_${lang.toUpperCase()}.jpg`, "cover", lang));
    files.push(await store(checks[lang]!.sheet, `${keyBase}/check-${lang}.jpg`, "check", lang));
  }

  await saveDraftVersion(ctx.db, {
    storyId: story.id,
    stage: "FINAL",
    jobId: ctx.job.id,
    payload: { provider: provider.id, check: checks, warnings, outro: true },
    files,
    inputFeedback: input.feedback ?? null,
    parentVersionId: input.previousVersionId ?? null,
  });
}
