import { z } from "zod";
import { Storyboard, Lang, Bilingual } from "./storyboard";

/**
 * Output-urile agenților. Fiecare agent întoarce un JSON validat cu una dintre schemele de mai jos
 * (trimise și ca --json-schema la `claude -p`, apoi re-validate cu Zod de worker).
 */

/** scenarist — skill §1–§3 (+ §2 rescris la feedback). */
export const ScenaristOutput = z.object({
  storyboard: Storyboard,
  /** Tabelul de regie al skill-ului (markdown), păstrat literal pentru review. */
  directionTable: z.string().min(1),
  /** Ce s-a schimbat față de versiunea anterioară, ca răspuns la feedback. */
  changesFromPrevious: z.array(z.string()).default([]),
  /** Auto-verificarea regulii de fidelitate: morala autorului nu e denaturată. */
  fidelityCheck: z.object({
    moralPreserved: z.literal(true),
    renamedCharacters: z.array(z.object({ from: z.string(), to: z.string() })).default([]),
    explanation: z.string().min(1),
  }),
});
export type ScenaristOutput = z.infer<typeof ScenaristOutput>;

/** producer — skill §4: QA vizual pe preview_grid + reparații în paginile HTML. */
export const ProducerOutput = z.object({
  lang: Lang,
  issues: z.array(
    z.object({
      sceneId: z.string(),
      kind: z.enum(["text_cut", "empty_scene", "character_small", "character_cropped", "unsafe_zone", "timing", "other"]),
      description: z.string(),
      fixed: z.boolean(),
    }),
  ),
  /** Scene modificate în HTML (dacă e cazul). Textul narat NU se schimbă de producer. */
  changedScenes: z.array(z.string()).default([]),
  readyForReview: z.boolean(),
  notes: z.string().default(""),
});
export type ProducerOutput = z.infer<typeof ProducerOutput>;

export const PLATFORMS = ["tiktok", "instagram", "youtube", "facebook"] as const;
export const Platform = z.enum(PLATFORMS);
export type Platform = z.infer<typeof Platform>;

export const SocialPost = z.object({
  lang: Lang,
  platform: Platform,
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(2200),
  hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}_]+$/u)).min(1).max(8),
  cta: z.string().min(1),
  /** Marcaj „conținut generat/alterat cu AI” pe platformă. */
  aiGenerated: z.literal(true),
  madeForKids: z.boolean(),
  musicSearchTerms: z.array(z.string()).default([]),
  /** Ora propusă (ISO cu fus orar); ajustată de cron/calendar. */
  proposedAt: z.string().datetime({ offset: true }).optional(),
});
export type SocialPost = z.infer<typeof SocialPost>;

/** social — skill §6 (postare.md) convertit pe platformă × limbă. */
export const SocialOutput = z.object({
  posts: z.array(SocialPost).min(1),
  /** Sursa: conținutul postare.md produs de skill, păstrat literal. */
  postareMd: z.string().min(1),
});
export type SocialOutput = z.infer<typeof SocialOutput>;

export const AGENT_OUTPUTS = {
  scenarist: ScenaristOutput,
  producer: ProducerOutput,
  social: SocialOutput,
} as const;
export type AgentName = keyof typeof AGENT_OUTPUTS;

export { Bilingual };
