import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Citește model/effort din frontmatter-ul .claude/agents/<nume>.md (pentru înregistrarea pe Run). */
export interface AgentMeta {
  name: string;
  model?: string;
  effort?: string;
  skills: string[];
}

export function parseFrontmatter(md: string): Record<string, string | string[]> {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out: Record<string, string | string[]> = {};
  let listKey: string | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      (out[listKey] as string[]).push(item[1].trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, k, v] = kv;
    if (v === "") {
      out[k] = [];
      listKey = k;
    } else {
      listKey = null;
      out[k] = v.trim().replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

export function loadAgentMeta(repoRoot: string, name: string): AgentMeta {
  const fm = parseFrontmatter(readFileSync(resolve(repoRoot, ".claude/agents", `${name}.md`), "utf8"));
  const skills = fm.skills;
  return {
    name,
    model: typeof fm.model === "string" ? fm.model : undefined,
    effort: typeof fm.effort === "string" ? fm.effort : undefined,
    skills: Array.isArray(skills) ? skills : typeof skills === "string" ? skills.split(",").map((s) => s.trim()) : [],
  };
}
