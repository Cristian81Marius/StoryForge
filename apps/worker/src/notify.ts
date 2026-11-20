import type { PrismaClient } from "@prisma/client";
import { getIntegrationToken } from "@storyforge/core/services";
import type { Logger } from "@storyforge/core";

/**
 * Email prin Resend (token API criptat în Integrări → Email). Fără token: notificarea se scrie doar în log.
 * Expeditorul trebuie să fie pe un domeniu verificat în Resend.
 */
export async function sendEmail(db: PrismaClient, log: Logger, subject: string, text: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const integ = await db.integration.findUnique({ where: { type: "SMTP" } });
  const cfg = (integ?.config ?? {}) as { from?: string; to?: string };
  const settings = await db.settings.findUnique({ where: { id: "global" } });
  const to = cfg.to || settings?.notifyEmail;
  const token = await getIntegrationToken(db, "SMTP");
  if (!token || !cfg.from || !to) {
    log.info("notify.skipped", { subject, reason: "email neconfigurat (Setări → Integrări → Email)" });
    return false;
  }
  const r = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ from: cfg.from, to: [to], subject, text }),
  });
  if (!r.ok) {
    log.warn("notify.failed", { subject, status: r.status });
    return false;
  }
  log.info("notify.sent", { subject });
  return true;
}

export function appUrl(path: string) {
  return `${(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")}${path}`;
}
