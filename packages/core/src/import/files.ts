/** Extragerea textului din fișierele încărcate (TXT, DOCX, PDF). Doar pe server. */
export type UploadKind = "txt" | "docx" | "pdf";

export function detectKind(filename: string, mime?: string): UploadKind | null {
  const f = filename.toLowerCase();
  if (f.endsWith(".txt") || mime === "text/plain") return "txt";
  if (f.endsWith(".docx") || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (f.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  return null;
}

export async function extractText(kind: UploadKind, data: Buffer): Promise<string> {
  switch (kind) {
    case "txt":
      return data.toString("utf8").replace(/^﻿/, "");
    case "docx": {
      const mammoth = await import("mammoth");
      // textul brut: fără imagini/ilustrații; notele de subsol Word nu sunt incluse de extractRawText
      const r = await mammoth.extractRawText({ buffer: data });
      return r.value;
    }
    case "pdf": {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(data));
      const { text } = await pdfText(pdf, { mergePages: true });
      return Array.isArray(text) ? text.join("\n") : text;
    }
  }
}
