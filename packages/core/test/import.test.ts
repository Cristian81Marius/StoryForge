import { describe, it, expect } from "vitest";
import { parseComoriIndex, parseComoriArticle, cacheKeyForSlug, splitStories, validateImport, cleanTitle, sourceReferenceFor, type ImportedStory } from "../src/import";

/** Pagină sintetică cu aceeași structură ca articolele comori-od (payload RSC împărțit în mai multe push-uri). */
function comoriPage(article: object) {
  const payload = `1b:["$","$L1c",null,{"article":${JSON.stringify(article)}}]\n`;
  const half = Math.floor(payload.length / 2);
  const push = (s: string) => `<script>self.__next_f.push([1,${JSON.stringify(s)}])</script>`;
  return `<html><head><title>x</title></head><body><p>meniu</p>${push(payload.slice(0, half))}${push(payload.slice(half))}</body></html>`;
}

describe("comori-od: cuprins", () => {
  const html = `
    <a href="/article/cuvant-inainte-la-editia-1-600-de-istorioare-pr-iosif-trifa">Cuvânt înainte</a>
    <a href="/article/2-albinele-si-fumul-600-de-istorioare-pr-iosif-trifa">2</a>
    <a href="/article/1-urechi-mantuite-600-de-istorioare-pr-iosif-trifa">1</a>
    <a href="/article/1-urechi-mantuite-600-de-istorioare-pr-iosif-trifa">1 dublură</a>
    <a href="/article/465-&lt;&lt;mancarea&gt;&gt;-unei-femei-evlavioase-600-de-istorioare-pr-iosif-trifa">465</a>
    <a href="/article/492-tribunalul-din-noi:-constiinta-600-de-istorioare-pr-iosif-trifa">492</a>
    <a href="/article/alt-articol-alt-autor">altceva</a>`;
  const idx = parseComoriIndex(html);
  it("doar istorioarele numerotate, fără prefețe și dubluri, în ordine", () => expect(idx.map((e) => e.number)).toEqual([1, 2, 465, 492]));
  it("slug-uri cu caractere speciale: decodate și codate în URL", () => {
    expect(idx[2].slug).toBe("465-<<mancarea>>-unei-femei-evlavioase-600-de-istorioare-pr-iosif-trifa");
    expect(idx[2].url).toContain("465-%3C%3Cmancarea%3E%3E");
    expect(idx[3].url).toContain("tribunalul-din-noi%3A-constiinta");
  });
  it("cheie de cache sigură pe Windows", () => expect(cacheKeyForSlug(idx[2].slug)).not.toMatch(/[<>:]/));
});

describe("comori-od: articol", () => {
  const article = {
    title: "1. Urechi mântuite...",
    author: "Pr. Iosif Trifa",
    tags: ["Urechile"],
    verses: [
      [{ type: "normal", style: [], text: "Prima frază a istorioarei." }],
      [
        { type: "normal", style: [], text: "Cele auzite trebuie să străpungă inima " },
        { type: "bible-ref", style: [], text: "(Fapte 2, 37)" },
        { type: "normal", style: [], text: " și să le păstrăm." },
      ],
      [{ type: "normal", style: [], text: "   " }],
      [{ type: "footnote", style: [], text: "Notă a editorului" }],
    ],
    "bible-refs": { "Fapte 2:37": { verses: [{ text: "TEXTUL VERSETULUI ADĂUGAT DE SITE" }] } },
    paragraphs: [{ text: "duplicat" }],
  };
  const s = parseComoriArticle(comoriPage(article), "https://comori-od.ro/article/1-x");
  it("număr și titlu curățat", () => {
    expect(s.number).toBe(1);
    expect(s.title).toBe("Urechi mântuite");
  });
  it("păstrează trimiterile autorului din text", () => expect(s.text).toContain("inima (Fapte 2, 37) și să le păstrăm."));
  it("NU include versetele adăugate de site, tag-urile sau segmente necunoscute", () => {
    expect(s.text).not.toContain("TEXTUL VERSETULUI");
    expect(s.text).not.toContain("Urechile");
    expect(s.text).not.toContain("Notă a editorului");
    expect(s.warnings.join()).toMatch(/footnote/);
  });
  it("paragrafe separate, fără rânduri goale", () => expect(s.text.split("\n\n")).toHaveLength(2));
  it("eroare clară dacă structura se schimbă", () => expect(() => parseComoriArticle("<html></html>")).toThrow(/article/));
});

describe("împărțirea textului (TXT/DOCX/PDF)", () => {
  const book = [
    "600 de istorioare religioase",
    "Cuvânt înainte",
    "Această carte cuprinde... (prefața nu se importă)",
    "",
    "1. Urechi mântuite...",
    "În țările răsăritului umblă o istorioară veche.",
    "Cică un sfânt profet a văzut urechi.",
    "",
    "2. Albinele și fumul",
    "Albinele fug de fum.",
    "1. Un rând numerotat din interior, care e o frază lungă și se termină cu punct.",
    "Tot istorioara 2.",
    "3. Mama",
    "Text trei.",
  ].join("\r\n");
  const { stories, preamble } = splitStories(book);
  it("găsește istorioarele și ignoră prefața", () => {
    expect(stories.map((s) => s.number)).toEqual([1, 2, 3]);
    expect(preamble).toContain("Cuvânt înainte");
    expect(stories[0].text).not.toContain("prefața");
  });
  it("un rând numerotat din text nu e luat drept titlu", () => {
    expect(stories[1].text).toContain("Un rând numerotat din interior");
    expect(stories[1].text).toContain("Tot istorioara 2.");
  });
  it("fișier parțial: primul titlu poate avea orice număr", () => {
    const r = splitStories("Prefață\n597. A\ntext a\n598. B\ntext b");
    expect(r.stories.map((s) => s.number)).toEqual([597, 598]);
  });
  it("titluri curățate", () => expect(stories.map((s) => s.title)).toEqual(["Urechi mântuite", "Albinele și fumul", "Mama"]));
});

describe("validare import", () => {
  const mk = (number: number, text = "x".repeat(300), title = `Titlu ${number}`): ImportedStory => ({ number, title, text, warnings: [], skip: false });
  it("raportează lipsă, duplicate, texte goale/scurte, prefețe și note", () => {
    const { items, report } = validateImport([mk(1), mk(2, "scurt"), mk(2), mk(4, ""), mk(5, "Text [1] cu notă"), mk(6, "x".repeat(300), "Cuvânt înainte")], 6);
    expect(report.missing).toEqual([3]);
    expect(report.duplicates).toEqual([2]);
    expect(report.blocking).toHaveLength(3);
    expect(items.find((s) => s.number === 4)!.warnings).toContain("text gol");
    expect(items.find((s) => s.text === "scurt")!.warnings.join()).toMatch(/scurt/);
    expect(items.find((s) => s.number === 5)!.warnings.join()).toMatch(/note de subsol/);
    expect(items.find((s) => s.number === 6)!.warnings.join()).toMatch(/prefață/);
  });
  it("import complet curat → nimic blocant", () => {
    const { report } = validateImport(Array.from({ length: 600 }, (_, i) => mk(i + 1)));
    expect(report).toMatchObject({ total: 600, missing: [], duplicates: [], blocking: [], withWarnings: 0 });
  });
  it("source_reference", () => expect(sourceReferenceFor({ number: 20, title: "Urechi mântuite" })).toBe("nr. 20 — Urechi mântuite"));
  it("cleanTitle", () => expect(cleanTitle(" 12)  Ce   e…  ")).toBe("Ce e"));
});
