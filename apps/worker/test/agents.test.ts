import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseFrontmatter, loadAgentMeta } from "../src/agents";

const root = resolve(import.meta.dirname, "../../..");
const dir = resolve(root, ".claude/agents");
const files = readdirSync(dir).filter((f) => f.endsWith(".md"));

describe(".claude/agents", () => {
  it.each(files)("%s: are StructuredOutput în tools (altfel --json-schema nu produce structured_output)", (f) => {
    const fm = parseFrontmatter(readFileSync(resolve(dir, f), "utf8"));
    if (fm.tools === undefined) return; // fără allowlist moștenește toate tool-urile
    const tools = String(fm.tools).split(",").map((t) => t.trim());
    expect(tools).toContain("StructuredOutput");
  });

  it("modelele și effort-ul cerute", () => {
    expect(loadAgentMeta(root, "scenarist")).toMatchObject({ model: "opus", effort: "xhigh", skills: ["istorioare-episod-v2"] });
    expect(loadAgentMeta(root, "producer")).toMatchObject({ model: "sonnet", effort: "medium" });
    expect(loadAgentMeta(root, "social")).toMatchObject({ model: "sonnet", effort: "low" });
  });

  it.each(["scenarist", "producer", "social"])("%s: are tool-ul Skill și instrucțiunea de invocare explicită", (name) => {
    const md = readFileSync(resolve(dir, `${name}.md`), "utf8");
    expect(String(parseFrontmatter(md).tools)).toMatch(/\bSkill\b/);
    expect(md).toMatch(/invocă .*istorioare-episod-v2.* cu tool-ul Skill|invocă-l explicit cu tool-ul Skill/);
  });
});
