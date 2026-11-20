import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

/** Hash scrypt: "scrypt:<salt hex>:<hash hex>". Fără `$`, ca să nu fie stricat de dotenv-expand. */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string | undefined): boolean {
  if (!stored) return false;
  const [alg, saltHex, hashHex] = stored.split(":");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(plain, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}
