import { spawn } from "node:child_process";
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

/**
 * Outro-ul de brand: o pagină pentru motorul v2 (aceleași fonturi, culori și „hârtie” ca episodul),
 * cu atribuirea obligatorie a platformei. Cartela finală a skill-ului rămâne neatinsă în episod;
 * outro-ul se lipește DUPĂ el.
 */
export interface OutroTemplate {
  brandName?: string;
  tagline?: { ro?: string; en?: string };
  /** culoare de accent (implicit auriul canalului) */
  accent?: string;
  /** cale locală a logo-ului (PNG/SVG), copiată lângă pagină */
  logoPath?: string;
  durationSec?: number;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const COLOR = /^#[0-9a-f]{3,8}$/i;

/** Împarte atribuirea pe rânduri scurte (la „ · ”), ca să încapă în lățimea de 540. */
export function attributionLines(attribution: string): string[] {
  return attribution
    .split(/\s+·\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildOutroHtml(lang: "ro" | "en", attribution: string, t: OutroTemplate, logoFile?: string): string {
  const accent = t.accent && COLOR.test(t.accent) ? t.accent : "#ffd36b";
  const dur = Math.min(8, Math.max(2.5, t.durationSec ?? 4));
  const lines = attributionLines(attribution);
  const y0 = 560;
  const text = lines
    .map((l, i) => `  <text x="270" y="${y0 + i * 34}" class="t-credit" style="fill:#efe7d2" data-in="fade" data-at="${(0.6 + i * 0.2).toFixed(1)}">${esc(l)}</text>`)
    .join("\n");
  const brand = t.brandName ? `  <text x="270" y="430" class="t-title shine letters" style="font-size:44px" data-at=".1">${esc(t.brandName)}</text>` : "";
  const tagline = t.tagline?.[lang] ? `  <text x="270" y="480" class="t-sub" data-in="rise" data-at=".4">${esc(t.tagline[lang]!)}</text>` : "";
  const logo = logoFile ? `  <image href="${esc(logoFile)}" x="210" y="230" width="120" height="120" data-in="pop" data-at=".2"/>` : "";
  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8"><title>Outro ${lang}</title><link rel="stylesheet" href="engine-v2.css"></head>
<body>
<div id="stage">
<div class="scene" data-cam="still" data-tr="fade" data-amb="dust:14">
<svg viewBox="0 0 540 960">
  <rect x="-40" y="-40" width="620" height="1040" fill="url(#skyEnd)"/>
  <g class="stars" data-n="80"></g>
  <g transform="translate(270,470)"><circle r="250" fill="url(#glow)" opacity=".18" class="a-pulse"/></g>
${logo}
${brand}
${tagline}
  <line x1="200" y1="520" x2="340" y2="520" stroke="${accent}" stroke-opacity=".7" stroke-width="1.5" data-in="draw" data-at=".4"/>
${text}
</svg></div>
</div>
<script id="reel-config" type="application/json">{"DUR":[${dur}],"RATE":null,"VO":null}</script>
<script src="personaje-v2.js"></script>
<script src="fundaluri-v2.js"></script>
<script src="engine-v2.js"></script>
</body>
</html>
`;
}

/** Scrie outro-<lang>.html în pipeline-ul episodului (lângă motor). Întoarce calea paginii. */
export function writeOutroPage(pipelineDir: string, lang: "ro" | "en", attribution: string, t: OutroTemplate): string {
  let logoFile: string | undefined;
  if (t.logoPath && existsSync(t.logoPath)) {
    logoFile = `outro-logo${extname(t.logoPath).toLowerCase()}`;
    copyFileSync(t.logoPath, resolve(pipelineDir, logoFile));
  }
  const p = resolve(pipelineDir, `outro-${lang}.html`);
  writeFileSync(p, buildOutroHtml(lang, attribution, t, logoFile));
  return p;
}

export function probeDuration(file: string): Promise<number> {
  return new Promise((res, rej) => {
    const c = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { windowsHide: true });
    let out = "";
    c.stdout.on("data", (d) => (out += d));
    c.on("error", rej);
    c.on("close", (code) => (code === 0 && Number(out) > 0 ? res(Number(out)) : rej(new Error(`ffprobe a eșuat pentru ${file}`))));
  });
}

export function hasAudioStream(file: string): Promise<boolean> {
  return new Promise((res, rej) => {
    const c = spawn("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", file], { windowsHide: true });
    let out = "";
    c.stdout.on("data", (d) => (out += d));
    c.on("error", rej);
    c.on("close", () => res(out.trim().length > 0));
  });
}

function ffmpeg(args: string[], timeoutMs = 20 * 60_000): Promise<void> {
  return new Promise((res, rej) => {
    const c = spawn("ffmpeg", ["-y", "-loglevel", "error", ...args], { windowsHide: true });
    let err = "";
    const t = setTimeout(() => c.kill(), timeoutMs);
    c.stderr.on("data", (d) => (err += d));
    c.on("error", rej);
    c.on("close", (code) => {
      clearTimeout(t);
      code === 0 ? res() : rej(new Error(`ffmpeg a eșuat (${code}): ${err.slice(-800)}`));
    });
  });
}

/**
 * Lipește outro-ul (fără sunet) după episod. Reencodare cu aceiași parametri ca `mix` din skill
 * (H.264 high, CRF 17, tune animation, BT.709, AAC 48 kHz), ca fișierul final să rămână conform.
 * Dacă episodul nu are audio (faza 3, înainte de voce), rezultatul nu are nici el.
 */
export async function appendOutro(episode: string, outroVideo: string, dest: string, episodeHasAudio: boolean) {
  const v = "-c:v libx264 -preset medium -tune animation -crf 17 -profile:v high -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -g 60".split(" ");
  if (episodeHasAudio) {
    const outroDur = await probeDuration(outroVideo);
    await ffmpeg([
      "-i", episode, "-i", outroVideo, "-f", "lavfi", "-t", outroDur.toFixed(3), "-i", "anullsrc=r=48000:cl=stereo",
      "-filter_complex",
      "[0:v]setsar=1[ev];[1:v]fps=30,format=yuv420p,setsar=1[ov];[0:a]aresample=48000[ea];[2:a]aresample=48000[sa];" +
        "[ev][ea][ov][sa]concat=n=2:v=1:a=1[v][a]",
      "-map", "[v]", "-map", "[a]", ...v, "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-movflags", "+faststart", dest,
    ]);
  } else {
    await ffmpeg([
      "-i", episode, "-i", outroVideo,
      "-filter_complex", "[0:v]setsar=1[a];[1:v]fps=30,format=yuv420p,setsar=1[b];[a][b]concat=n=2:v=1:a=0[v]",
      "-map", "[v]", ...v, "-movflags", "+faststart", dest,
    ]);
  }
}
