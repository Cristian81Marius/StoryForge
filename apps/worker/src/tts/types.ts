/**
 * Vocea, ca interfață. Implementări: Speko (API documentat, SDK oficial) și upload manual
 * (fișiere WAV încărcate din UI, pe scenă). Alegerea: Book.ttsProvider.
 */
export interface VoiceSpec {
  /** id-ul vocii la provider (ex. Cartesia „Andrei”: 3f64ef99-…) */
  voice?: string | null;
  /** providerul TTS preferat în routerul Speko (ex. "cartesia") */
  provider?: string | null;
  name?: string;
}

export interface SynthResult {
  /** fișierul WAV scris (mono/stereo PCM 16-bit) */
  wavPath: string;
  provider: string;
  model: string;
}

export interface TTSProvider {
  readonly id: string;
  /** Sintetizează o replică și scrie WAV-ul la `dest`. */
  synthesize(text: string, lang: "ro" | "en", voice: VoiceSpec, dest: string): Promise<SynthResult>;
  /** Costul total (USD) de la ultimul apel `costCheckpoint`, dacă providerul îl expune. */
  costSince?(checkpoint: unknown): Promise<number | null>;
  costCheckpoint?(): Promise<unknown>;
  /** Test de conexiune pentru pagina Setări. */
  test?(): Promise<string>;
}

/**
 * Pregătirea textului pentru voce, după regulile skill-ului (§5.2): fără marcaj HTML,
 * „...” pentru pauze rămân, ghilimele și liniuțe de dialog curățate.
 */
export function narrationText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/^\s*[—–-]\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
