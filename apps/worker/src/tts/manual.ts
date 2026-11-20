import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { SynthResult, TTSProvider } from "./types";

/**
 * Upload manual: WAV-urile pe scenă sunt încărcate din pagina poveștii în
 * work/ep-NNN/upload/<lang>/sNN.wav. Providerul doar le preia; dacă lipsesc, jobul eșuează cu
 * lista scenelor lipsă (vizibilă în UI), iar după încărcare se apasă „Reîncearcă”.
 */
export class ManualUploadTTS implements TTSProvider {
  readonly id = "manual";
  constructor(private readonly uploadDir: (lang: "ro" | "en") => string) {}

  async synthesize(_text: string, lang: "ro" | "en", _voice: unknown, dest: string): Promise<SynthResult> {
    const name = dest.replace(/\\/g, "/").split("/").pop()!;
    const src = `${this.uploadDir(lang)}/${name}`;
    if (!existsSync(src)) throw new MissingUploadError(lang, name);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    return { wavPath: dest, provider: "manual", model: "upload" };
  }
}

export class MissingUploadError extends Error {
  constructor(
    public readonly lang: string,
    public readonly file: string,
  ) {
    super(`lipsește ${lang}/${file}`);
  }
}
