import { spawn } from "node:child_process";
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  ClaudeResult,
  buildClaudeArgs,
  extractUsage,
  isUsageLimit,
  validateAgentOutput,
  type Logger,
  type RunUsage,
} from "@storyforge/core";

/** Rezultatul brut al unui proces `claude`. */
export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}
export type Exec = (args: string[], opts: { cwd: string; timeoutMs: number }) => Promise<ExecResult>;

/** Spawn fără shell (argumentele nu trec prin interpretor → fără injecție). */
export const spawnClaude =
  (bin = process.env.CLAUDE_BIN || "claude"): Exec =>
  (args, { cwd, timeoutMs }) =>
    new Promise((resolve, reject) => {
      const child = spawn(bin, args, { cwd, shell: false, windowsHide: true, env: process.env });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const t = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", (e) => {
        clearTimeout(t);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(t);
        resolve({ stdout, stderr, exitCode: code, timedOut });
      });
    });

export class UsageLimitError extends Error {
  constructor(public readonly retryAt: Date) {
    super(`Limita abonamentului Claude atinsă; reluare după ${retryAt.toISOString()}`);
    this.name = "UsageLimitError";
  }
}
export class AgentOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentOutputError";
  }
}

export interface RunRecord {
  agent: string;
  model?: string;
  effort?: string;
  attempt: number;
  usage: RunUsage;
  exitCode: number | null;
  outputValid: boolean;
  error?: string;
}

export interface RunAgentInput<T> {
  agent: string;
  model?: string;
  effort?: string;
  prompt: string;
  schema: z.ZodType<T>;
  cwd: string;
  exec: Exec;
  record: (r: RunRecord) => Promise<void>;
  log: Logger;
  timeoutMs?: number;
  allowedTools?: string[];
  /** Trimite schema și ca --json-schema (structured output). */
  useJsonSchema?: boolean;
  now?: () => Date;
}

/** „resets 3pm”, „reset at 15:00”, sau timestamp unix după `|`. Implicit: +30 min. */
export function parseResetTime(text: string, now: Date): Date {
  const unix = text.match(/limit reached\|(\d{10})/i);
  if (unix) return new Date(Number(unix[1]) * 1000);
  return new Date(now.getTime() + 30 * 60_000);
}

/**
 * Rulează un agent headless. La JSON invalid: O SINGURĂ reîncercare (în aceeași sesiune,
 * cu erorile de validare), apoi AgentOutputError → jobul e marcat FAILED.
 */
export async function runAgent<T>(i: RunAgentInput<T>): Promise<T> {
  const now = i.now ?? (() => new Date());
  const jsonSchema = i.useJsonSchema === false ? undefined : zodToJsonSchema(i.schema, { target: "jsonSchema7", $refStrategy: "none" });
  let sessionId: string | undefined;
  let prompt = i.prompt;
  let lastError = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const args = buildClaudeArgs({
      agent: i.agent,
      prompt,
      jsonSchema: jsonSchema as object | undefined,
      resumeSessionId: sessionId,
      allowedTools: i.allowedTools,
    });
    i.log.info("claude.start", { agent: i.agent, attempt });
    const res = await i.exec(args, { cwd: i.cwd, timeoutMs: i.timeoutMs ?? 30 * 60_000 });

    let parsed: ClaudeResult | null = null;
    try {
      parsed = ClaudeResult.parse(JSON.parse(res.stdout));
    } catch {
      parsed = null;
    }
    const usage = parsed ? extractUsage(parsed) : extractUsage({});
    const model = usage.models[0] ?? i.model;

    if (isUsageLimit(parsed, res.stderr)) {
      await i.record({ agent: i.agent, model, effort: i.effort, attempt, usage, exitCode: res.exitCode, outputValid: false, error: "usage_limit" });
      throw new UsageLimitError(parseResetTime(`${parsed?.result ?? ""} ${res.stderr}`, now()));
    }

    if (res.timedOut || !parsed || parsed.is_error) {
      const err = res.timedOut ? "timeout" : !parsed ? `ieșire ne-JSON (exit ${res.exitCode}): ${res.stderr.slice(0, 500)}` : `eroare agent: ${parsed.subtype ?? ""} ${(parsed.result ?? "").slice(0, 500)}`;
      await i.record({ agent: i.agent, model, effort: i.effort, attempt, usage, exitCode: res.exitCode, outputValid: false, error: err });
      // eroarea de proces/agent nu e „JSON invalid” — nu o reîncercăm automat
      throw new AgentOutputError(err);
    }

    const v = validateAgentOutput(i.schema, parsed);
    await i.record({ agent: i.agent, model, effort: i.effort, attempt, usage, exitCode: res.exitCode, outputValid: v.ok, error: v.ok ? undefined : v.error });
    if (v.ok) {
      i.log.info("claude.ok", { agent: i.agent, attempt, costUsd: usage.costUsd, durationMs: usage.durationMs });
      return v.data;
    }
    lastError = v.error;
    i.log.warn("claude.invalid_output", { agent: i.agent, attempt, error: v.error });
    sessionId = usage.sessionId;
    prompt =
      "Output-ul tău anterior NU a trecut validarea schemei. Erori:\n" +
      v.error +
      "\n\nCorectează DOAR structura JSON (nu schimba conținutul generat de skill) și întoarce obiectul JSON complet, valid.";
  }
  throw new AgentOutputError(`Output JSON invalid după 2 încercări:\n${lastError}`);
}
