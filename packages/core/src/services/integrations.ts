import type { IntegrationStatus, IntegrationType, Prisma, PrismaClient } from "@prisma/client";
import { decryptSecret, encryptSecret, maskSecret } from "../crypto";

/**
 * Integrările folosesc DOAR token-uri API, criptate AES-256-GCM în DB (cheia: STORYFORGE_ENC_KEY).
 * Token-ul nu se mai afișează după salvare (doar ultimele 4 caractere). Nicio parolă de cont
 * nu se cere sau stochează; conectarea rețelelor sociale se face în Metricool, de utilizator.
 */
export const INTEGRATIONS: Record<IntegrationType, { label: string; tokenLabel: string; help: string }> = {
  SPEKO: { label: "Speko (voce)", tokenLabel: "Cheie API Speko (sk_…)", help: "dashboard Speko → API keys" },
  METRICOOL: { label: "Metricool (programare)", tokenLabel: "Token API Metricool (X-Mc-Auth)", help: "Metricool → Account Settings → API (doar planurile Advanced/Custom)" },
  TTS_ALT: { label: "Voce alternativă", tokenLabel: "Token", help: "rezervat pentru un alt provider TTS" },
  SMTP: { label: "Email (Resend)", tokenLabel: "Cheie API Resend (re_…)", help: "resend.com → API Keys; notificările „aștept aprobarea ta”" },
};

export async function saveIntegration(
  db: PrismaClient,
  type: IntegrationType,
  args: { token?: string | null; config?: Record<string, unknown>; clearToken?: boolean },
) {
  const existing = await db.integration.findUnique({ where: { type } });
  const config = { ...((existing?.config ?? {}) as Record<string, unknown>), ...(args.config ?? {}) };
  const data: Prisma.IntegrationUncheckedCreateInput = { type, config: config as Prisma.InputJsonValue };
  if (args.clearToken) {
    data.tokenEnc = null;
    (data.config as Record<string, unknown>).tokenHint = null;
    data.status = "UNTESTED";
  } else if (args.token && args.token.trim()) {
    const t = args.token.trim();
    data.tokenEnc = encryptSecret(t);
    (data.config as Record<string, unknown>).tokenHint = maskSecret(t);
    data.status = "UNTESTED";
    data.lastError = null;
  }
  return db.integration.upsert({ where: { type }, update: data, create: data });
}

export async function getIntegrationToken(db: PrismaClient, type: IntegrationType): Promise<string | null> {
  const i = await db.integration.findUnique({ where: { type } });
  return i?.tokenEnc ? decryptSecret(i.tokenEnc) : null;
}

export async function recordIntegrationCheck(db: PrismaClient, type: IntegrationType, status: IntegrationStatus, error?: string | null) {
  return db.integration.update({ where: { type }, data: { status, lastChecked: new Date(), lastError: error ? error.slice(0, 1000) : null } });
}
