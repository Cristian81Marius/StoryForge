import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Stage } from "./pipeline";
import type { Storyboard } from "./schemas/storyboard";
import type { ScenaristOutput, ProducerOutput, SocialOutput } from "./schemas/agents";
import { REQUIRED_ATTRIBUTION } from "./attribution";

/**
 * Date simulate pentru demo/teste (STORYFORGE_MOCK_AGENTS=1). Clar marcate [MOCK];
 * nu reproduc text din carte.
 */
const here = dirname(fileURLToPath(import.meta.url));
export function loadFixtureStoryboard(): Storyboard {
  return JSON.parse(readFileSync(resolve(here, "../../../fixtures/storyboard.sample.json"), "utf8"));
}

export function mockStoryboardFor(story: { number: number; title: string; sourceReference: string }, feedback?: string, version = 1): Storyboard {
  const sb = loadFixtureStoryboard();
  sb.source = { storyNumber: story.number, title: story.title, sourceReference: story.sourceReference };
  if (feedback) {
    sb.notes = [...sb.notes, `[MOCK v${version}] aplicat feedback: ${feedback}`];
    sb.hook = { ro: `${sb.hook.ro}`, en: sb.hook.en };
    sb.scenes[1] = { ...sb.scenes[1], durationSec: Math.max(5, sb.scenes[1].durationSec - 1) };
  }
  return sb;
}

export function mockScenarist(story: { number: number; title: string; sourceReference: string }, feedback?: string, version = 1): ScenaristOutput {
  return {
    storyboard: mockStoryboardFor(story, feedback, version),
    directionTable: "| scenă | fundal | personaje | cameră | tranziție | narațiune RO |\n|---|---|---|---|---|---|\n| s01 | sat-noapte | — | push | fade | [MOCK] |",
    changesFromPrevious: feedback ? [`[MOCK] ${feedback}`] : [],
    fidelityCheck: { moralPreserved: true, renamedCharacters: [], explanation: "[MOCK] morala păstrată" },
  };
}

export function mockProducer(lang: "ro" | "en"): ProducerOutput {
  return {
    lang,
    issues: [{ sceneId: "s04", kind: "character_small", description: "[MOCK] personaj sub 1.6", fixed: true }],
    changedScenes: ["s04"],
    readyForReview: true,
    notes: "[MOCK] QA pe preview_grid",
  };
}

export function mockSocial(author: string, number: number, title: string): SocialOutput {
  const platforms = ["tiktok", "instagram", "youtube", "facebook"] as const;
  const posts = (["ro", "en"] as const).flatMap((lang) =>
    platforms.map((platform) => ({
      lang,
      platform,
      title: lang === "ro" ? `${title} 🕯️ Pentru cine ții lumina?` : `The Lamp in the Window 🕯️`,
      description:
        (lang === "ro" ? "[MOCK] O poveste despre lumina dată altora. Pentru cine ții tu lumina aprinsă?\n" : "[MOCK] A story about the light we give.\n") +
        `${REQUIRED_ATTRIBUTION[lang](author)} · ${lang === "ro" ? "Istorioara nr." : "Story no."} ${number}`,
      hashtags: lang === "ro" ? ["#istorioare", "#pildecrestine", "#credinta"] : ["#christianstories", "#parable", "#faith"],
      cta: lang === "ro" ? "Scrie în comentarii" : "Tell us in the comments",
      aiGenerated: true as const,
      madeForKids: false,
      musicSearchTerms: ["soft piano"],
    })),
  );
  return { posts, postareMd: "# [MOCK] postare.md" };
}

/** Payload simulat pentru fiecare etapă (folosit de seed și de worker în mod mock). */
export function mockPayload(stage: Stage, story: { number: number; title: string; sourceReference: string }, author: string, feedback?: string, version = 1): unknown {
  switch (stage) {
    case "SCRIPT":
      return mockScenarist(story, feedback, version);
    case "VIDEO":
      return { qa: { ro: mockProducer("ro"), en: mockProducer("en") }, preview: { ro: "mock/preview_grid_ro.jpg", en: "mock/preview_grid_en.jpg" }, feedbackApplied: feedback ?? null };
    case "VOICE":
      return { voices: { ro: "cartesia:Andrei", en: "speko:pending" }, durations: [4.7, 6.4, 6.9, 6.2, 5.8, 7.9, 6.6, 4.4, 8.3], lufs: -14.1, feedbackApplied: feedback ?? null };
    case "FINAL":
      return { check: { resolution: "1080x1920", codec: "h264", colorspace: "bt709", lufs: -14.0, peakDbfs: -1.6, maxSilenceSec: 0.8 }, feedbackApplied: feedback ?? null };
    case "SOCIAL":
      return mockSocial(author, story.number, story.title);
  }
}
