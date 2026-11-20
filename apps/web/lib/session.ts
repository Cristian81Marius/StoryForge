import { SignJWT, jwtVerify } from "jose";

/** Sesiunea admin: JWT HS256 în cookie httpOnly. Compatibil cu middleware-ul (edge). */
export const SESSION_COOKIE = "sf_session";
export const SESSION_TTL_S = 60 * 60 * 24 * 7;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET lipsește sau e prea scurt (min. 32)");
  return new TextEncoder().encode(s);
}

export async function signSession(user: string) {
  return new SignJWT({ sub: user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_S}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
