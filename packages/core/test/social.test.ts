import { describe, it, expect } from "vitest";
import { buildMetricoolInfo, ensureAttribution, nextPostSlot, zonedToUtc, utcToLocal, isoWeekday, postText, type SocialPost } from "../src";

const post: SocialPost = {
  lang: "ro",
  platform: "youtube",
  title: "Urechi mântuite 👂 Ești creștin doar cu urechile?",
  description: "Ce a văzut un proroc în Rai?\n\nDupă o istorioară de Iosif Trifa · Istorioara nr. 1 «Urechi mântuite»",
  hashtags: ["#istorioare", "#credinta", "#shorts"],
  cta: "Scrie în comentarii",
  aiGenerated: true,
  madeForKids: false,
  musicSearchTerms: [],
};

describe("postarea Metricool", () => {
  it("YouTube Short cu marcaj AI și made-for-kids", () => {
    const i = buildMetricoolInfo(post, { localDateTime: "2026-11-27T19:00:00", timezone: "Europe/Bucharest", videoUrl: "https://media.x/ep-001/001_RO.mp4" });
    expect(i.providers).toEqual([{ network: "youtube" }]);
    expect(i.publicationDate).toEqual({ dateTime: "2026-11-27T19:00:00", timezone: "Europe/Bucharest" });
    expect(i.youtubeData).toMatchObject({ type: "short", madeForKids: false, isAiGeneratedContent: true, tags: ["istorioare", "credinta", "shorts"] });
    expect(i.media).toEqual(["https://media.x/ep-001/001_RO.mp4"]);
    expect(i.text).toContain("Scrie în comentarii");
    expect(i.text).toContain("#istorioare");
  });
  it("TikTok isAigc, Instagram Reel isAiGenerated, Facebook Reel", () => {
    const base = { localDateTime: "2026-11-27T19:00:00", timezone: "Europe/Bucharest", videoUrl: "u" };
    expect(buildMetricoolInfo({ ...post, platform: "tiktok" }, base).tiktokData).toMatchObject({ isAigc: true });
    expect(buildMetricoolInfo({ ...post, platform: "instagram" }, base).instagramData).toEqual({ type: "REEL", showReelOnFeed: true, isAiGenerated: true });
    expect(buildMetricoolInfo({ ...post, platform: "facebook" }, base).facebookData).toMatchObject({ type: "REEL" });
  });
  it("hashtag-urile deja în descriere nu se dublează", () => {
    expect(postText({ ...post, description: "text #istorioare", hashtags: ["#istorioare", "#x"] }).match(/#istorioare/g)).toHaveLength(1);
  });
});

describe("atribuirea obligatorie", () => {
  const attr = "După o istorioară de Iosif Trifa · Istorioara nr. 1 «Urechi mântuite» · 600 de istorioare religioase";
  it("rămâne neschimbată dacă există", () => expect(ensureAttribution(post, attr, "Iosif Trifa", 1).added).toBe(false));
  it("se adaugă dacă lipsește", () => {
    const r = ensureAttribution({ ...post, description: "Fără sursă" }, attr, "Iosif Trifa", 1);
    expect(r.added).toBe(true);
    expect(r.post.description).toContain(attr);
  });
  it("EN", () => {
    const en = { ...post, lang: "en" as const, description: "Based on a story by Iosif Trifa · Story no. 1" };
    expect(ensureAttribution(en, "x", "Iosif Trifa", 1).added).toBe(false);
  });
});

describe("fusuri orare și sloturi", () => {
  it("ora României iarna (UTC+2) și vara (UTC+3)", () => {
    expect(zonedToUtc("2026-11-27T19:00", "Europe/Bucharest").toISOString()).toBe("2026-11-27T17:00:00.000Z");
    expect(zonedToUtc("2026-07-01T19:00", "Europe/Bucharest").toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(zonedToUtc("2026-11-27T19:00", "America/New_York").toISOString()).toBe("2026-11-28T00:00:00.000Z");
  });
  it("conversie inversă", () => expect(utcToLocal(new Date("2026-11-27T17:00:00Z"), "Europe/Bucharest")).toBe("2026-11-27T19:00:00"));
  it("ziua săptămânii în fusul canalului", () => expect(isoWeekday(new Date("2026-11-20T23:30:00Z"), "Europe/Bucharest")).toBe(6)); // sâmbătă 01:30
  it("următorul slot marți–joi la 19:00", () => {
    // vineri 20 nov 2026, 12:00 UTC → următoarea marți 24 nov 19:00 RO = 17:00 UTC
    const s = nextPostSlot(new Date("2026-11-20T12:00:00Z"), { postDays: [2, 3, 4], hour: "19:00", tz: "Europe/Bucharest" });
    expect(s.toISOString()).toBe("2026-11-24T17:00:00.000Z");
  });
  it("respectă avansul minim", () => {
    // marți 24 nov 16:30 UTC (18:30 RO), avans 2 h → miercuri 19:00
    const s = nextPostSlot(new Date("2026-11-24T16:30:00Z"), { postDays: [2, 3, 4], hour: "19:00", tz: "Europe/Bucharest" });
    expect(s.toISOString()).toBe("2026-11-25T17:00:00.000Z");
  });
});
