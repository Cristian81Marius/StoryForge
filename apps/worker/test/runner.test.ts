import { describe, it, expect } from "vitest";
import { z } from "zod";
import { makeLogger } from "@storyforge/core";
import { runAgent, AgentOutputError, UsageLimitError, parseResetTime, type Exec, type RunRecord } from "../src/runner";
import { parseFrontmatter } from "../src/agents";

const Schema = z.object({ ok: z.literal(true), n: z.number() });
const silent = makeLogger({}, () => {});

function fakeExec(outputs: Array<Partial<Record<string, unknown>> | string>) {
  const calls: string[][] = [];
  const exec: Exec = async (args) => {
    calls.push(args);
    const o = outputs.shift();
    if (o === undefined) throw new Error("prea multe apeluri");
    return { stdout: typeof o === "string" ? o : JSON.stringify(o), stderr: "", exitCode: 0, timedOut: false };
  };
  return { exec, calls };
}

const result = (structured: unknown, extra: Record<string, unknown> = {}) => ({
  type: "result", subtype: "success", is_error: false, result: "", structured_output: structured, session_id: "sess-1",
  total_cost_usd: 0.1, duration_ms: 1000, usage: { input_tokens: 100, output_tokens: 50 }, modelUsage: { "claude-opus-5-5": {} }, ...extra,
});

function run(exec: Exec, records: RunRecord[]) {
  return runAgent({ agent: "scenarist", effort: "xhigh", prompt: "p", schema: Schema, cwd: "/", exec, record: async (r) => void records.push(r), log: silent });
}

describe("runAgent", () => {
  it("JSON valid din prima: o rulare, usage înregistrat", async () => {
    const recs: RunRecord[] = [];
    const { exec, calls } = fakeExec([result({ ok: true, n: 1 })]);
    await expect(run(exec, recs)).resolves.toEqual({ ok: true, n: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("--json-schema");
    expect(recs[0]).toMatchObject({ attempt: 1, outputValid: true, model: "claude-opus-5-5", effort: "xhigh", usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.1 } });
  });

  it("JSON invalid → o singură reîncercare în aceeași sesiune, cu erorile", async () => {
    const recs: RunRecord[] = [];
    const { exec, calls } = fakeExec([result({ ok: true, n: "x" }), result({ ok: true, n: 2 })]);
    await expect(run(exec, recs)).resolves.toEqual({ ok: true, n: 2 });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("--resume");
    expect(calls[1][calls[1].indexOf("--resume") + 1]).toBe("sess-1");
    expect(calls[1][1]).toMatch(/n:/);
    expect(recs.map((r) => r.outputValid)).toEqual([false, true]);
  });

  it("JSON invalid de două ori → AgentOutputError, fără a treia încercare", async () => {
    const recs: RunRecord[] = [];
    const { exec, calls } = fakeExec([result({ bad: 1 }), result({ bad: 2 })]);
    await expect(run(exec, recs)).rejects.toThrow(AgentOutputError);
    expect(calls).toHaveLength(2);
    expect(recs).toHaveLength(2);
  });

  it("ieșire ne-JSON → eșec, fără reîncercare", async () => {
    const recs: RunRecord[] = [];
    const { exec, calls } = fakeExec(["Segmentation fault"]);
    await expect(run(exec, recs)).rejects.toThrow(/ne-JSON/);
    expect(calls).toHaveLength(1);
  });

  it("limita abonamentului → UsageLimitError (jobul se amână)", async () => {
    const recs: RunRecord[] = [];
    const { exec } = fakeExec([{ type: "result", is_error: true, result: "Claude AI usage limit reached|1763650800" }]);
    const err = await run(exec, recs).catch((e) => e);
    expect(err).toBeInstanceOf(UsageLimitError);
    expect((err as UsageLimitError).retryAt.getTime()).toBe(1763650800 * 1000);
    expect(recs[0].error).toBe("usage_limit");
  });

  it("parseResetTime implicit +30 min", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    expect(parseResetTime("ceva", now).toISOString()).toBe("2026-11-20T10:30:00.000Z");
  });
});

describe("frontmatter agenți", () => {
  it("model, effort, skills (listă)", () => {
    const fm = parseFrontmatter("---\nname: scenarist\nmodel: opus\neffort: xhigh\nskills:\n  - istorioare-episod-v2\n---\ncorp");
    expect(fm).toEqual({ name: "scenarist", model: "opus", effort: "xhigh", skills: ["istorioare-episod-v2"] });
  });
});
