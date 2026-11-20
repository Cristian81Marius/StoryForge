import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import type { Logger } from "@storyforge/core";
import type { AnimationProvider, CheckReport, EpisodeRef, Lang } from "./types";

/**
 * Motorul v2 al skill-ului istorioare-episod-v2: comenzile `build_v2.py` rulate EXACT ca în skill
 * (§4–§6), cu directorul de lucru = pipeline/ (scriptul folosește căi relative, ex. ../fonts).
 * Fișierele motorului nu se modifică.
 */
export interface PyRunner {
  (args: string[], opts: { cwd: string; timeoutMs: number }): Promise<{ code: number | null; out: string }>;
}

export const spawnPython =
  (bin = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3")): PyRunner =>
  (args, { cwd, timeoutMs }) =>
    new Promise((res, rej) => {
      const child = spawn(bin, ["build_v2.py", ...args], { cwd, shell: false, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
      let out = "";
      const t = setTimeout(() => child.kill(), timeoutMs);
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (out += d));
      child.on("error", (e) => {
        clearTimeout(t);
        rej(e);
      });
      child.on("close", (code) => {
        clearTimeout(t);
        res({ code, out });
      });
    });

const page = (ep: EpisodeRef, lang: Lang) => `ep-${String(ep.storyNumber).padStart(3, "0")}-${lang}.html`;

export class TrifaV2Provider implements AnimationProvider {
  readonly id = "trifa-v2";
  constructor(
    private readonly py: PyRunner,
    private readonly log: Logger,
    private readonly opts: { workers?: number } = {},
  ) {}

  private async run(ep: { pipeline: string }, args: string[], timeoutMs: number) {
    this.log.info("engine.run", { cmd: args[0], args: args.slice(1).join(" ") });
    const t0 = Date.now();
    const r = await this.py(args, { cwd: ep.pipeline, timeoutMs });
    const tail = r.out.trim().split("\n").slice(-12).join("\n");
    // build_v2 semnalează erorile din pagină pe stdout, nu prin cod de ieșire
    if (r.code !== 0 || /EROARE ÎN PAGINĂ|Traceback|eșuat/.test(r.out)) {
      throw new Error(`build_v2.py ${args[0]} a eșuat (cod ${r.code}):\n${tail}`);
    }
    this.log.info("engine.ok", { cmd: args[0], ms: Date.now() - t0 });
    return r.out;
  }

  private out(ep: EpisodeRef, lang: Lang) {
    const d = resolve(ep.dir, "out", lang);
    mkdirSync(d, { recursive: true });
    return d;
  }
  private rel(ep: { pipeline: string }, p: string) {
    return relative(ep.pipeline, p).split("\\").join("/");
  }

  async preview(ep: EpisodeRef, lang: Lang) {
    const out = this.out(ep, lang);
    await this.run(ep, ["preview", page(ep, lang), this.rel(ep, out)], 10 * 60_000);
    return resolve(out, "preview_grid.jpg");
  }

  async draft(ep: EpisodeRef, lang: Lang) {
    const out = this.out(ep, lang);
    await this.run(ep, ["draft", page(ep, lang), this.rel(ep, out)], 30 * 60_000);
    return resolve(out, "draft.mp4");
  }

  async fit(ep: EpisodeRef, lang: Lang, audioDir: string) {
    return this.run(ep, ["fit", page(ep, lang), this.rel(ep, audioDir), "--write"], 5 * 60_000);
  }

  async renderFinal(ep: EpisodeRef, lang: Lang, dest: string, audioDir?: string) {
    const out = this.out(ep, lang);
    const workers = ["--workers", String(this.opts.workers ?? 2)];
    // ≈4 s de calcul pe secundă de video (skill §5.4); reluare cu --resume dacă există părți
    const resume = existsSync(resolve(out, "parts")) ? ["--resume"] : [];
    await this.run(ep, ["render", page(ep, lang), this.rel(ep, out), ...workers, ...resume], 90 * 60_000);
    mkdirSync(dirname(dest), { recursive: true });
    if (audioDir) {
      await this.run(ep, ["mix", page(ep, lang), this.rel(ep, out), this.rel(ep, audioDir), this.rel(ep, dest)], 20 * 60_000);
      return dest;
    }
    return resolve(out, "video_only.mp4");
  }

  async cover(ep: EpisodeRef, lang: Lang, dest: string) {
    mkdirSync(dirname(dest), { recursive: true });
    await this.run(ep, ["cover", page(ep, lang), this.rel(ep, dest), "2.5"], 5 * 60_000);
    return dest;
  }

  async check(ep: { pipeline: string }, video: string, outDir: string): Promise<CheckReport> {
    mkdirSync(outDir, { recursive: true });
    const raw = await this.run(ep, ["check", this.rel(ep, video), this.rel(ep, outDir)], 10 * 60_000);
    return parseCheck(raw, resolve(outDir, "check_sheet.jpg"));
  }

  async renderPage(pagePath: string, outDir: string) {
    const ep = { pipeline: dirname(pagePath) };
    mkdirSync(outDir, { recursive: true });
    await this.run(ep, ["render", basename(pagePath), this.rel(ep, outDir), "--workers", "1"], 20 * 60_000);
    return resolve(outDir, "video_only.mp4");
  }
}

export function parseCheck(raw: string, sheet: string): CheckReport {
  const v = raw.match(/video (\d+)x(\d+) (\S+) (\S+) (\S+) (\d+) fps, audio (.+?), durata ([\d.]+) s/);
  const lufs = raw.match(/intensitate (-?[\d.]+) LUFS/);
  const peak = raw.match(/vârf (-?[\d.]+) dBFS/);
  const sil = raw.match(/tăceri peste 1\.2 s în episod: (.+)/);
  return {
    width: v ? Number(v[1]) : 0,
    height: v ? Number(v[2]) : 0,
    codec: v?.[3] ?? "?",
    colorSpace: v?.[5] ?? "?",
    fps: v ? Number(v[6]) : 0,
    durationSec: v ? Number(v[8]) : 0,
    audio: v && v[7] !== "LIPSEȘTE" ? v[7] : null,
    lufs: lufs ? Number(lufs[1]) : null,
    peakDbfs: peak ? Number(peak[1]) : null,
    silences: sil?.[1]?.trim() ?? "—",
    sheet,
    raw: raw.slice(-2000),
  };
}
