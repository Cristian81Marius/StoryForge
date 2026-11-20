import Link from "next/link";
import { isoWeekKey, monthStart, spendBetween, thresholdAlerts, weekStart } from "@storyforge/core/services";
import { prisma } from "@/lib/db";
import { fmtDate, fmtInt, fmtUsd } from "@/lib/format";
import { WeeklyCostChart, type WeekPoint } from "@/components/WeeklyCostChart";

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);

export default async function UsagePage() {
  const now = new Date();
  const ws = weekStart(now);
  const ms = monthStart(now);
  const since = new Date(ws.getTime() - 11 * 7 * 86400_000);
  const settings = await prisma.settings.findUnique({ where: { id: "global" } });
  const thr = (settings?.thresholds ?? {}) as { weeklyCostUsd?: number | null; monthlyCostUsd?: number | null };

  const [week, month, alerts, weeklyClaude, weeklyExt, byAgent, byStage, byStory, byMonth, runs, external] = await Promise.all([
    spendBetween(prisma, ws, new Date(ws.getTime() + 7 * 86400_000)),
    spendBetween(prisma, ms, new Date(Date.UTC(ms.getUTCFullYear(), ms.getUTCMonth() + 1, 1))),
    thresholdAlerts(prisma, now),
    prisma.$queryRaw<Row[]>`SELECT date_trunc('week', "createdAt") AS w, SUM("costUsd") AS c FROM "Run" WHERE "createdAt" >= ${since} GROUP BY 1`,
    prisma.$queryRaw<Row[]>`SELECT date_trunc('week', "createdAt") AS w, SUM("amountUsd") AS c FROM "ExternalCost" WHERE "createdAt" >= ${since} GROUP BY 1`,
    prisma.$queryRaw<Row[]>`SELECT agent, COALESCE(model, '—') AS model, COALESCE(effort, '—') AS effort, COUNT(*) AS n,
        SUM("inputTokens") AS tin, SUM("outputTokens") AS tout, SUM("cacheReadTokens") AS tcache, SUM("costUsd") AS cost, SUM("durationMs") AS ms,
        SUM(CASE WHEN "outputValid" THEN 0 ELSE 1 END) AS invalid
      FROM "Run" GROUP BY 1, 2, 3 ORDER BY cost DESC`,
    prisma.$queryRaw<Row[]>`SELECT COALESCE(j.stage::text, j.kind) AS stage, COUNT(r.*) AS n, SUM(r."costUsd") AS cost, SUM(r."inputTokens" + r."outputTokens") AS tokens, SUM(r."durationMs") AS ms
      FROM "Run" r JOIN "Job" j ON j.id = r."jobId" GROUP BY 1 ORDER BY cost DESC`,
    prisma.$queryRaw<Row[]>`SELECT s.id, s.number, s.title, COUNT(r.*) AS n, SUM(r."costUsd") AS cost, SUM(r."inputTokens" + r."outputTokens") AS tokens,
        (SELECT COALESCE(SUM(e."amountUsd"), 0) FROM "ExternalCost" e WHERE e."storyId" = s.id) AS ext
      FROM "Run" r JOIN "Job" j ON j.id = r."jobId" JOIN "Story" s ON s.id = j."storyId" GROUP BY s.id ORDER BY cost DESC LIMIT 20`,
    prisma.$queryRaw<Row[]>`SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS m, COUNT(*) AS n, SUM("costUsd") AS cost, SUM("inputTokens" + "outputTokens") AS tokens
      FROM "Run" GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
    prisma.run.findMany({ include: { job: { include: { story: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.externalCost.findMany({ include: { story: true }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);

  const series: WeekPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(ws.getTime() - i * 7 * 86400_000);
    const key = start.toISOString().slice(0, 10);
    const pick = (rows: Row[]) => num(rows.find((r) => new Date(r.w as string).toISOString().slice(0, 10) === key)?.c);
    series.push({ week: isoWeekKey(start), claude: pick(weeklyClaude), external: pick(weeklyExt) });
  }

  return (
    <>
      <h1>Usage</h1>
      <p className="muted">
        „Claude” = estimarea locală raportată de Claude Code (<code>total_cost_usd</code>). Pe abonamentul Pro e <b>cost echivalent API</b>, nu factură: limitele reale
        sunt cele de 5 ore / săptămânale ale abonamentului. „Externe” = costuri raportate de servicii (ex. Speko, din diferența de credit).
      </p>
      {alerts.map((a) => (
        <div key={a.key} className="msg err" data-testid="threshold-alert">
          ⚠ {a.message}. <Link href="/settings">Praguri</Link>
        </div>
      ))}

      <div className="grid" data-testid="usage-totals">
        <div className="stat">
          <b>{fmtUsd(week.claudeUsd + week.externalUsd)}</b>
          <span>
            săptămâna {isoWeekKey(now)} · {week.runs} rulări{thr.weeklyCostUsd ? ` · prag $${thr.weeklyCostUsd}` : ""}
          </span>
        </div>
        <div className="stat">
          <b>{fmtUsd(month.claudeUsd + month.externalUsd)}</b>
          <span>
            luna {ms.toISOString().slice(0, 7)}
            {thr.monthlyCostUsd ? ` · prag $${thr.monthlyCostUsd}` : ""}
          </span>
        </div>
        <div className="stat">
          <b>{fmtInt(week.tokens)}</b>
          <span>tokens săptămâna aceasta (incl. cache)</span>
        </div>
        <div className="stat">
          <b>{fmtUsd(month.externalUsd)}</b>
          <span>servicii externe, luna aceasta</span>
        </div>
      </div>

      <div className="panel" style={{ marginTop: "1rem" }}>
        <WeeklyCostChart data={series} threshold={thr.weeklyCostUsd} />
      </div>

      <h2>Pe agent / model</h2>
      <div className="panel">
        <table data-testid="by-agent">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Model</th>
              <th>Effort</th>
              <th>Rulări</th>
              <th>Tokens in / out / cache</th>
              <th>Cost echiv.</th>
              <th>Timp</th>
              <th>Output invalid</th>
            </tr>
          </thead>
          <tbody>
            {byAgent.map((a, i) => (
              <tr key={i}>
                <td>{String(a.agent)}</td>
                <td>{String(a.model)}</td>
                <td>{String(a.effort)}</td>
                <td>{num(a.n)}</td>
                <td>
                  {fmtInt(num(a.tin))} / {fmtInt(num(a.tout))} / {fmtInt(num(a.tcache))}
                </td>
                <td>{fmtUsd(num(a.cost))}</td>
                <td>{(num(a.ms) / 60000).toFixed(1)} min</td>
                <td>{num(a.invalid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="two">
        <div>
          <h2>Pe etapă</h2>
          <div className="panel">
            <table data-testid="by-stage">
              <tbody>
                {byStage.map((s, i) => (
                  <tr key={i}>
                    <td>{String(s.stage)}</td>
                    <td>{num(s.n)} rulări</td>
                    <td>{fmtInt(num(s.tokens))} tok</td>
                    <td>{fmtUsd(num(s.cost))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2>Pe lună</h2>
          <div className="panel">
            <table data-testid="by-month">
              <tbody>
                {byMonth.map((m, i) => (
                  <tr key={i}>
                    <td>{String(m.m)}</td>
                    <td>{num(m.n)} rulări</td>
                    <td>{fmtInt(num(m.tokens))} tok</td>
                    <td>{fmtUsd(num(m.cost))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <h2>Pe poveste (top 20)</h2>
      <div className="panel">
        <table data-testid="by-story">
          <thead>
            <tr>
              <th>Poveste</th>
              <th>Rulări</th>
              <th>Tokens</th>
              <th>Claude</th>
              <th>Externe</th>
            </tr>
          </thead>
          <tbody>
            {byStory.map((s) => (
              <tr key={String(s.id)}>
                <td>
                  <Link href={`/stories/${String(s.id)}`}>
                    {num(s.number)}. {String(s.title)}
                  </Link>
                </td>
                <td>{num(s.n)}</td>
                <td>{fmtInt(num(s.tokens))}</td>
                <td>{fmtUsd(num(s.cost))}</td>
                <td>{fmtUsd(num(s.ext))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Ultimele rulări</h2>
      <div className="panel">
        <table data-testid="runs">
          <thead>
            <tr>
              <th>Când</th>
              <th>Agent</th>
              <th>Model / effort</th>
              <th>Poveste</th>
              <th>Tokens</th>
              <th>Cost</th>
              <th>Durată</th>
              <th>Exit</th>
              <th>Valid</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.createdAt)}</td>
                <td>
                  {r.agent}
                  {r.attempt > 1 ? ` (încercarea ${r.attempt})` : ""}
                </td>
                <td>
                  {r.model ?? "—"} / {r.effort ?? "—"}
                </td>
                <td>{r.job.story ? `${r.job.story.number}. ${r.job.story.title}` : r.job.kind}</td>
                <td>
                  {fmtInt(r.inputTokens)} / {fmtInt(r.outputTokens)}
                </td>
                <td>{fmtUsd(r.costUsd)}</td>
                <td>{(r.durationMs / 1000).toFixed(1)} s</td>
                <td>{r.exitCode ?? "—"}</td>
                <td>{r.outputValid ? "✓" : `✕ ${r.error ?? ""}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Costuri servicii externe</h2>
      <div className="panel">
        {!external.length ? (
          <p className="muted">Niciun cost extern raportat încă.</p>
        ) : (
          <table>
            <tbody>
              {external.map((e) => (
                <tr key={e.id}>
                  <td>{fmtDate(e.createdAt)}</td>
                  <td>{e.provider}</td>
                  <td>{e.story ? `${e.story.number}. ${e.story.title}` : "—"}</td>
                  <td>{fmtUsd(e.amountUsd)}</td>
                  <td className="muted">{e.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
