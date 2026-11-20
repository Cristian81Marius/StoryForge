/**
 * State machine-ul pipeline-ului. Pur (fără DB): primește statusul curent și un eveniment,
 * întoarce statusul următor și joburile care trebuie puse în coadă.
 *
 * Ordinea urmează skill-ul istorioare-episod-v2: randarea finală vine DUPĂ voce,
 * pentru că `build_v2.py fit` rescrie duratele scenelor după narațiune.
 */

export const STORY_STATUSES = [
  "NEW",
  "SCRIPT_DRAFT",
  "SCRIPT_REVIEW",
  "VIDEO_DRAFT",
  "VIDEO_REVIEW",
  "VOICE_DRAFT",
  "VOICE_REVIEW",
  "FINAL_RENDER",
  "FINAL_REVIEW",
  "SOCIAL_DRAFT",
  "SOCIAL_REVIEW",
  "SCHEDULED",
  "PUBLISHED",
  "REJECTED",
] as const;
export type StoryStatus = (typeof STORY_STATUSES)[number];

export const STAGES = ["SCRIPT", "VIDEO", "VOICE", "FINAL", "SOCIAL"] as const;
export type Stage = (typeof STAGES)[number];

/** Pentru fiecare etapă: statusul de lucru, statusul de review, jobul care produce versiunea. */
export const STAGE_DEF: Record<Stage, { working: StoryStatus; review: StoryStatus; jobKind: string; label: string }> = {
  SCRIPT: { working: "SCRIPT_DRAFT", review: "SCRIPT_REVIEW", jobKind: "script.draft", label: "Scenariu" },
  VIDEO: { working: "VIDEO_DRAFT", review: "VIDEO_REVIEW", jobKind: "video.draft", label: "Video (draft)" },
  VOICE: { working: "VOICE_DRAFT", review: "VOICE_REVIEW", jobKind: "voice.draft", label: "Voce" },
  FINAL: { working: "FINAL_RENDER", review: "FINAL_REVIEW", jobKind: "final.render", label: "Video final" },
  SOCIAL: { working: "SOCIAL_DRAFT", review: "SOCIAL_REVIEW", jobKind: "social.draft", label: "Social" },
};

const STAGE_ORDER: Stage[] = [...STAGES];

export type PipelineEvent =
  | { type: "START" } // NEW → SCRIPT_DRAFT (cron săptămânal sau manual)
  | { type: "DRAFT_READY"; stage: Stage } // workerul a produs o versiune validă
  | { type: "APPROVE" }
  | { type: "REQUEST_CHANGES"; comment: string }
  | { type: "REJECT"; comment?: string }
  | { type: "PUBLISHED" };

export interface JobRequest {
  kind: string;
  stage: Stage | null;
  input: Record<string, unknown>;
}

export interface TransitionResult {
  next: StoryStatus;
  jobs: JobRequest[];
}

export class TransitionError extends Error {
  constructor(
    message: string,
    public readonly from: StoryStatus,
    public readonly event: PipelineEvent["type"],
  ) {
    super(message);
    this.name = "TransitionError";
  }
}

export function stageOfStatus(status: StoryStatus): Stage | null {
  for (const s of STAGES) {
    if (STAGE_DEF[s].working === status || STAGE_DEF[s].review === status) return s;
  }
  return null;
}

export function isReview(status: StoryStatus): boolean {
  return STAGES.some((s) => STAGE_DEF[s].review === status);
}

export function isWorking(status: StoryStatus): boolean {
  return STAGES.some((s) => STAGE_DEF[s].working === status);
}

function startStage(stage: Stage, input: Record<string, unknown> = {}): TransitionResult {
  const def = STAGE_DEF[stage];
  return { next: def.working, jobs: [{ kind: def.jobKind, stage, input }] };
}

export interface TransitionContext {
  /** Versiunea curentă (cea care se decide) — se transmite jobului de re-rulare. */
  currentVersionId?: string;
}

export function transition(from: StoryStatus, event: PipelineEvent, ctx: TransitionContext = {}): TransitionResult {
  const fail = (msg: string): never => {
    throw new TransitionError(msg, from, event.type);
  };

  switch (event.type) {
    case "START":
      if (from !== "NEW") fail(`START e permis doar din NEW (status curent: ${from})`);
      return startStage("SCRIPT");

    case "DRAFT_READY": {
      const def = STAGE_DEF[event.stage];
      if (from !== def.working) fail(`DRAFT_READY(${event.stage}) cere statusul ${def.working}, nu ${from}`);
      return { next: def.review, jobs: [] };
    }

    case "APPROVE": {
      const stage = stageOfStatus(from);
      if (!stage || !isReview(from)) fail(`Aprobarea e posibilă doar într-un *_REVIEW (status curent: ${from})`);
      const idx = STAGE_ORDER.indexOf(stage!);
      if (stage === "SOCIAL") {
        // Aprobarea kitului social pornește programarea în Metricool.
        // Dacă programarea eșuează, jobul apare ca eșuat în UI și poate fi reluat;
        // rândurile Schedule rămân FAILED/MANUAL.
        return {
          next: "SCHEDULED",
          jobs: [{ kind: "social.schedule", stage: "SOCIAL", input: { versionId: ctx.currentVersionId } }],
        };
      }
      return startStage(STAGE_ORDER[idx + 1], { approvedVersionId: ctx.currentVersionId });
    }

    case "REQUEST_CHANGES": {
      const stage = stageOfStatus(from);
      if (!stage || !isReview(from)) fail(`„Cere modificări” e posibil doar într-un *_REVIEW (status curent: ${from})`);
      const comment = event.comment?.trim() ?? "";
      if (comment.length < 3) fail("Comentariul e obligatoriu la „Cere modificări”");
      return startStage(stage!, { previousVersionId: ctx.currentVersionId, feedback: comment });
    }

    case "REJECT":
      if (!isReview(from)) fail(`Respingerea e posibilă doar într-un *_REVIEW (status curent: ${from})`);
      return { next: "REJECTED", jobs: [] };

    case "PUBLISHED":
      if (from !== "SCHEDULED") fail(`PUBLISHED cere SCHEDULED, nu ${from}`);
      return { next: "PUBLISHED", jobs: [] };
  }
}

/** Acțiunile disponibile în UI pentru un status. */
export function availableActions(status: StoryStatus): Array<"APPROVE" | "REQUEST_CHANGES" | "REJECT" | "START"> {
  if (status === "NEW") return ["START"];
  if (isReview(status)) return ["APPROVE", "REQUEST_CHANGES", "REJECT"];
  return [];
}

export const STATUS_LABEL: Record<StoryStatus, string> = {
  NEW: "În coadă",
  SCRIPT_DRAFT: "Scenariu în lucru",
  SCRIPT_REVIEW: "Scenariu — de aprobat",
  VIDEO_DRAFT: "Video draft în lucru",
  VIDEO_REVIEW: "Video draft — de aprobat",
  VOICE_DRAFT: "Voce în lucru",
  VOICE_REVIEW: "Voce — de aprobat",
  FINAL_RENDER: "Randare finală",
  FINAL_REVIEW: "Video final — de aprobat",
  SOCIAL_DRAFT: "Kit social în lucru",
  SOCIAL_REVIEW: "Kit social — de aprobat",
  SCHEDULED: "Programat",
  PUBLISHED: "Publicat",
  REJECTED: "Respins",
};
