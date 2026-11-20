/**
 * Etapa de animație, ca interfață: motorul v2 al skill-ului e prima implementare.
 * Alt motor (Remotion, un conector extern de animații) implementează aceeași interfață și
 * consumă același storyboard; se alege per carte (Book.animationProvider).
 */
export type Lang = "ro" | "en";

export interface EpisodeRef {
  /** work/ep-NNN */
  dir: string;
  /** directorul cu paginile/sursele native ale providerului (motorul v2: work/ep-NNN/pipeline) */
  pipeline: string;
  storyNumber: number;
}

export interface CheckReport {
  width: number;
  height: number;
  codec: string;
  colorSpace: string;
  fps: number;
  durationSec: number;
  audio: string | null;
  lufs: number | null;
  peakDbfs: number | null;
  silences: string;
  sheet: string;
  raw: string;
}

export interface AnimationProvider {
  readonly id: string;
  /** Grilă cu cadre-cheie pentru QA rapid. Întoarce calea imaginii. */
  preview(ep: EpisodeRef, lang: Lang): Promise<string>;
  /** Video mic și rapid, fără voce, pentru aprobarea mișcării. Întoarce calea mp4. */
  draft(ep: EpisodeRef, lang: Lang): Promise<string>;
  /** Potrivește duratele după voce (faza 4). */
  fit(ep: EpisodeRef, lang: Lang, audioDir: string): Promise<string>;
  /** Randare finală 1080×1920; cu audioDir face și mixajul (voce + sunete, -14 LUFS). */
  renderFinal(ep: EpisodeRef, lang: Lang, dest: string, audioDir?: string): Promise<string>;
  cover(ep: EpisodeRef, lang: Lang, dest: string): Promise<string>;
  check(ep: { pipeline: string }, video: string, outDir: string): Promise<CheckReport>;
  /** Randare a unei pagini independente (ex. outro-ul), fără audio. */
  renderPage(pagePath: string, outDir: string): Promise<string>;
}
