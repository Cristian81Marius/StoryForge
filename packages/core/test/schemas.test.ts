import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Storyboard, ScenaristOutput, SocialOutput, SocialPost } from "../src";

const fixture = () => JSON.parse(readFileSync(new URL("../../../fixtures/storyboard.sample.json", import.meta.url), "utf8"));

describe("Storyboard", () => {
  it("fixture-ul e valid", () => {
    const r = Storyboard.safeParse(fixture());
    if (!r.success) console.error(r.error.issues);
    expect(r.success).toBe(true);
  });

  it("morala trebuie să fie o singură frază", () => {
    const sb = fixture();
    sb.moral.ro = "Prima frază. A doua frază.";
    const r = Storyboard.safeParse(sb);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/singură frază/);
  });

  it("refuză personaje necunoscute în scene", () => {
    const sb = fixture();
    sb.scenes[1].characters[0].ref = "fantoma";
    expect(Storyboard.safeParse(sb).success).toBe(false);
  });

  it("refuză camera repetată în scene consecutive", () => {
    const sb = fixture();
    sb.scenes[2].camera = sb.scenes[1].camera;
    const r = Storyboard.safeParse(sb);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/se repetă/);
  });

  it("refuză prea puține scene de poveste", () => {
    const sb = fixture();
    sb.scenes = [sb.scenes[0], sb.scenes[1], sb.scenes[6], sb.scenes[8]];
    expect(Storyboard.safeParse(sb).success).toBe(false);
  });

  it("refuză lipsa versiunii EN", () => {
    const sb = fixture();
    sb.scenes[3].narration.en = "";
    expect(Storyboard.safeParse(sb).success).toBe(false);
  });

  it("limita de cuvinte se aplică doar casetei scenelor narate, nu titlului/finalului (text SVG)", () => {
    const long = Array.from({ length: 38 }, (_, i) => `cuvânt${i}`).join(" ");
    const sb = fixture();
    sb.scenes[8].caption.ro = long; // final
    expect(Storyboard.safeParse(sb).success).toBe(true);
    sb.scenes[3].caption.ro = long; // poveste
    expect(Storyboard.safeParse(sb).success).toBe(false);
  });

  it("prima scenă e titlul, ultima finalul", () => {
    const sb = fixture();
    sb.scenes.reverse();
    expect(Storyboard.safeParse(sb).success).toBe(false);
  });
});

describe("ScenaristOutput", () => {
  it("cere confirmarea fidelității morale", () => {
    const base = { storyboard: fixture(), directionTable: "| s01 | … |", fidelityCheck: { moralPreserved: true, explanation: "ok" } };
    expect(ScenaristOutput.safeParse(base).success).toBe(true);
    expect(ScenaristOutput.safeParse({ ...base, fidelityCheck: { moralPreserved: false, explanation: "x" } }).success).toBe(false);
  });
});

describe("SocialPost", () => {
  const post = {
    lang: "ro", platform: "tiktok", title: "Lampa din fereastră", description: "După o istorioară de Iosif Trifa · nr. 999",
    hashtags: ["#istorioare", "#credinta"], cta: "Scrie-ne în comentarii", aiGenerated: true, madeForKids: false,
  };
  it("valid", () => expect(SocialPost.safeParse(post).success).toBe(true));
  it("marcajul AI e obligatoriu", () => expect(SocialPost.safeParse({ ...post, aiGenerated: false }).success).toBe(false));
  it("hashtag invalid", () => expect(SocialPost.safeParse({ ...post, hashtags: ["fara diez"] }).success).toBe(false));
  it("SocialOutput cere măcar o postare", () => expect(SocialOutput.safeParse({ posts: [], postareMd: "x" }).success).toBe(false));
});
