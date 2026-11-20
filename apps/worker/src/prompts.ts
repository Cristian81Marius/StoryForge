/**
 * Prompturile trimise agenților. Instrucțiunile stabile (reguli, flux) stau în .claude/agents/*.md;
 * aici e doar contextul jobului. Datele mari (textul, versiunea anterioară) merg în fișierul
 * de input din directorul de lucru, nu în linia de comandă (limita de 32K caractere pe Windows).
 */
export function scenaristPrompt(p: { inputPath: string; workDir: string; storyNumber: number; hasFeedback: boolean }) {
  return [
    `Episod nou pentru istorioara nr. ${p.storyNumber}.`,
    `Input-ul jobului (textul sursă, metadatele, ${p.hasFeedback ? "versiunea anterioară și feedback-ul, " : ""}atribuirea) e în: ${p.inputPath}`,
    `Director de lucru: ${p.workDir} (motorul v2 e în vendor/trifa-v2/).`,
    `Execută DOAR secțiunile §1–§3 din skill-ul istorioare-episod-v2 (fără preview, voce, randare sau postare), conform instrucțiunilor tale de agent.`,
    `Întoarce un singur obiect JSON conform schemei.`,
  ].join("\n");
}
