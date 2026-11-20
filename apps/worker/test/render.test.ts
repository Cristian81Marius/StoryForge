import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { makeLogger } from "@storyforge/core";
import { attributionLines, buildOutroHtml, writeOutroPage, appendOutro, probeDuration } from "../src/outro";
import { TrifaV2Provider, spawnPython, parseCheck } from "../src/animation/trifa-v2";

const root = resolve(import.meta.dirname, "../../..");
const ATTR_RO = "După o istorioară de Iosif Trifa · Istorioara nr. 1 «Urechi mântuite» · 600 de istorioare religioase";

describe("outro (unit)", () => {
  it("atribuirea pe rânduri", () => expect(attributionLines(ATTR_RO)).toEqual(["După o istorioară de Iosif Trifa", "Istorioara nr. 1 «Urechi mântuite»", "600 de istorioare religioase"]));
  it("conține atribuirea completă, escapată, și nu acceptă culori arbitrare", () => {
    const html = buildOutroHtml("ro", ATTR_RO, { brandName: "Istorioare <cu> tâlc", accent: "red;}</style><script>" });
    expect(html).toContain("După o istorioară de Iosif Trifa");
    expect(html).toContain("«Urechi mântuite»");
    expect(html).toContain("Istorioare &lt;cu&gt; tâlc");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("red;}");
    expect(html).toContain('"DUR":[4]');
    // aceleași trei scripturi ale motorului, ca în șablonul skill-ului
    expect(html).toMatch(/personaje-v2\.js[\s\S]*fundaluri-v2\.js[\s\S]*engine-v2\.js/);
  });
});

describe("parseCheck", () => {
  it("citește raportul build_v2 check", () => {
    const raw = "video 1080x1920 h264 yuv420p bt709 30 fps, audio aac 48000 Hz, durata 98.6 s\nintensitate -14.1 LUFS (țintă -14), vârf -1.6 dBFS\ntăceri peste 1.2 s în episod: niciuna\ncadre out/check_sheet.jpg";
    expect(parseCheck(raw, "s.jpg")).toMatchObject({ width: 1080, height: 1920, codec: "h264", colorSpace: "bt709", fps: 30, durationSec: 98.6, audio: "aac 48000 Hz", lufs: -14.1, peakDbfs: -1.6, silences: "niciuna" });
  });
  it("audio lipsă", () => expect(parseCheck("video 1080x1920 h264 yuv420p bt709 30 fps, audio LIPSEȘTE, durata 4.0 s", "s").audio).toBeNull());
});

// Test de randare reală: motorul v2 (Python + Playwright + Chromium + ffmpeg). Sărit dacă lipsesc uneltele.
const py = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
const toolsOk =
  spawnSync(py, ["-c", "import playwright, PIL, numpy"]).status === 0 && spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;

describe.skipIf(!toolsOk)("randare cu motorul v2 (integrare)", () => {
  it(
    "randează outro-ul la 1080×1920 H.264 și îl lipește după un episod",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "sf-render-"));
      const pipeline = join(dir, "pipeline");
      cpSync(resolve(root, "vendor/trifa-v2/motor/pipeline"), pipeline, { recursive: true });
      renameSync(join(pipeline, "build_v2.py.txt"), join(pipeline, "build_v2.py"));
      cpSync(resolve(root, "vendor/trifa-v2/motor/fonts"), join(dir, "fonts"), { recursive: true });

      const log = makeLogger({}, () => {});
      const provider = new TrifaV2Provider(spawnPython(py), log, { workers: 1 });
      const page = writeOutroPage(pipeline, "ro", ATTR_RO, { brandName: "Istorioare cu tâlc", durationSec: 2.5 });
      const outro = await provider.renderPage(page, join(dir, "out-outro"));

      const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", outro], { encoding: "utf8" }));
      const v = probe.streams.find((s: { codec_type: string }) => s.codec_type === "video");
      expect([v.width, v.height, v.codec_name, v.color_space]).toEqual([1080, 1920, "h264", "bt709"]);
      expect(await probeDuration(outro)).toBeCloseTo(2.5, 0);

      // „episod” = outro-ul însuși; verificăm lipirea fără audio
      const final = join(dir, "final.mp4");
      await appendOutro(outro, outro, final, false);
      expect(await probeDuration(final)).toBeCloseTo(5, 0);

      const report = await provider.check({ pipeline }, final, join(dir, "check"));
      expect(report).toMatchObject({ width: 1080, height: 1920, codec: "h264", audio: null });
      expect(readdirSync(join(dir, "check"))).toContain("check_sheet.jpg");
    },
    240_000,
  );
});
