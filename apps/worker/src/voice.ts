import { existsSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { decryptSecret, getStorage, type Storyboard } from "@storyforge/core";
import { saveDraftVersion } from "@storyforge/core/services";
import type { HandlerCtx } from "./ctx";
import { prepareEpisodeDir } from "./episode-dir";
import { providerFor } from "./video";
import { SpekoTTS, makeSpekoClient, type SpekoLike } from "./tts/speko";
import { ManualUploadTTS } from "./tts/manual";
import { narrationText, type TTSProvider, type VoiceSpec } from "./tts/types";

type Lang = "ro" | "en";
const LANGS: Lang[] = ["ro", "en"];
type JobInput = { previousVersionId?: string; feedback?: string };

/** Cheia Speko din Integration (criptată AES-GCM); null dacă nu e configurată. */
export async function spekoClient(ctx: Pick<HandlerCtx, "db">): Promise<SpekoLike | null> {
  const i = await ctx.db.integration.findUnique({ where: { type: "SPEKO" } });
  if (!i?.tokenEnc) return null;
  return makeSpekoClient(decryptSecret(i.tokenEnc));
}

/**
 * Vocile: voci.json din stilul canalului (RO: Cartesia „Andrei”, aprobată), suprascrise din
 * Setări → Integrări → Speko (config.voices.<lang>). Vocea EN neaprobată = avertisment.
 */
export async function voicesFor(ctx: Pick<HandlerCtx, "db">, stilDir: string): Promise<Record<Lang, VoiceSpec & { approved: boolean }>> {
  const file = resolve(stilDir, "voci.json");
  const base = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<Lang, { provider: string | null; voice: string | null; name: string; aprobat: boolean }>) : null;
  const cfg = ((await ctx.db.integration.findUnique({ where: { type: "SPEKO" } }))?.config ?? {}) as { voices?: Partial<Record<Lang, VoiceSpec>> };
  const out = {} as Record<Lang, VoiceSpec & { approved: boolean }>;
  for (const lang of LANGS) {
    const o = cfg.voices?.[lang];
    const b = base?.[lang];
    out[lang] = o?.voice
      ? { voice: o.voice, provider: o.provider ?? null, name: o.name ?? o.voice, approved: true }
      : { voice: b?.voice ?? null, provider: b?.provider ?? null, name: b?.name ?? "implicită", approved: !!b?.aprobat };
  }
  return out;
}

/** Similaritate simplă între textul cerut și transcriere (cuvinte comune / cuvinte cerute). */
export function wordOverlap(expected: string, heard: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  const want = norm(expected);
  const got = new Set(norm(heard));
  if (!want.length) return 1;
  return Math.round((want.filter((w) => got.has(w)).length / want.length) * 100) / 100;
}

/** VOICE_DRAFT: skill §5.1–§5.3 + verificarea pronunției (§5.6): voce pe scenă → fit → draft cu voce. */
export async function voiceDraft(ctx: HandlerCtx, opts: { tts?: TTSProvider; transcriber?: SpekoLike | null } = {}) {
  const story = await ctx.db.story.findUniqueOrThrow({ where: { id: ctx.job.storyId! }, include: { book: true } });
  const input = ctx.job.input as JobInput;
  const script = await ctx.db.version.findFirst({ where: { storyId: story.id, stage: "SCRIPT", decision: "APPROVED" }, orderBy: { number: "desc" } });
  if (!script) throw new Error("Nu există un scenariu aprobat");
  const sb = (script.payload as { storyboard: Storyboard }).storyboard;
  const ep = prepareEpisodeDir(ctx.repoRoot, ctx.workDir, story.number);
  const epRef = { dir: ep.dir, pipeline: ep.pipeline, storyNumber: story.number };
  const engine = providerFor(story.book.animationProvider, ctx);

  let tts = opts.tts;
  let speko: SpekoLike | null = opts.transcriber ?? null;
  if (!tts) {
    if (story.book.ttsProvider === "manual") tts = new ManualUploadTTS((l) => resolve(ep.dir, "upload", l));
    else {
      speko = await spekoClient(ctx);
      if (!speko) throw new Error("Cheia Speko nu e configurată (Setări → Integrări). Alternativ: setează vocea pe „upload manual”.");
      tts = new SpekoTTS(speko);
    }
  }
  const voices = await voicesFor(ctx, ep.stil);
  const warnings: string[] = [];
  const checkpoint = tts.costCheckpoint ? await tts.costCheckpoint().catch(() => null) : null;
  const keyBase = `ep-${String(story.number).padStart(3, "0")}/voice/${ctx.job.id}`;
  const files = [];
  const perLang: Record<string, unknown> = {};

  for (const lang of LANGS) {
    const pageFile = resolve(ep.pipeline, `ep-${String(story.number).padStart(3, "0")}-${lang}.html`);
    const sceneCount = (readFileSync(pageFile, "utf8").match(/<div class="scene"/g) ?? []).length;
    if (sceneCount !== sb.scenes.length) throw new Error(`${lang}: pagina are ${sceneCount} scene, storyboard-ul ${sb.scenes.length}`);
    if (!voices[lang].approved) warnings.push(`${lang}: vocea nu e aprobată încă (voci.json); se folosește ${voices[lang].voice ?? "vocea implicită a routerului"}. Alege una în Setări → Integrări.`);

    const audioDir = resolve(ep.dir, "audio", lang);
    rmSync(audioDir, { recursive: true, force: true });
    mkdirSync(audioDir, { recursive: true });
    const used = new Set<string>();
    for (let i = 0; i < sb.scenes.length; i++) {
      const text = narrationText(sb.scenes[i].narration[lang]);
      if (!text) continue;
      const r = await tts.synthesize(text, lang, voices[lang], resolve(audioDir, `s${String(i).padStart(2, "0")}.wav`));
      used.add(`${r.provider}/${r.model}`);
      ctx.log.info("tts.scene", { lang, scene: i, provider: r.provider });
    }
    // DUR / RATE / VO după voce (skill §5.3)
    const fitOut = await engine.fit(epRef, lang, audioDir);
    const draft = await engine.draft(epRef, lang, audioDir);

    // verificarea pronunției pe scena cea mai lungă (skill §5.6)
    let pronunciation: { scene: number; overlap: number; heard: string } | null = null;
    if (speko && "transcribe" in speko) {
      const longest = sb.scenes.reduce((best, s, i) => (s.narration[lang].length > sb.scenes[best].narration[lang].length ? i : best), 0);
      try {
        const wav = readFileSync(resolve(audioDir, `s${String(longest).padStart(2, "0")}.wav`));
        const t = await (speko as unknown as { transcribe(a: Uint8Array, o: { language: string }): Promise<{ text: string }> }).transcribe(wav, { language: lang });
        pronunciation = { scene: longest, overlap: wordOverlap(narrationText(sb.scenes[longest].narration[lang]), t.text), heard: t.text };
        if (pronunciation.overlap < 0.85) warnings.push(`${lang}: transcrierea scenei ${longest} se potrivește doar ${Math.round(pronunciation.overlap * 100)}% cu textul — ascultă pronunția.`);
      } catch (e) {
        warnings.push(`${lang}: verificarea prin transcriere a eșuat (${(e as Error).message})`);
      }
    }
    files.push({ ...(await storeFile(draft, `${keyBase}/draft-voce-${lang}.mp4`)), kind: "draft", lang });
    perLang[lang] = { voice: voices[lang], providers: [...used], fit: fitOut.split("\n").filter((l) => /^(DUR|RATE|total)/.test(l)), pronunciation };
  }

  const cost = checkpoint !== null && tts.costSince ? await tts.costSince(checkpoint).catch(() => null) : null;
  if (cost !== null && cost > 0) await ctx.db.externalCost.create({ data: { provider: tts.id, storyId: story.id, amountUsd: cost, note: `voce ${story.number}` } });

  await saveDraftVersion(ctx.db, {
    storyId: story.id,
    stage: "VOICE",
    jobId: ctx.job.id,
    payload: { tts: tts.id, languages: perLang, warnings, costUsd: cost },
    files,
    inputFeedback: input.feedback ?? null,
    parentVersionId: input.previousVersionId ?? null,
  });
}

async function storeFile(local: string, key: string) {
  const o = await getStorage().putFile(key, local);
  return { key, mime: o.contentType, bytes: o.size };
}
