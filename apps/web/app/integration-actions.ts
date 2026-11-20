"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { IntegrationType, Prisma } from "@prisma/client";
import { getIntegrationToken, recordIntegrationCheck, saveIntegration } from "@storyforge/core/services";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const TYPES: IntegrationType[] = ["SPEKO", "METRICOOL", "SMTP", "TTS_ALT"];
const back = (msg: string) => redirect("/settings?flash=" + encodeURIComponent(msg) + "#integrari");

async function requireAdmin() {
  if (!(await verifySession((await cookies()).get(SESSION_COOKIE)?.value))) redirect("/login");
}

export async function saveIntegrationAction(form: FormData) {
  await requireAdmin();
  const type = String(form.get("type")) as IntegrationType;
  if (!TYPES.includes(type)) back("Integrare necunoscută");
  const config: Record<string, unknown> = {};
  if (type === "SPEKO") {
    config.voices = {
      ro: { voice: String(form.get("voiceRo") ?? "").trim() || null, provider: String(form.get("providerRo") ?? "").trim() || null },
      en: { voice: String(form.get("voiceEn") ?? "").trim() || null, provider: String(form.get("providerEn") ?? "").trim() || null },
    };
  }
  if (type === "METRICOOL") {
    config.userId = String(form.get("userId") ?? "").trim() || null;
    config.mode = ["api", "mcp", "manual"].includes(String(form.get("mode"))) ? String(form.get("mode")) : "manual";
    config.publicMediaBaseUrl = String(form.get("publicMediaBaseUrl") ?? "").trim() || null;
    config.monthlyPostLimit = Number(form.get("monthlyPostLimit")) || null;
  }
  if (type === "SMTP") {
    config.from = String(form.get("from") ?? "").trim() || null;
    config.to = String(form.get("to") ?? "").trim() || null;
  }
  await saveIntegration(prisma, type, { token: String(form.get("token") ?? ""), config, clearToken: form.get("clearToken") === "on" });
  revalidatePath("/settings");
  back("Integrarea a fost salvată (token-ul e criptat și nu se mai afișează).");
}

async function timedFetch(url: string, init: RequestInit) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 15_000);
  try {
    return await fetch(url, { ...init, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Test de conexiune: un apel de citire, fără efecte. Rezultatul se salvează (status, last_checked). */
export async function testIntegrationAction(form: FormData) {
  await requireAdmin();
  const type = String(form.get("type")) as IntegrationType;
  const token = await getIntegrationToken(prisma, type);
  if (!token) back("Nu există token salvat pentru această integrare.");
  let msg = "";
  try {
    if (type === "SPEKO") {
      const { Speko } = await import("@spekoai/sdk");
      const b = await new Speko({ apiKey: token!, baseURL: process.env.SPEKO_BASE_URL || undefined }).credits.getBalance();
      msg = `Speko: conectat, credit $${b.balanceUsd.toFixed(2)}`;
    } else if (type === "METRICOOL") {
      const cfg = ((await prisma.integration.findUnique({ where: { type } }))?.config ?? {}) as { userId?: string };
      const r = await timedFetch(`https://app.metricool.com/api/admin/simpleProfiles?userId=${encodeURIComponent(cfg.userId ?? "")}`, {
        headers: { "X-Mc-Auth": token! },
      });
      if (r.status === 401 || r.status === 403) throw Object.assign(new Error(`HTTP ${r.status}: token invalid sau planul nu include API (Advanced/Custom)`), { expired: true });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const brands = (await r.json()) as unknown[];
      msg = `Metricool: conectat, ${Array.isArray(brands) ? brands.length : "?"} branduri`;
    } else if (type === "SMTP") {
      const r = await timedFetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${token}` } });
      if (r.status === 401 || r.status === 403) throw Object.assign(new Error(`HTTP ${r.status}: cheie invalidă`), { expired: true });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      msg = "Resend: conectat";
    } else {
      msg = "Fără test pentru această integrare";
    }
    await recordIntegrationCheck(prisma, type, "OK");
  } catch (e) {
    const err = e as Error & { expired?: boolean };
    await recordIntegrationCheck(prisma, type, err.expired ? "EXPIRED" : "ERROR", err.message);
    msg = `Test eșuat: ${err.message}`;
  }
  revalidatePath("/settings");
  back(msg);
}

export async function saveChannelAction(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const language = String(form.get("language")) === "en" ? "en" : "ro";
  const platforms = ["tiktok", "instagram", "youtube", "facebook"].filter((p) => form.get(`p_${p}`) === "on");
  const data = {
    name: String(form.get("name") ?? "").slice(0, 80) || `Canal ${language.toUpperCase()}`,
    language,
    metricoolBrandId: String(form.get("metricoolBrandId") ?? "").trim() || null,
    platforms,
    timezone: String(form.get("timezone") ?? "").trim() || (language === "ro" ? "Europe/Bucharest" : "America/New_York"),
    active: form.get("active") === "on",
  };
  if (id) await prisma.channel.update({ where: { id }, data });
  else await prisma.channel.create({ data });
  revalidatePath("/settings");
  back("Canal salvat.");
}

export async function saveRhythmAction(form: FormData) {
  await requireAdmin();
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => form.get(`d_${d}`) === "on");
  const hour = /^\d{2}:\d{2}$/.test(String(form.get("hour"))) ? String(form.get("hour")) : "09:00";
  const rhythm = {
    storiesPerWeek: Math.min(7, Math.max(0, Number(form.get("storiesPerWeek")) || 0)),
    days: days.length ? days : [2],
    hour,
    timezone: String(form.get("timezone") ?? "Europe/Bucharest") || "Europe/Bucharest",
    postDays: [1, 2, 3, 4, 5, 6, 7].filter((d) => form.get(`pd_${d}`) === "on"),
    postHour: /^\d{2}:\d{2}$/.test(String(form.get("postHour"))) ? String(form.get("postHour")) : "19:00",
  };
  const thresholds = {
    weeklyCostUsd: Number(form.get("weeklyCostUsd")) || null,
    monthlyCostUsd: Number(form.get("monthlyCostUsd")) || null,
    weeklyTokens: Number(form.get("weeklyTokens")) || null,
  };
  const notifyEmail = String(form.get("notifyEmail") ?? "").trim() || null;
  await prisma.settings.upsert({
    where: { id: "global" },
    update: { rhythm: rhythm as Prisma.InputJsonValue, thresholds: thresholds as Prisma.InputJsonValue, notifyEmail },
    create: { id: "global", rhythm: rhythm as Prisma.InputJsonValue, thresholds: thresholds as Prisma.InputJsonValue, notifyEmail },
  });
  revalidatePath("/settings");
  back("Ritmul și pragurile au fost salvate.");
}
