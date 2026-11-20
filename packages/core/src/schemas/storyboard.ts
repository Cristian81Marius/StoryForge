import { z } from "zod";

/**
 * Storyboard-ul episodului — reprezentarea NEUTRĂ față de motorul de animație.
 *
 * Proveniență: scenaristul rulează skill-ul istorioare-episod-v2 (§1–§3), care produce
 * tabelul de regie + paginile HTML ale motorului v2. Storyboard-ul e extras din acel output
 * FĂRĂ a-l altera: textele (caseta, narațiunea) sunt copiate literal. Câmpurile specifice
 * motorului (comenzi `data-do`, camere, tranziții) sunt păstrate ca stringuri, nu ca enum-uri,
 * pentru că lista lor completă e în README-v2.md al motorului și se poate extinde.
 *
 * Pentru un alt provider de animație (Remotion, un conector extern), aceleași câmpuri
 * (descriere vizuală, personaje, narațiune, durată) sunt suficiente; `render` indică
 * fișierele native ale providerului care a produs episodul.
 */

export const Lang = z.enum(["ro", "en"]);
export type Lang = z.infer<typeof Lang>;

/** Text în ambele limbi. */
export const Bilingual = z.object({
  ro: z.string().trim().min(1),
  en: z.string().trim().min(1),
});
export type Bilingual = z.infer<typeof Bilingual>;

const oneSentence = (s: string) => {
  // o singură frază: cel mult un terminator de frază, la final
  const inner = s.trim().replace(/[.!?…]+["»”]?$/, "");
  return !/[.!?…]\s+\S/.test(inner);
};

export const SceneRole = z.enum(["title", "story", "lesson", "question", "final"]);

export const CharacterInScene = z.object({
  ref: z.string().min(1), // Character.id
  /** Comenzile motorului (`data-do`), ex. "walk", "talk", "pray", "bless", "look". */
  actions: z.array(z.string()).default([]),
  pose: z.string().optional(), // ex. "kneel"
  expression: z.string().optional(),
  scale: z.number().positive().optional(), // data-s
});

export const Scene = z.object({
  id: z.string().regex(/^s\d{2}$/, "id-ul scenei are forma s01, s02, …"),
  role: SceneRole,
  /** Fundalul din biblioteca motorului sau „custom: …”. */
  background: z.string().min(1),
  /** Descrierea vizuală neutră față de motor (ce se vede). */
  visual: z.string().min(1),
  characters: z.array(CharacterInScene).default([]),
  camera: z.string().min(1), // push, pan-r, pull, rise, push-strong …
  transition: z.string().min(1), // fade, dip, glow, wipe-* …
  ambience: z.string().optional(), // data-ambs
  sfx: z.array(z.string()).default([]),
  /** Textul din casetă (max ~25 cuvinte, cf. skill). */
  caption: Bilingual,
  narration: Bilingual,
  /** Durata planificată (DUR); se rescrie după voce de `fit`. */
  durationSec: z.number().min(1).max(20),
  /** Fraza continuă în scena următoare (data-cont="1"). */
  continues: z.boolean().default(false),
});
export type Scene = z.infer<typeof Scene>;

export const Character = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  /** Numele pot fi schimbate față de original (regulă de drepturi). */
  name: Bilingual,
  /** Descriere vizuală CONSECVENTĂ pe tot episodul (îmbrăcăminte, culori, vârstă). */
  visual: z.string().min(10),
  /** Tipul din biblioteca motorului (personaje-v2.js) sau opțiuni data-opt. */
  preset: z.string().optional(),
  originalName: z.string().optional(),
});

export const EPISODE_TYPES = {
  A: "parabolă cu acțiune",
  B: "comparație fără acțiune",
  C: "anecdotă istorică",
  D: "fabulă cu animale",
  E: "gând scurt",
} as const;

/** Limitele numărului de scene de POVESTE + ÎNVĂȚĂTURĂ (fără titlu/întrebare/final). */
export const SCENE_LIMITS = { min: 5, max: 12 } as const;

export const Storyboard = z
  .object({
    schemaVersion: z.literal(1),
    source: z.object({
      storyNumber: z.number().int().positive(),
      title: z.string().min(1),
      sourceReference: z.string().min(1),
    }),
    /** Skill-ul și providerul care au produs storyboard-ul (trasabilitate). */
    producedBy: z.object({
      skill: z.string().min(1),
      animationProvider: z.string().min(1),
    }),
    episodeType: z.enum(["A", "B", "C", "D", "E"]),
    title: Bilingual,
    /** Morala — o singură frază, fidelă învățăturii autorului. */
    moral: Bilingual.refine((b) => oneSentence(b.ro) && oneSentence(b.en), {
      message: "Morala trebuie să fie o singură frază (RO și EN)",
    }),
    /** Morala autorului, citată/parafrazată din textul sursă — pentru verificarea fidelității. */
    authorTeaching: z.string().min(1),
    targetAudience: Bilingual,
    summary: Bilingual,
    /** Narațiunea titlului — deschide curiozitatea (cârligul primelor 2 s). */
    hook: Bilingual,
    question: Bilingual,
    verse: z.object({
      reference: z.string().min(1),
      ro: z.string().min(1), // Cornilescu
      en: z.string().min(1), // KJV / WEB
      enTranslation: z.enum(["KJV", "WEB"]),
    }),
    characters: z.array(Character).min(1),
    scenes: z.array(Scene).min(3),
    /** Fișierele native ale providerului (ex. paginile HTML ale motorului v2), chei în storage. */
    render: z.object({
      provider: z.string().min(1),
      files: z.object({ ro: z.string().min(1), en: z.string().min(1) }),
    }),
    /** Note ale scenaristului: ce nume a schimbat, de ce etc. */
    notes: z.array(z.string()).default([]),
  })
  .superRefine((sb, ctx) => {
    const ids = new Set(sb.characters.map((c) => c.id));
    const sceneIds = new Set<string>();
    sb.scenes.forEach((s, i) => {
      if (sceneIds.has(s.id)) ctx.addIssue({ code: "custom", path: ["scenes", i, "id"], message: `scenă duplicată ${s.id}` });
      sceneIds.add(s.id);
      s.characters.forEach((c, j) => {
        if (!ids.has(c.ref))
          ctx.addIssue({ code: "custom", path: ["scenes", i, "characters", j, "ref"], message: `personaj necunoscut: ${c.ref}` });
      });
      const words = s.caption.ro.split(/\s+/).filter(Boolean).length;
      if (words > 30)
        ctx.addIssue({ code: "custom", path: ["scenes", i, "caption", "ro"], message: `caseta are ${words} cuvinte (max ~25)` });
    });
    if (sb.scenes[0]?.role !== "title")
      ctx.addIssue({ code: "custom", path: ["scenes", 0, "role"], message: "prima scenă trebuie să fie titlul" });
    if (sb.scenes.at(-1)?.role !== "final")
      ctx.addIssue({ code: "custom", path: ["scenes"], message: "ultima scenă trebuie să fie finalul (versetul + atribuirea)" });
    const core = sb.scenes.filter((s) => s.role === "story" || s.role === "lesson").length;
    if (core < SCENE_LIMITS.min || core > SCENE_LIMITS.max)
      ctx.addIssue({
        code: "custom",
        path: ["scenes"],
        message: `${core} scene de poveste/învățătură; permis ${SCENE_LIMITS.min}–${SCENE_LIMITS.max}`,
      });
    if (!sb.scenes.some((s) => s.role === "lesson"))
      ctx.addIssue({ code: "custom", path: ["scenes"], message: "lipsește scena cu învățătura" });
    // Camera nu se repetă în două scene consecutive (regulă de regie din skill).
    for (let i = 1; i < sb.scenes.length; i++) {
      if (sb.scenes[i].camera === sb.scenes[i - 1].camera)
        ctx.addIssue({
          code: "custom",
          path: ["scenes", i, "camera"],
          message: `camera „${sb.scenes[i].camera}” se repetă în ${sb.scenes[i - 1].id} și ${sb.scenes[i].id}`,
        });
    }
    // Atribuirea + verificarea motorului: zona de text a finalului e controlată de outro, nu aici.
    const total = sb.scenes.reduce((a, s) => a + s.durationSec, 0);
    if (total < 20 || total > 150)
      ctx.addIssue({ code: "custom", path: ["scenes"], message: `durata totală ${total.toFixed(1)} s e în afara 20–150 s` });
  });
export type Storyboard = z.infer<typeof Storyboard>;

export function storyboardDuration(sb: Pick<Storyboard, "scenes">): number {
  return sb.scenes.reduce((a, s) => a + s.durationSec, 0);
}
