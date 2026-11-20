import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { transition, STORY_STATUSES, STAGES, STAGE_DEF, availableActions, TransitionError, type StoryStatus } from "../src/pipeline";

describe("state machine", () => {
  it("START: NEW → SCRIPT_DRAFT și pune în coadă script.draft", () => {
    const r = transition("NEW", { type: "START" });
    expect(r.next).toBe("SCRIPT_DRAFT");
    expect(r.jobs).toEqual([{ kind: "script.draft", stage: "SCRIPT", input: {} }]);
  });

  it("drumul fericit complet ajunge la PUBLISHED, cu randarea finală după voce", () => {
    let s: StoryStatus = "NEW";
    const visited: StoryStatus[] = [s];
    s = transition(s, { type: "START" }).next;
    visited.push(s);
    for (const stage of STAGES) {
      s = transition(s, { type: "DRAFT_READY", stage }).next;
      visited.push(s);
      s = transition(s, { type: "APPROVE" }, { currentVersionId: "v1" }).next;
      visited.push(s);
    }
    s = transition(s, { type: "PUBLISHED" }).next;
    visited.push(s);
    expect(visited).toEqual([
      "NEW", "SCRIPT_DRAFT", "SCRIPT_REVIEW", "VIDEO_DRAFT", "VIDEO_REVIEW", "VOICE_DRAFT", "VOICE_REVIEW",
      "FINAL_RENDER", "FINAL_REVIEW", "SOCIAL_DRAFT", "SOCIAL_REVIEW", "SCHEDULED", "PUBLISHED",
    ]);
    expect(visited.indexOf("VOICE_REVIEW")).toBeLessThan(visited.indexOf("FINAL_RENDER"));
  });

  it("APPROVE pornește jobul etapei următoare cu versiunea aprobată", () => {
    const r = transition("SCRIPT_REVIEW", { type: "APPROVE" }, { currentVersionId: "ver_1" });
    expect(r).toEqual({ next: "VIDEO_DRAFT", jobs: [{ kind: "video.draft", stage: "VIDEO", input: { approvedVersionId: "ver_1" } }] });
  });

  it("APPROVE pe SOCIAL_REVIEW → SCHEDULED + job social.schedule", () => {
    const r = transition("SOCIAL_REVIEW", { type: "APPROVE" }, { currentVersionId: "v9" });
    expect(r.next).toBe("SCHEDULED");
    expect(r.jobs[0].kind).toBe("social.schedule");
  });

  it.each(STAGES)("REQUEST_CHANGES în %s re-rulează aceeași etapă cu versiunea anterioară și feedback-ul", (stage) => {
    const r = transition(STAGE_DEF[stage].review, { type: "REQUEST_CHANGES", comment: "  mai scurt titlul  " }, { currentVersionId: "prev" });
    expect(r.next).toBe(STAGE_DEF[stage].working);
    expect(r.jobs).toEqual([{ kind: STAGE_DEF[stage].jobKind, stage, input: { previousVersionId: "prev", feedback: "mai scurt titlul" } }]);
  });

  it("REQUEST_CHANGES fără comentariu e refuzat", () => {
    expect(() => transition("SCRIPT_REVIEW", { type: "REQUEST_CHANGES", comment: "  " })).toThrow(TransitionError);
    expect(() => transition("SCRIPT_REVIEW", { type: "REQUEST_CHANGES", comment: "" })).toThrow(/obligatoriu/);
  });

  it("REJECT din orice review → REJECTED, fără joburi", () => {
    for (const s of STAGES) expect(transition(STAGE_DEF[s].review, { type: "REJECT" })).toEqual({ next: "REJECTED", jobs: [] });
  });

  it("acțiunile de review sunt refuzate în afara *_REVIEW", () => {
    const nonReview = STORY_STATUSES.filter((s) => !s.endsWith("_REVIEW"));
    for (const s of nonReview) {
      expect(() => transition(s, { type: "APPROVE" })).toThrow(TransitionError);
      expect(() => transition(s, { type: "REJECT" })).toThrow(TransitionError);
      expect(() => transition(s, { type: "REQUEST_CHANGES", comment: "abc" })).toThrow(TransitionError);
    }
  });

  it("DRAFT_READY doar din statusul de lucru al aceleiași etape", () => {
    expect(() => transition("SCRIPT_DRAFT", { type: "DRAFT_READY", stage: "VIDEO" })).toThrow();
    expect(() => transition("SCRIPT_REVIEW", { type: "DRAFT_READY", stage: "SCRIPT" })).toThrow();
    expect(() => transition("NEW", { type: "START" })).not.toThrow();
    expect(() => transition("SCRIPT_DRAFT", { type: "START" })).toThrow();
    expect(() => transition("SOCIAL_REVIEW", { type: "PUBLISHED" })).toThrow();
  });

  it("availableActions", () => {
    expect(availableActions("NEW")).toEqual(["START"]);
    expect(availableActions("VOICE_REVIEW")).toEqual(["APPROVE", "REQUEST_CHANGES", "REJECT"]);
    expect(availableActions("FINAL_RENDER")).toEqual([]);
    expect(availableActions("REJECTED")).toEqual([]);
  });

  it("enum-urile Prisma coincid cu cele din pipeline", () => {
    const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
    const block = (name: string) =>
      schema.match(new RegExp(`enum ${name} \\{([^}]*)\\}`))![1].split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//"));
    expect(block("StoryStatus")).toEqual([...STORY_STATUSES]);
    expect(block("Stage")).toEqual([...STAGES]);
  });
});
