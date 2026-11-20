import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import {
  SocialOutput,
  buildMetricoolInfo,
  ensureAttribution,
  nextPostSlot,
  renderAttribution,
  utcToLocal,
  type SocialPost,
  type Storyboard,
} from "@storyforge/core";
import { getIntegrationToken, saveDraftVersion } from "@storyforge/core/services";
import type { HandlerCtx } from "./ctx";
import { prepareEpisodeDir } from "./episode-dir";
import { runAgent } from "./runner";
import { loadAgentMeta } from "./agents";

type JobInput = { previousVersionId?: string; feedback?: string; versionId?: string; scheduleId?: string };
type MetricoolCfg = { mode?: "manual" | "api" | "mcp"; userId?: string; publicMediaBaseUrl?: string; monthlyPostLimit?: number };
type Rhythm = { postDays?: number[]; postHour?: string };

async function metricoolConfig(ctx: HandlerCtx): Promise<MetricoolCfg> {
  return ((await ctx.db.integration.findUnique({ where: { type: "METRICOOL" } }))?.config ?? {}) as MetricoolCfg;
}

// ---------------------------------------------------------------- SOCIAL_DRAFT

/** SOCIAL_DRAFT: skill §6 (postare.md) → postări pe limbă × platformă, cu atribuirea garantată și ore propuse. */
export async function socialDraft(ctx: HandlerCtx) {
  const story = await ctx.db.story.findUniqueOrThrow({ where: { id: ctx.job.storyId! }, include: { book: true } });
  const input = ctx.job.input as JobInput;
  const script = await ctx.db.version.findFirst({ where: { storyId: story.id, stage: "SCRIPT", decision: "APPROVED" }, orderBy: { number: "desc" } });
  const final = await ctx.db.version.findFirst({ where: { storyId: story.id, stage: "FINAL", decision: "APPROVED" }, orderBy: { number: "desc" } });
  if (!script || !final) throw new Error("Lipsesc scenariul sau video-ul final aprobat");
  const channels = await ctx.db.channel.findMany({ where: { active: true } });
  if (!channels.length) throw new Error("Niciun canal activ (Setări → Canale)");
  const previous = input.previousVersionId ? await ctx.db.version.findUnique({ where: { id: input.previousVersionId } }) : null;

  const ep = prepareEpisodeDir(ctx.repoRoot, ctx.workDir, story.number);
  const postareMdPath = resolve(ep.dir, "livrare", "postare.md");
  const attr = { author: story.book.author, number: story.number, title: story.title, book: story.book.title };
  const attribution = { ro: renderAttribution({ template: story.book.attributionRo, ...attr }), en: renderAttribution({ template: story.book.attributionEn, ...attr }) };
  const inputPath = resolve(ep.dir, `social-${ctx.job.id}.json`);
  writeFileSync(
    inputPath,
    JSON.stringify(
      {
        postareMdPath: ep.rel(postareMdPath),
        storyboard: (script.payload as { storyboard: Storyboard }).storyboard,
        final: final.payload,
        attribution,
        channels: channels.map((c) => ({ language: c.language, platforms: c.platforms, timezone: c.timezone })),
        previousVersion: previous?.payload ?? null,
        feedback: input.feedback ?? null,
      },
      null,
      2,
    ),
  );
  if (input.feedback && existsSync(postareMdPath)) ctx.log.info("social.feedback", { note: "postare.md se rescrie după feedback" });

  const meta = loadAgentMeta(ctx.repoRoot, "social");
  const out = await runAgent({
    agent: "social",
    model: meta.model,
    effort: meta.effort,
    prompt: [
      `Kitul de postare pentru istorioara nr. ${story.number}.`,
      `Input-ul jobului e în: ${ep.rel(inputPath)}`,
      `Aplică skill-ul istorioare-episod-v2 §6 (doar postare.md), conform instrucțiunilor tale de agent, apoi întoarce obiectul JSON conform schemei.`,
    ].join("\n"),
    schema: SocialOutput,
    cwd: ctx.repoRoot,
    exec: ctx.exec,
    record: ctx.record,
    log: ctx.log,
    allowedTools: ["Read", "Write", "Glob", "Skill"],
    timeoutMs: 15 * 60_000,
  });
  return finishSocialDraft(ctx, story, out, attribution, input);
}

/** Partea deterministă (testabilă): filtrează pe canale, garantează atribuirea, propune ore. */
export async function finishSocialDraft(
  ctx: HandlerCtx,
  story: { id: string; number: number; book: { author: string } },
  out: z.infer<typeof SocialOutput>,
  attribution: { ro: string; en: string },
  input: JobInput,
) {
  const channels = await ctx.db.channel.findMany({ where: { active: true } });
  const settings = await ctx.db.settings.findUnique({ where: { id: "global" } });
  const rhythm = (settings?.rhythm ?? {}) as Rhythm;
  const notes: string[] = [];
  const posts: SocialPost[] = [];
  for (const ch of channels) {
    const lang = ch.language as "ro" | "en";
    const slot = nextPostSlot(new Date(), { postDays: rhythm.postDays ?? [2, 3, 4], hour: rhythm.postHour ?? "19:00", tz: ch.timezone });
    ch.platforms.forEach((platform, k) => {
      const p = out.posts.find((x) => x.lang === lang && x.platform === platform);
      if (!p) {
        notes.push(`lipsește postarea ${lang}/${platform} de la agent`);
        return;
      }
      const { post, added } = ensureAttribution(p, attribution[lang], story.book.author, story.number);
      if (added) notes.push(`${lang}/${platform}: atribuirea lipsea și a fost adăugată automat`);
      // platformele aceluiași canal, decalate cu 20 de minute
      posts.push({ ...post, proposedAt: new Date(slot.getTime() + k * 20 * 60_000).toISOString() });
    });
  }
  const dropped = out.posts.length - posts.length;
  if (dropped > 0) notes.push(`${dropped} postări pentru platforme/limbi fără canal activ au fost ignorate`);
  if (!posts.length) throw new Error(`Nicio postare validă pentru canalele active. ${notes.join("; ")}`);

  await saveDraftVersion(ctx.db, {
    storyId: story.id,
    stage: "SOCIAL",
    jobId: ctx.job.id,
    payload: { posts, postareMd: out.postareMd, notes },
    inputFeedback: input.feedback ?? null,
    parentVersionId: input.previousVersionId ?? null,
  });
}

// ---------------------------------------------------------------- programare

export const PublishResult = z.object({
  results: z.array(z.object({ index: z.number(), ok: z.boolean(), id: z.string().nullish(), uuid: z.string().nullish(), plannerUrl: z.string().nullish(), error: z.string().nullish() })),
});

export interface Publisher {
  readonly mode: "MANUAL" | "API" | "MCP";
  schedule(items: Array<{ index: number; blogId: string; date: string; info: object }>): Promise<z.infer<typeof PublishResult>["results"]>;
}

export class ApiPublisher implements Publisher {
  readonly mode = "API" as const;
  constructor(
    private readonly token: string,
    private readonly userId: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async schedule(items: Array<{ index: number; blogId: string; date: string; info: object }>) {
    const out = [];
    for (const it of items) {
      try {
        const url = `https://app.metricool.com/api/v2/scheduler/posts?blogId=${encodeURIComponent(it.blogId)}&userId=${encodeURIComponent(this.userId)}`;
        const r = await this.fetcher(url, { method: "POST", headers: { "X-Mc-Auth": this.token, "content-type": "application/json" }, body: JSON.stringify(it.info) });
        const body = (await r.json().catch(() => ({}))) as { data?: { id?: string | number; uuid?: string }; id?: string | number; uuid?: string };
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(body).slice(0, 300)}`);
        const d = body.data ?? body;
        out.push({ index: it.index, ok: true, id: d.id != null ? String(d.id) : null, uuid: d.uuid ?? null, plannerUrl: null, error: null });
      } catch (e) {
        out.push({ index: it.index, ok: false, id: null, uuid: null, plannerUrl: null, error: (e as Error).message });
      }
    }
    return out;
  }
}

export class McpPublisher implements Publisher {
  readonly mode = "MCP" as const;
  constructor(private readonly ctx: HandlerCtx) {}
  async schedule(items: Array<{ index: number; blogId: string; date: string; info: object }>) {
    const server = process.env.METRICOOL_MCP_SERVER || "metricool";
    const inputPath = resolve(this.ctx.workDir, `publish-${this.ctx.job.id}.json`);
    writeFileSync(inputPath, JSON.stringify({ task: "schedule", posts: items }, null, 2));
    const meta = loadAgentMeta(this.ctx.repoRoot, "publisher");
    const r = await runAgent({
      agent: "publisher",
      model: meta.model,
      effort: meta.effort,
      prompt: `Sarcina „schedule”. Input: ${inputPath}`,
      schema: PublishResult,
      cwd: this.ctx.repoRoot,
      exec: this.ctx.exec,
      record: this.ctx.record,
      log: this.ctx.log,
      allowedTools: ["Read", `mcp__${server}__createScheduledPost`],
      timeoutMs: 10 * 60_000,
    });
    return r.results;
  }
}

/** Câte postări au fost deja programate luna aceasta pe un brand (limita planului Free: 20). */
async function postsThisMonth(ctx: HandlerCtx, brandId: string) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return ctx.db.schedule.count({ where: { status: "SCHEDULED", createdAt: { gte: start }, channel: { metricoolBrandId: brandId } } });
}

/** social.schedule (după aprobarea kitului): rânduri în calendar + programare Metricool (api / mcp) sau manuală. */
export async function socialSchedule(ctx: HandlerCtx, publisherOverride?: Publisher) {
  const story = await ctx.db.story.findUniqueOrThrow({ where: { id: ctx.job.storyId! } });
  const input = ctx.job.input as JobInput;
  const version = input.versionId
    ? await ctx.db.version.findUniqueOrThrow({ where: { id: input.versionId } })
    : await ctx.db.version.findFirstOrThrow({ where: { storyId: story.id, stage: "SOCIAL", decision: "APPROVED" }, orderBy: { number: "desc" } });
  const final = await ctx.db.version.findFirstOrThrow({ where: { storyId: story.id, stage: "FINAL", decision: "APPROVED" }, orderBy: { number: "desc" } });
  const finalFiles = final.files as Array<{ key: string; kind: string; lang?: string }>;
  const posts = (version.payload as { posts: SocialPost[] }).posts;
  const channels = await ctx.db.channel.findMany({ where: { active: true } });
  const cfg = await metricoolConfig(ctx);

  let publisher: Publisher | null = publisherOverride ?? null;
  const why: string[] = [];
  if (!publisher && cfg.mode === "api") {
    const token = await getIntegrationToken(ctx.db, "METRICOOL");
    if (!token || !cfg.userId) why.push("API Metricool: lipsesc token-ul sau userId");
    else publisher = new ApiPublisher(token, cfg.userId);
  } else if (!publisher && cfg.mode === "mcp") publisher = new McpPublisher(ctx);
  if (publisher && publisher.mode !== "MANUAL" && !cfg.publicMediaBaseUrl) {
    why.push("lipsește URL-ul public pentru media (Metricool cere link public care nu expiră)");
    publisher = null;
  }

  // rândurile din calendar (idempotent: o reluare nu dublează postările)
  await ctx.db.schedule.deleteMany({ where: { storyId: story.id, versionId: version.id, status: { in: ["PENDING", "FAILED", "MANUAL"] } } });
  const items: Array<{ index: number; scheduleId: string; blogId: string; date: string; info: object }> = [];
  const limits = new Map<string, number>();
  for (const [index, p] of posts.entries()) {
    const ch = channels.find((c) => c.language === p.lang && c.platforms.includes(p.platform));
    if (!ch) continue;
    const at = new Date(p.proposedAt ?? Date.now() + 86400_000);
    const video = finalFiles.find((f) => f.kind === "final" && f.lang === p.lang);
    const videoUrl = video && cfg.publicMediaBaseUrl ? new URL(video.key, cfg.publicMediaBaseUrl.endsWith("/") ? cfg.publicMediaBaseUrl : `${cfg.publicMediaBaseUrl}/`).toString() : "";
    const localDateTime = utcToLocal(at, ch.timezone);
    const info = buildMetricoolInfo(p, { localDateTime, timezone: ch.timezone, videoUrl });
    let error: string | null = why.length ? why.join("; ") : null;
    if (publisher && ch.metricoolBrandId) {
      const used = limits.get(ch.metricoolBrandId) ?? (await postsThisMonth(ctx, ch.metricoolBrandId));
      const max = cfg.monthlyPostLimit ?? 0;
      if (max && used >= max) error = `limita lunară de ${max} postări atinsă pe brandul ${ch.metricoolBrandId}: postare manuală`;
      else limits.set(ch.metricoolBrandId, used + 1);
    } else if (publisher && !ch.metricoolBrandId) error = `canalul ${ch.name} nu are brand Metricool`;
    const row = await ctx.db.schedule.create({
      data: {
        storyId: story.id,
        channelId: ch.id,
        versionId: version.id,
        platform: p.platform,
        lang: p.lang,
        scheduledAt: at,
        status: publisher && !error ? "PENDING" : "MANUAL",
        mode: publisher && !error ? publisher.mode : "MANUAL",
        error,
        payload: { post: p, info } as unknown as Prisma.InputJsonValue,
      },
    });
    if (publisher && !error) items.push({ index, scheduleId: row.id, blogId: ch.metricoolBrandId!, date: `${localDateTime}${offsetSuffix(at, ch.timezone)}`, info });
  }

  if (publisher && items.length) {
    const results = await publisher.schedule(items.map(({ scheduleId: _s, ...rest }) => rest));
    for (const it of items) {
      const r = results.find((x) => x.index === it.index);
      await ctx.db.schedule.update({
        where: { id: it.scheduleId },
        data: r?.ok
          ? { status: "SCHEDULED", externalId: r.id ?? null, externalUuid: r.uuid ?? null, plannerUrl: r.plannerUrl ?? null, error: null }
          : { status: "FAILED", error: r?.error ?? "fără răspuns de la publisher" },
      });
    }
    const failed = results.filter((r) => !r.ok).length;
    if (failed) throw new Error(`${failed} din ${items.length} postări nu au putut fi programate în Metricool (vezi Calendar). Reîncercarea programează doar ce a eșuat.`);
  }
  ctx.log.info("social.scheduled", { manual: posts.length - items.length, metricool: items.length, reason: why.join("; ") || undefined });
}

function offsetSuffix(at: Date, tz: string) {
  const local = Date.parse(`${utcToLocal(at, tz)}Z`);
  const min = Math.round((local - at.getTime()) / 60000);
  const sign = min >= 0 ? "+" : "-";
  const a = Math.abs(min);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/** social.reschedule: după mutarea în calendar, actualizează postarea în Metricool (API: PUT; MCP: updateScheduledPost). */
export async function socialReschedule(ctx: HandlerCtx) {
  const { scheduleId } = ctx.job.input as JobInput;
  const s = await ctx.db.schedule.findUniqueOrThrow({ where: { id: scheduleId! }, include: { channel: true } });
  if (s.mode === "MANUAL" || !s.externalId) return; // doar calendarul local
  const payload = s.payload as { info: Record<string, unknown> };
  const localDateTime = utcToLocal(s.scheduledAt, s.channel.timezone);
  const info = { ...payload.info, publicationDate: { dateTime: localDateTime, timezone: s.channel.timezone } };
  const cfg = await metricoolConfig(ctx);
  if (s.mode === "API") {
    const token = await getIntegrationToken(ctx.db, "METRICOOL");
    const r = await fetch(
      `https://app.metricool.com/api/v2/scheduler/posts/${encodeURIComponent(s.externalId)}?blogId=${encodeURIComponent(s.channel.metricoolBrandId ?? "")}&userId=${encodeURIComponent(cfg.userId ?? "")}`,
      { method: "PUT", headers: { "X-Mc-Auth": token ?? "", "content-type": "application/json" }, body: JSON.stringify({ ...info, id: s.externalId, uuid: s.externalUuid }) },
    );
    if (!r.ok) throw new Error(`Metricool PUT HTTP ${r.status}`);
  } else {
    const server = process.env.METRICOOL_MCP_SERVER || "metricool";
    const inputPath = resolve(ctx.workDir, `publish-${ctx.job.id}.json`);
    writeFileSync(inputPath, JSON.stringify({ task: "update", blogId: s.channel.metricoolBrandId, id: s.externalId, uuid: s.externalUuid, info }, null, 2));
    const meta = loadAgentMeta(ctx.repoRoot, "publisher");
    const r = await runAgent({
      agent: "publisher", model: meta.model, effort: meta.effort, prompt: `Sarcina „update”. Input: ${inputPath}`, schema: PublishResult,
      cwd: ctx.repoRoot, exec: ctx.exec, record: ctx.record, log: ctx.log, allowedTools: ["Read", `mcp__${server}__updateScheduledPost`], timeoutMs: 5 * 60_000,
    });
    const res = r.results[0];
    if (!res?.ok) throw new Error(`actualizarea Metricool a eșuat: ${res?.error ?? "fără răspuns"}`);
    await ctx.db.schedule.update({ where: { id: s.id }, data: { externalId: res.id ?? s.externalId } });
  }
  await ctx.db.schedule.update({ where: { id: s.id }, data: { payload: { ...payload, info } as unknown as Prisma.InputJsonValue, error: null } });
}

export const ConnectionsResult = z.object({ connections: z.array(z.object({ blogId: z.string(), network: z.string(), ok: z.boolean(), detail: z.string().nullish() })) });

/**
 * social.check (zilnic, din cron): conexiunile rețelelor pe brandurile canalelor.
 * API: /api/admin/simpleProfiles; MCP: getBrandSettings prin agentul publisher.
 * O conexiune lipsă/expirată → Integration METRICOOL = EXPIRED, cu detaliile (afișate în Dashboard și Setări).
 */
export async function socialCheck(ctx: HandlerCtx) {
  const cfg = await metricoolConfig(ctx);
  const channels = await ctx.db.channel.findMany({ where: { active: true, NOT: { metricoolBrandId: null } } });
  if (!channels.length || !cfg.mode || cfg.mode === "manual") return;
  const brands = channels.map((c) => ({ blogId: c.metricoolBrandId!, platforms: c.platforms }));
  let problems: string[] = [];
  if (cfg.mode === "api") {
    const token = await getIntegrationToken(ctx.db, "METRICOOL");
    const r = await fetch(`https://app.metricool.com/api/admin/simpleProfiles?userId=${encodeURIComponent(cfg.userId ?? "")}`, { headers: { "X-Mc-Auth": token ?? "" } });
    if (r.status === 401 || r.status === 403) problems = [`token Metricool respins (HTTP ${r.status})`];
    else if (!r.ok) throw new Error(`simpleProfiles HTTP ${r.status}`);
    else problems = apiConnectionProblems((await r.json()) as unknown[], brands);
  } else {
    const server = process.env.METRICOOL_MCP_SERVER || "metricool";
    const inputPath = resolve(ctx.workDir, `check-${ctx.job.id}.json`);
    writeFileSync(inputPath, JSON.stringify({ task: "check", brands }, null, 2));
    const meta = loadAgentMeta(ctx.repoRoot, "publisher");
    const r = await runAgent({
      agent: "publisher", model: meta.model, effort: meta.effort, prompt: `Sarcina „check”. Input: ${inputPath}`, schema: ConnectionsResult,
      cwd: ctx.repoRoot, exec: ctx.exec, record: ctx.record, log: ctx.log, allowedTools: ["Read", `mcp__${server}__getBrandSettings`], timeoutMs: 5 * 60_000,
    });
    problems = r.connections.filter((c) => !c.ok).map((c) => `brand ${c.blogId}: ${c.network} ${c.detail ?? "neconectat"}`);
  }
  await ctx.db.integration.upsert({
    where: { type: "METRICOOL" },
    update: { status: problems.length ? "EXPIRED" : "OK", lastChecked: new Date(), lastError: problems.join("; ") || null },
    create: { type: "METRICOOL", status: problems.length ? "EXPIRED" : "OK", lastChecked: new Date(), lastError: problems.join("; ") || null },
  });
}

/** Interpretarea răspunsului simpleProfiles: un câmp de rețea gol/null înseamnă neconectat. */
export function apiConnectionProblems(profiles: unknown[], brands: Array<{ blogId: string; platforms: string[] }>): string[] {
  const field: Record<string, string[]> = { tiktok: ["tiktok", "tiktokBusiness"], instagram: ["instagram", "instagramConnectionType"], youtube: ["youtube"], facebook: ["facebook", "facebookPageId"] };
  const out: string[] = [];
  for (const b of brands) {
    const p = profiles.find((x) => String((x as { id?: unknown }).id) === b.blogId) as Record<string, unknown> | undefined;
    if (!p) {
      out.push(`brand ${b.blogId} nu există în cont`);
      continue;
    }
    for (const net of b.platforms) {
      const connected = (field[net] ?? [net]).some((k) => p[k] !== undefined && p[k] !== null && p[k] !== "");
      const expired = Object.entries(p).some(([k, v]) => k.toLowerCase().includes(net) && /expired|invalid|reconnect/i.test(String(v)));
      if (!connected || expired) out.push(`brand ${b.blogId}: ${net} ${expired ? "conexiune expirată" : "neconectat"}`);
    }
  }
  return out;
}
