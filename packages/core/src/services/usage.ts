import type { PrismaClient } from "@prisma/client";

/** Începutul săptămânii ISO (luni 00:00 UTC) pentru `d`. */
export function weekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const wd = (x.getUTCDay() + 6) % 7; // 0 = luni
  return new Date(x.getTime() - wd * 86400_000);
}
export function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
/** „2026-W48” */
export function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t.getTime() - firstThursday.getTime()) / 86400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export interface Spend {
  claudeUsd: number;
  externalUsd: number;
  tokens: number;
  runs: number;
}

/** Cheltuiala într-un interval: estimarea Claude (total_cost_usd) + costurile serviciilor externe. */
export async function spendBetween(db: PrismaClient, from: Date, to: Date): Promise<Spend> {
  const [r, e] = await Promise.all([
    db.run.aggregate({ where: { createdAt: { gte: from, lt: to } }, _sum: { costUsd: true, inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheCreationTokens: true }, _count: true }),
    db.externalCost.aggregate({ where: { createdAt: { gte: from, lt: to } }, _sum: { amountUsd: true } }),
  ]);
  return {
    claudeUsd: r._sum.costUsd ?? 0,
    externalUsd: e._sum.amountUsd ?? 0,
    tokens: (r._sum.inputTokens ?? 0) + (r._sum.outputTokens ?? 0) + (r._sum.cacheReadTokens ?? 0) + (r._sum.cacheCreationTokens ?? 0),
    runs: r._count,
  };
}

export interface ThresholdAlert {
  key: string;
  message: string;
}

/** Pragurile din Setări depășite în săptămâna/luna curentă. */
export async function thresholdAlerts(db: PrismaClient, now = new Date()): Promise<ThresholdAlert[]> {
  const s = await db.settings.findUnique({ where: { id: "global" } });
  const t = (s?.thresholds ?? {}) as { weeklyCostUsd?: number | null; monthlyCostUsd?: number | null; weeklyTokens?: number | null };
  const out: ThresholdAlert[] = [];
  const ws = weekStart(now);
  const week = await spendBetween(db, ws, new Date(ws.getTime() + 7 * 86400_000));
  const weekKey = isoWeekKey(now);
  if (t.weeklyCostUsd && week.claudeUsd + week.externalUsd > t.weeklyCostUsd)
    out.push({ key: `threshold:weekcost:${weekKey}`, message: `Costul săptămânii ${weekKey} ($${(week.claudeUsd + week.externalUsd).toFixed(2)}) a depășit pragul de $${t.weeklyCostUsd}` });
  if (t.weeklyTokens && week.tokens > t.weeklyTokens)
    out.push({ key: `threshold:weektokens:${weekKey}`, message: `Tokens în săptămâna ${weekKey} (${week.tokens.toLocaleString("ro-RO")}) peste pragul de ${t.weeklyTokens.toLocaleString("ro-RO")}` });
  const ms = monthStart(now);
  const month = await spendBetween(db, ms, new Date(Date.UTC(ms.getUTCFullYear(), ms.getUTCMonth() + 1, 1)));
  const monthKey = ms.toISOString().slice(0, 7);
  if (t.monthlyCostUsd && month.claudeUsd + month.externalUsd > t.monthlyCostUsd)
    out.push({ key: `threshold:monthcost:${monthKey}`, message: `Costul lunii ${monthKey} ($${(month.claudeUsd + month.externalUsd).toFixed(2)}) a depășit pragul de $${t.monthlyCostUsd}` });
  return out;
}

/** Marchează o execuție unică; întoarce false dacă a mai fost făcută (cheie unică). */
export async function claimOnce(db: PrismaClient, key: string, kind: string, detail: object = {}): Promise<boolean> {
  try {
    await db.cronRun.create({ data: { key, kind, detail } });
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return false;
    throw e;
  }
}
