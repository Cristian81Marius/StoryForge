/**
 * Verifică lanțul audio al fazei 4 FĂRĂ un provider TTS real: pe o COPIE a episodului
 * (work/ep-NNN-voicetest), generează „narațiune” sintetică (ton modulat cu durata ~ lungimea replicii),
 * apoi rulează exact pașii jobului: fit --write → draft cu voce → render + mix → outro → check.
 * Rulare: npm run voice:check -- 1 ro
 */
import { cpSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { makeLogger, renderAttribution, type Storyboard } from "../packages/core/src";
import { TrifaV2Provider, spawnPython } from "../apps/worker/src/animation/trifa-v2";
import { writeOutroPage, appendOutro } from "../apps/worker/src/outro";
import { narrationText } from "../apps/worker/src/tts/types";

const root = resolve(import.meta.dirname, "..");
const n = Number(process.argv[2] ?? 1);
const lang = (process.argv[3] ?? "ro") as "ro" | "en";
const nnn = String(n).padStart(3, "0");
const db = new PrismaClient();
const story = await db.story.findFirstOrThrow({ where: { number: n }, include: { book: true, versions: { where: { stage: "SCRIPT" }, orderBy: { number: "desc" } } } });
await db.$disconnect();
const sb = (story.versions[0].payload as { storyboard: Storyboard }).storyboard;

const src = resolve(root, "work", `ep-${nnn}`);
const dir = resolve(root, "work", `ep-${nnn}-voicetest`);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
for (const d of ["pipeline", "fonts"]) cpSync(resolve(src, d), resolve(dir, d), { recursive: true });
const ep = { dir, pipeline: resolve(dir, "pipeline"), storyNumber: n };

const audio = resolve(dir, "audio", lang);
mkdirSync(audio, { recursive: true });
sb.scenes.forEach((s, i) => {
  const text = narrationText(s.narration[lang]);
  const dur = Math.max(1.2, text.length / 15); // ~15 caractere/s, ritm de povestitor
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=180:duration=${dur.toFixed(2)}`, "-af", "tremolo=f=4:d=0.6,volume=-12dB", "-ar", "48000", "-ac", "1", resolve(audio, `s${String(i).padStart(2, "0")}.wav`)]);
});

const log = makeLogger({ svc: "voice-check" });
const p = new TrifaV2Provider(spawnPython(), log, { workers: Number(process.env.RENDER_WORKERS || 2) });
console.log(await p.fit(ep, lang, audio));
await p.draft(ep, lang, audio);
const mixed = await p.renderFinal(ep, lang, resolve(dir, "out", lang, `episod-${lang}.mp4`), audio);
const attr = renderAttribution({ template: lang === "ro" ? story.book.attributionRo : story.book.attributionEn, author: story.book.author, number: n, title: story.title, book: story.book.title });
const outro = await p.renderPage(writeOutroPage(ep.pipeline, lang, attr, {}), resolve(dir, "out", `outro-${lang}`));
const final = resolve(dir, "livrare", `${nnn}_${lang.toUpperCase()}.mp4`);
mkdirSync(resolve(dir, "livrare"), { recursive: true });
await appendOutro(mixed, outro, final, true);
const check = await p.check(ep, final, resolve(dir, "out", lang, "check"));
const cfg = readFileSync(resolve(ep.pipeline, `ep-${nnn}-${lang}.html`), "utf8").match(/"DUR":\s*\[[^\]]*\]/)?.[0];
console.log(JSON.stringify({ final, fitWritten: cfg, check: { ...check, raw: undefined } }, null, 2));
