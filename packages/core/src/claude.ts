import { z } from "zod";

/**
 * Contractul cu `claude -p --output-format json`.
 * Câmpurile urmează documentația (headless + SDK ResultMessage). Toate sunt opționale/tolerante,
 * pentru că structura exactă a CLI-ului se poate schimba; verificăm doar ce folosim.
 */
export const ClaudeResult = z
  .object({
    type: z.string().optional(),
    subtype: z.string().optional(),
    is_error: z.boolean().optional(),
    result: z.string().optional(),
    structured_output: z.unknown().optional(),
    session_id: z.string().optional(),
    duration_ms: z.number().optional(),
    duration_api_ms: z.number().optional(),
    num_turns: z.number().optional(),
    total_cost_usd: z.number().optional(),
    usage: z
      .object({
        input_tokens: z.number().optional(),
        output_tokens: z.number().optional(),
        cache_creation_input_tokens: z.number().optional(),
        cache_read_input_tokens: z.number().optional(),
      })
      .passthrough()
      .optional(),
    modelUsage: z.record(z.string(), z.unknown()).optional(),
    model_usage: z.record(z.string(), z.unknown()).optional(),
    api_error_status: z.number().nullable().optional(),
    errors: z.array(z.unknown()).optional(),
  })
  .passthrough();
export type ClaudeResult = z.infer<typeof ClaudeResult>;

export interface RunUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  durationMs: number;
  durationApiMs?: number;
  numTurns?: number;
  sessionId?: string;
  modelUsage?: Record<string, unknown>;
  /** Modelele efectiv folosite (cheile din modelUsage). */
  models: string[];
}

export function extractUsage(r: ClaudeResult): RunUsage {
  const mu = r.modelUsage ?? r.model_usage;
  return {
    inputTokens: r.usage?.input_tokens ?? 0,
    outputTokens: r.usage?.output_tokens ?? 0,
    cacheReadTokens: r.usage?.cache_read_input_tokens ?? 0,
    cacheCreationTokens: r.usage?.cache_creation_input_tokens ?? 0,
    costUsd: r.total_cost_usd ?? 0,
    durationMs: r.duration_ms ?? 0,
    durationApiMs: r.duration_api_ms,
    numTurns: r.num_turns,
    sessionId: r.session_id,
    modelUsage: mu,
    models: mu ? Object.keys(mu) : [],
  };
}

/** Limita abonamentului (5 h / săptămânală) — jobul se amână, nu eșuează. */
export function isUsageLimit(r: ClaudeResult | null, stderr = ""): boolean {
  const text = `${r?.result ?? ""} ${JSON.stringify(r?.errors ?? [])} ${stderr}`;
  return r?.api_error_status === 429 || /(usage limit|hit your .*limit|rate limit|limit will reset|resets at)/i.test(text);
}

/**
 * Obține obiectul JSON produs de agent: întâi `structured_output` (--json-schema),
 * altfel ultimul bloc ```json din `result`, altfel `result` întreg.
 */
export function extractAgentJson(r: ClaudeResult): unknown {
  if (r.structured_output !== undefined && r.structured_output !== null) return r.structured_output;
  const text = r.result ?? "";
  const fences = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)];
  const candidate = fences.length ? fences[fences.length - 1][1] : text;
  try {
    return JSON.parse(candidate.trim());
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error("Agentul nu a întors JSON");
  }
}

export type ValidateResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function validateAgentOutput<T>(schema: z.ZodType<T>, r: ClaudeResult): ValidateResult<T> {
  let raw: unknown;
  try {
    raw = extractAgentJson(r);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, error: formatZodError(parsed.error) };
}

export function formatZodError(err: z.ZodError): string {
  return err.issues
    .slice(0, 25)
    .map((i) => `${i.path.join(".") || "(rădăcină)"}: ${i.message}`)
    .join("\n");
}

export interface ClaudeArgsInput {
  agent: string;
  prompt: string;
  jsonSchema?: object;
  resumeSessionId?: string;
  allowedTools?: string[];
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "dontAsk" | "plan" | "auto";
  maxTurns?: number;
}

/** Argumentele CLI (fără shell — se trimit direct la spawn, deci fără injecție). */
export function buildClaudeArgs(i: ClaudeArgsInput): string[] {
  const args = ["-p", i.prompt, "--output-format", "json", "--agent", i.agent];
  if (i.jsonSchema) args.push("--json-schema", JSON.stringify(i.jsonSchema));
  if (i.resumeSessionId) args.push("--resume", i.resumeSessionId);
  if (i.allowedTools?.length) args.push("--allowedTools", i.allowedTools.join(","));
  if (i.permissionMode) args.push("--permission-mode", i.permissionMode);
  if (i.maxTurns) args.push("--max-turns", String(i.maxTurns));
  return args;
}
