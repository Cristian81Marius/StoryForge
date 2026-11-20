import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import {
  encryptSecret, decryptSecret, maskSecret, redact, makeLogger, renderAttribution, hasRequiredAttribution,
  extractAgentJson, validateAgentOutput, extractUsage, isUsageLimit, buildClaudeArgs, ProducerOutput,
} from "../src";

const KEY = randomBytes(32).toString("base64");

describe("crypto AES-GCM", () => {
  it("round-trip", () => {
    const enc = encryptSecret("sk_live_abcdef123456", KEY);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain("abcdef");
    expect(decryptSecret(enc, KEY)).toBe("sk_live_abcdef123456");
  });
  it("IV diferit la fiecare criptare", () => expect(encryptSecret("x", KEY)).not.toBe(encryptSecret("x", KEY)));
  it("detectează alterarea", () => {
    const [v, iv, tag, ct] = encryptSecret("secret", KEY).split(":");
    const bad = [v, iv, tag, Buffer.from("altceva").toString("base64")].join(":");
    expect(() => decryptSecret(bad, KEY)).toThrow();
  });
  it("cheie greșită", () => expect(() => decryptSecret(encryptSecret("s", KEY), randomBytes(32).toString("base64"))).toThrow());
  it("cheie de lungime greșită", () => expect(() => encryptSecret("s", Buffer.from("scurt").toString("base64"))).toThrow(/32/));
  it("mask", () => expect(maskSecret("abcdefgh1234")).toBe("••••1234"));
});

describe("redactare loguri", () => {
  it("chei și valori secrete", () => {
    const out = redact({ token: "abc", nested: { apiKey: "x", msg: "folosesc sk_live_1234567890abc și Bearer abcdefghijkl" } }) as any;
    expect(out.token).toBe("[REDACTED]");
    expect(out.nested.apiKey).toBe("[REDACTED]");
    expect(out.nested.msg).not.toContain("sk_live");
    expect(out.nested.msg).not.toContain("abcdefghijkl");
  });
  it("logger-ul nu scrie secrete", () => {
    const lines: string[] = [];
    const log = makeLogger({ jobId: "j1" }, (e) => lines.push(JSON.stringify(e)));
    log.info("apel", { authorization: "Bearer zzzzzzzzzzzz", ok: 1 });
    expect(lines[0]).not.toContain("zzzz");
    expect(lines[0]).toContain('"jobId":"j1"');
  });
});

describe("atribuire", () => {
  const ro = renderAttribution({ template: "După o istorioară de {author} · Istorioara nr. {number} «{title}» · {book}", author: "Iosif Trifa", number: 20, title: "Urechi mântuite", book: "600 de istorioare religioase" });
  it("render", () => expect(ro).toBe("După o istorioară de Iosif Trifa · Istorioara nr. 20 «Urechi mântuite» · 600 de istorioare religioase"));
  it("verificare", () => {
    expect(hasRequiredAttribution(ro, "ro", "Iosif Trifa", 20)).toBe(true);
    expect(hasRequiredAttribution(ro, "ro", "Iosif Trifa", 21)).toBe(false);
    expect(hasRequiredAttribution("Based on a story by Iosif Trifa, no. 20", "en", "Iosif Trifa", 20)).toBe(true);
  });
});

describe("output claude -p", () => {
  const sample = {
    type: "result", subtype: "success", is_error: false, result: "Gata.\n```json\n{\"a\":1}\n```", session_id: "s1",
    duration_ms: 1200, duration_api_ms: 900, num_turns: 3, total_cost_usd: 0.42,
    usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 2 },
    modelUsage: { "claude-opus-5-5": { inputTokens: 10, outputTokens: 20, costUSD: 0.42 } },
  };
  it("usage", () => {
    expect(extractUsage(sample)).toMatchObject({ inputTokens: 10, outputTokens: 20, cacheReadTokens: 5, cacheCreationTokens: 2, costUsd: 0.42, durationMs: 1200, numTurns: 3, sessionId: "s1", models: ["claude-opus-5-5"] });
  });
  it("structured_output are prioritate", () => expect(extractAgentJson({ ...sample, structured_output: { b: 2 } })).toEqual({ b: 2 }));
  it("ultimul bloc json din result", () => expect(extractAgentJson(sample)).toEqual({ a: 1 }));
  it("JSON fără fence", () => expect(extractAgentJson({ result: 'Rezultat: {"x": [1]} gata' })).toEqual({ x: [1] }));
  it("eroare clară fără JSON", () => expect(() => extractAgentJson({ result: "nimic" })).toThrow(/JSON/));
  it("validare Zod cu mesaje pe câmp", () => {
    const r = validateAgentOutput(ProducerOutput, { structured_output: { lang: "fr" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/lang/);
  });
  it("limita abonamentului", () => {
    expect(isUsageLimit({ is_error: true, result: "Claude AI usage limit reached|1763650800" })).toBe(true);
    expect(isUsageLimit({ is_error: true, result: "You've hit your Opus limit · resets 3pm" })).toBe(true);
    expect(isUsageLimit({ is_error: true, result: "Tool error" })).toBe(false);
  });
  it("argumente fără shell", () => {
    const a = buildClaudeArgs({ agent: "scenarist", prompt: "text; rm -rf /", jsonSchema: { type: "object" }, resumeSessionId: "s1", maxTurns: 40 });
    expect(a.slice(0, 6)).toEqual(["-p", "text; rm -rf /", "--output-format", "json", "--agent", "scenarist"]);
    expect(a).toContain("--json-schema");
    expect(a).toContain("--resume");
  });
});
