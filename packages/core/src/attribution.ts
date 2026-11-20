/**
 * Atribuirea obligatorie. Ambele forme apar: textul fix cerut ("După o istorioară de Iosif Trifa")
 * + numărul și titlul istorioarei. Textul propriu al skill-ului (cartela lui finală) rămâne și el.
 */
export interface AttributionInput {
  template: string; // Book.attributionRo / attributionEn
  author: string;
  number: number;
  title: string;
  book: string;
}

export function renderAttribution(a: AttributionInput): string {
  return a.template
    .replaceAll("{author}", a.author)
    .replaceAll("{number}", String(a.number))
    .replaceAll("{title}", a.title)
    .replaceAll("{book}", a.book);
}

/** Fraza minimă care TREBUIE să existe în descriere și pe cartela finală. */
export const REQUIRED_ATTRIBUTION = {
  ro: (author: string) => `După o istorioară de ${author}`,
  en: (author: string) => `Based on a story by ${author}`,
} as const;

export function hasRequiredAttribution(text: string, lang: "ro" | "en", author: string, number: number): boolean {
  return text.includes(REQUIRED_ATTRIBUTION[lang](author)) && new RegExp(`\\b${number}\\b`).test(text);
}
