/**
 * Prompturile trimise agenților. Instrucțiunile stabile (reguli, flux) stau în .claude/agents/*.md;
 * aici e doar contextul jobului. Datele mari (textul, versiunea anterioară) merg în fișierul
 * de input din directorul de lucru, nu în linia de comandă (limita de 32K caractere pe Windows).
 * Căile sunt relative la rădăcina repo-ului (directorul de lucru al lui `claude`).
 */
export function scenaristPrompt(p: { inputPath: string; workDir: string; storyNumber: number; hasFeedback: boolean }) {
  return [
    `Episod pentru istorioara nr. ${p.storyNumber}.`,
    `Input-ul jobului (textul sursă, metadatele, atribuirea${p.hasFeedback ? ", versiunea anterioară și feedback-ul de aplicat" : ""}) e în: ${p.inputPath}`,
    `Directorul episodului: ${p.workDir} (pipeline/ = motorul v2 + aici scrii paginile; fonts/; stil/ = README stil canal + voci.json).`,
    `Execută DOAR §1–§3 din skill-ul istorioare-episod-v2, conform instrucțiunilor tale de agent, apoi întoarce obiectul JSON conform schemei.`,
  ].join("\n");
}
