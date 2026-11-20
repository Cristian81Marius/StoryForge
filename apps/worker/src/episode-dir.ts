import { cpSync, existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { resolve, relative } from "node:path";

/**
 * Directorul de lucru al unui episod, cu structura cerută de skill (§0):
 *   work/ep-NNN/pipeline/  ← motorul v2 (build_v2.py.txt redenumit build_v2.py) + paginile episodului
 *   work/ep-NNN/fonts/     ← Lora, Lora-Italic, Cinzel
 *   work/ep-NNN/stil/      ← README stil canal + voci.json
 * Copiile din vendor/ rămân neatinse. Fișierele motorului se copiază doar dacă lipsesc,
 * ca re-rulările (feedback) să nu șteargă paginile deja scrise.
 */
export function prepareEpisodeDir(repoRoot: string, workDir: string, storyNumber: number) {
  const dir = resolve(workDir, `ep-${String(storyNumber).padStart(3, "0")}`);
  const vendor = resolve(repoRoot, "vendor/trifa-v2");
  const pipeline = resolve(dir, "pipeline");
  const fonts = resolve(dir, "fonts");
  const stil = resolve(dir, "stil");
  for (const d of [pipeline, fonts, stil]) mkdirSync(d, { recursive: true });

  for (const f of readdirSync(resolve(vendor, "motor/pipeline"))) {
    const target = resolve(pipeline, f === "build_v2.py.txt" ? "build_v2.py" : f);
    if (!existsSync(target)) {
      cpSync(resolve(vendor, "motor/pipeline", f), resolve(pipeline, f));
      if (f === "build_v2.py.txt") renameSync(resolve(pipeline, f), target);
    }
  }
  for (const f of readdirSync(resolve(vendor, "motor/fonts"))) {
    if (!existsSync(resolve(fonts, f))) cpSync(resolve(vendor, "motor/fonts", f), resolve(fonts, f));
  }
  if (!existsSync(resolve(stil, "README.md"))) cpSync(resolve(vendor, "stil-canal/project/README.md"), resolve(stil, "README.md"));
  if (!existsSync(resolve(stil, "voci.json"))) cpSync(resolve(vendor, "stil-canal/project/pipeline/voci.json"), resolve(stil, "voci.json"));

  return { dir, pipeline, fonts, stil, rel: (p: string) => relative(repoRoot, p).split("\\").join("/") };
}
