import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SynthResult, TTSProvider, VoiceSpec } from "./types";

/** Subsetul SDK-ului @spekoai/sdk pe care îl folosim (injectabil în teste). */
export interface SpekoLike {
  synthesize(
    text: string,
    o: { language: string; optimizeFor?: "accuracy" | "latency" | "balanced"; voice?: string; constraints?: { allowedProviders?: { tts?: string[] } } },
  ): Promise<{ audio: Uint8Array; contentType: string; provider: string; model: string }>;
  credits: { getBalance(): Promise<{ balanceUsd: number }> };
}

export async function makeSpekoClient(apiKey: string): Promise<SpekoLike> {
  const { Speko } = await import("@spekoai/sdk");
  return new Speko({ apiKey, baseURL: process.env.SPEKO_BASE_URL || undefined }) as unknown as SpekoLike;
}

/** Antet WAV pentru PCM 16-bit little-endian. */
export function pcmToWav(pcm: Uint8Array, sampleRate: number, channels = 1): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * channels * 2, 28);
  h.writeUInt16LE(channels * 2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, Buffer.from(pcm)]);
}

function ffmpegToWav(input: string, dest: string): Promise<void> {
  return new Promise((res, rej) => {
    const c = spawn("ffmpeg", ["-y", "-loglevel", "error", "-i", input, "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", dest], { windowsHide: true });
    let err = "";
    c.stderr.on("data", (d) => (err += d));
    c.on("error", rej);
    c.on("close", (code) => (code === 0 ? res() : rej(new Error(`conversie audio eșuată: ${err.slice(-300)}`))));
  });
}

/**
 * Speko: un apel `synthesize` pe scenă, ca în skill (§5.2):
 * {intent: {language, optimizeFor: "accuracy"}, voice, constraints.allowedProviders.tts = [provider]}.
 * Răspunsul e MP3 (ElevenLabs), PCM brut (Cartesia: audio/pcm;rate=24000) sau WAV; îl normalizăm la WAV.
 */
export class SpekoTTS implements TTSProvider {
  readonly id = "speko";
  constructor(private readonly client: SpekoLike) {}

  async synthesize(text: string, lang: "ro" | "en", voice: VoiceSpec, dest: string): Promise<SynthResult> {
    const r = await this.client.synthesize(text, {
      language: lang,
      optimizeFor: "accuracy",
      ...(voice.voice ? { voice: voice.voice } : {}),
      ...(voice.provider ? { constraints: { allowedProviders: { tts: [voice.provider] } } } : {}),
    });
    mkdirSync(dirname(dest), { recursive: true });
    const ct = r.contentType.toLowerCase();
    const pcm = ct.match(/audio\/(?:pcm|l16)(?:;.*rate=(\d+))?/);
    if (pcm) {
      writeFileSync(dest, pcmToWav(r.audio, Number(pcm[1] ?? 24000)));
    } else if (ct.includes("wav")) {
      writeFileSync(dest, r.audio);
    } else {
      const tmp = `${dest}.${ct.includes("mpeg") ? "mp3" : ct.includes("ogg") ? "ogg" : "bin"}`;
      writeFileSync(tmp, r.audio);
      await ffmpegToWav(tmp, dest);
    }
    return { wavPath: dest, provider: r.provider, model: r.model };
  }

  async costCheckpoint() {
    return (await this.client.credits.getBalance()).balanceUsd;
  }
  async costSince(before: unknown) {
    if (typeof before !== "number") return null;
    const after = (await this.client.credits.getBalance()).balanceUsd;
    return Math.max(0, Math.round((before - after) * 10000) / 10000);
  }
  async test() {
    const b = await this.client.credits.getBalance();
    return `conectat; credit disponibil $${b.balanceUsd.toFixed(2)}`;
  }
}
