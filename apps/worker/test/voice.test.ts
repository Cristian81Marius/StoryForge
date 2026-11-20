import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pcmToWav, SpekoTTS, type SpekoLike } from "../src/tts/speko";
import { narrationText } from "../src/tts/types";
import { ManualUploadTTS, MissingUploadError } from "../src/tts/manual";
import { wordOverlap } from "../src/voice";
import { musicFilter } from "../src/music";

describe("text pentru narațiune", () => {
  it("scoate marcajul și liniuțele de dialog, păstrează pauzele", () => {
    expect(narrationText('<span class="d">— Ce înseamnă <em>grămada</em>?</span> ... a întrebat')).toBe("Ce înseamnă grămada ? ... a întrebat");
  });
});

describe("pcmToWav", () => {
  it("antet RIFF corect pentru PCM 16-bit 24 kHz mono", () => {
    const wav = pcmToWav(new Uint8Array(480), 24000);
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(8, 12).toString()).toBe("WAVE");
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(480);
    expect(wav.length).toBe(44 + 480);
  });
});

describe("SpekoTTS", () => {
  const calls: unknown[] = [];
  let balance = 10;
  const fake: SpekoLike = {
    async synthesize(text, o) {
      calls.push({ text, o });
      balance -= 0.01;
      return { audio: new Uint8Array(4800), contentType: "audio/pcm;rate=24000", provider: "cartesia", model: "sonic" };
    },
    credits: { getBalance: async () => ({ balanceUsd: balance }) },
  };

  it("apel ca în skill §5.2: limbă, optimizeFor accuracy, vocea, providerul TTS permis; WAV pe disc", async () => {
    const tts = new SpekoTTS(fake);
    const dir = mkdtempSync(join(tmpdir(), "sf-tts-"));
    const before = await tts.costCheckpoint();
    const r = await tts.synthesize("Bună ziua", "ro", { voice: "3f64ef99-d87b-4b51-b217-df7351f7886a", provider: "cartesia" }, join(dir, "s00.wav"));
    expect(calls[0]).toEqual({
      text: "Bună ziua",
      o: { language: "ro", optimizeFor: "accuracy", voice: "3f64ef99-d87b-4b51-b217-df7351f7886a", constraints: { allowedProviders: { tts: ["cartesia"] } } },
    });
    expect(readFileSync(r.wavPath).subarray(0, 4).toString()).toBe("RIFF");
    expect(await tts.costSince(before)).toBeCloseTo(0.01, 4);
  });

  it("fără voce/provider configurate: routerul alege", async () => {
    calls.length = 0;
    await new SpekoTTS(fake).synthesize("Hi", "en", {}, join(mkdtempSync(join(tmpdir(), "sf-tts-")), "s00.wav"));
    expect(calls[0]).toEqual({ text: "Hi", o: { language: "en", optimizeFor: "accuracy" } });
  });
});

describe("upload manual", () => {
  it("lipsa unui fișier dă o eroare clară cu scena", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sf-up-"));
    await expect(new ManualUploadTTS(() => dir).synthesize("x", "ro", {}, join(dir, "out", "s03.wav"))).rejects.toThrow(MissingUploadError);
  });
});

describe("verificarea pronunției", () => {
  it("fără diacritice și punctuație", () => expect(wordOverlap("Cică un sfânt profet, ajungând în rai", "cica un sfant profet ajungand in rai")).toBe(1));
  it("cuvinte lipsă scad scorul", () => expect(wordOverlap("unu doi trei patru", "unu doi")).toBe(0.5));
});

describe("muzica de fundal", () => {
  it("volum limitat, ducking sub voce, normalizare -14 LUFS", () => {
    const f = musicFilter(-60, 90);
    expect(f).toContain("volume=-40dB");
    expect(f).toContain("sidechaincompress");
    expect(f).toContain("loudnorm=I=-14");
    expect(f).toContain("afade=t=out:st=88.00");
  });
});
