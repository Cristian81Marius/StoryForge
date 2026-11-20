/**
 * Verificare manuală a randării finale pentru un episod deja generat (fără să schimbe statusul poveștii):
 * render 1080×1920 → outro cu atribuirea → check → copertă. Folosește aceleași componente ca jobul final.render.
 * Rulare: npm run render:check -- 1 ro
 */
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { makeLogger, renderAttribution } from "../packages/core/src";
import { TrifaV2Provider, spawnPython } from "../apps/worker/src/animation/trifa-v2";
import { writeOutroPage, appendOutro, hasAudioStream } from "../apps/worker/src/outro";

const root = resolve(import.meta.dirname, "..");
const n = Number(process.argv[2] ?? 1);
const lang = (process.argv[3] ?? "ro") as "ro" | "en";
const db = new PrismaClient();
const story = await db.story.findFirstOrThrow({ where: { number: n }, include: { book: true } });
const settings = await db.settings.findUnique({ where: { id: "global" } });
await db.$disconnect();

const nnn = String(n).padStart(3, "0");
const dir = resolve(root, process.env.WORK_DIR ?? "work", `ep-${nnn}`);
const ep = { dir, pipeline: resolve(dir, "pipeline"), storyNumber: n };
const log = makeLogger({ svc: "render-check" });
const p = new TrifaV2Provider(spawnPython(), log, { workers: Number(process.env.RENDER_WORKERS || 2) });

const t0 = Date.now();
const episode = await p.renderFinal(ep, lang, resolve(dir, "out", lang, `episod-${lang}.mp4`));
const attr = renderAttribution({ template: lang === "ro" ? story.book.attributionRo : story.book.attributionEn, author: story.book.author, number: n, title: story.title, book: story.book.title });
const outro = await p.renderPage(writeOutroPage(ep.pipeline, lang, attr, (settings?.template ?? {}) as object), resolve(dir, "out", `outro-${lang}`));
mkdirSync(resolve(dir, "livrare"), { recursive: true });
const final = resolve(dir, "livrare", `${nnn}_${lang.toUpperCase()}.mp4`);
await appendOutro(episode, outro, final, await hasAudioStream(episode));
const check = await p.check(ep, final, resolve(dir, "out", lang, "check"));
await p.cover(ep, lang, resolve(dir, "livrare", `coperta_${lang.toUpperCase()}.jpg`));
console.log(JSON.stringify({ final, seconds: Math.round((Date.now() - t0) / 1000), check: { ...check, raw: undefined } }, null, 2));
