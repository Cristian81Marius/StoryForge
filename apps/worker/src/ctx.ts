import type { Job, PrismaClient } from "@prisma/client";
import type { Logger } from "@storyforge/core";
import type { Exec, RunRecord } from "./runner";

export interface HandlerCtx {
  db: PrismaClient;
  job: Job;
  log: Logger;
  repoRoot: string;
  workDir: string;
  exec: Exec;
  /** Agenți simulați (demo/teste): fără apeluri Claude și fără randări. */
  mock: boolean;
  /** Înregistrează o rulare (Run) cu usage-ul ei. */
  record: (r: RunRecord) => Promise<void>;
}

export function makeRecorder(db: PrismaClient, jobId: string) {
  return async (r: RunRecord) => {
    await db.run.create({
      data: {
        jobId,
        agent: r.agent,
        model: r.model,
        effort: r.effort,
        attempt: r.attempt,
        inputTokens: r.usage.inputTokens,
        outputTokens: r.usage.outputTokens,
        cacheReadTokens: r.usage.cacheReadTokens,
        cacheCreationTokens: r.usage.cacheCreationTokens,
        costUsd: r.usage.costUsd,
        modelUsage: (r.usage.modelUsage ?? undefined) as object | undefined,
        durationMs: Math.round(r.usage.durationMs),
        durationApiMs: r.usage.durationApiMs ? Math.round(r.usage.durationApiMs) : null,
        numTurns: r.usage.numTurns ?? null,
        exitCode: r.exitCode,
        sessionId: r.usage.sessionId,
        outputValid: r.outputValid,
        error: r.error?.slice(0, 4000),
      },
    });
  };
}
