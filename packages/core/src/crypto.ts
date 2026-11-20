import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM pentru token-urile integrărilor. Cheia: STORYFORGE_ENC_KEY (32 de octeți, base64).
 * Format stocat: v1:<iv b64>:<tag b64>:<ciphertext b64>. Generare cheie:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
function key(raw = process.env.STORYFORGE_ENC_KEY): Buffer {
  if (!raw) throw new Error("STORYFORGE_ENC_KEY lipsește");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("STORYFORGE_ENC_KEY trebuie să aibă 32 de octeți (base64)");
  return k;
}

export function encryptSecret(plain: string, rawKey?: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(rawKey), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

export function decryptSecret(stored: string, rawKey?: string): string {
  const [v, iv, tag, ct] = stored.split(":");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("format de secret necunoscut");
  const d = createDecipheriv("aes-256-gcm", key(rawKey), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}

/** Pentru afișare în UI: doar ultimele 4 caractere. */
export function maskSecret(plain: string): string {
  return plain.length <= 4 ? "••••" : `••••${plain.slice(-4)}`;
}
