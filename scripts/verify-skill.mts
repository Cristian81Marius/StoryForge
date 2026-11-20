/**
 * Verificări pe worker, înainte de prima rulare reală:
 *  1. SKILL.md e neschimbat față de copia furnizată (hash în .claude/skills/istorioare-episod-v2.sha256).
 *  2. `skills` din frontmatter preîncarcă skill-ul în `claude -p --agent` (agentul skill-probe, haiku/low).
 * Rulare: npm run skill:verify   (consumă foarte puțin din abonament: un apel haiku)
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { makeLogger } from "../packages/core/src";
import { runAgent, spawnClaude } from "../apps/worker/src/runner";

const root = resolve(import.meta.dirname, "..");
const VOICE_RO = "3f64ef99-d87b-4b51-b217-df7351f7886a";

const skill = readFileSync(resolve(root, ".claude/skills/istorioare-episod-v2/SKILL.md"));
const expected = readFileSync(resolve(root, ".claude/skills/istorioare-episod-v2.sha256"), "utf8").trim();
const actual = createHash("sha256").update(skill).digest("hex");
console.log(actual === expected ? "✓ SKILL.md neschimbat" : `✕ SKILL.md modificat! ${actual} ≠ ${expected}`);
if (actual !== expected) process.exitCode = 1;

if (!process.argv.includes("--hash-only")) {
  const log = makeLogger({ svc: "verify-skill" }, () => {});
  const out = await runAgent({
    agent: "skill-probe",
    prompt: "Verifică dacă skill-ul istorioare-episod-v2 e în contextul tău.",
    schema: z.object({ preloaded: z.boolean(), quote: z.string() }),
    cwd: root,
    exec: spawnClaude(),
    record: async (r) =>
      console.log(`  rulare: model=${r.model} tokens=${r.usage.inputTokens}/${r.usage.outputTokens} cost≈$${r.usage.costUsd.toFixed(4)} valid=${r.outputValid}`),
    log,
    timeoutMs: 5 * 60_000,
  });
  const preloaded = out.preloaded && out.quote.includes(VOICE_RO);
  console.log(
    preloaded
      ? "✓ `skills` din frontmatter funcționează în headless: skill-ul e preîncărcat."
      : "• `skills` din frontmatter NU preîncarcă skill-ul în `claude -p --agent` → se folosește invocarea explicită.",
  );

  const inv = await runAgent({
    agent: "skill-invoke-probe",
    prompt: "Invocă skill-ul și răspunde conform instrucțiunilor.",
    schema: z.object({ invoked: z.boolean(), quote: z.string() }),
    cwd: root,
    exec: spawnClaude(),
    record: async (r) => console.log(`  rulare: model=${r.model} cost≈$${r.usage.costUsd.toFixed(4)} valid=${r.outputValid}`),
    log,
    allowedTools: ["Skill"],
    timeoutMs: 5 * 60_000,
  });
  const invoked = inv.invoked && inv.quote.includes(VOICE_RO);
  console.log(invoked ? "✓ Invocarea explicită a skill-ului (tool-ul Skill) funcționează în headless." : `✕ Invocarea explicită a eșuat: ${JSON.stringify(inv)}`);
  if (!preloaded && !invoked) {
    console.log("✕ Agenții NU au acces la skill. Nu porni workerul în mod real până nu se rezolvă.");
    process.exitCode = 1;
  }
}
