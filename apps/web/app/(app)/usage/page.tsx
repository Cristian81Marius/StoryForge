import { prisma } from "@/lib/db";
import { fmtDate, fmtInt, fmtUsd } from "@/lib/format";

export default async function UsagePage() {
  const [runs, byAgent] = await Promise.all([
    prisma.run.findMany({ include: { job: { include: { story: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.run.groupBy({ by: ["agent", "model"], _sum: { inputTokens: true, outputTokens: true, costUsd: true, durationMs: true }, _count: true }),
  ]);
  return (
    <>
      <h1>Usage</h1>
      <p className="muted">
        Costul e estimarea locală raportată de Claude Code (<code>total_cost_usd</code>). Pe abonamentul Pro nu e factură, ci cost echivalent API. Graficele, pragurile și agregările pe
        săptămână/lună vin în faza 6.
      </p>
      <h2>Pe agent / model</h2>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Model</th>
              <th>Rulări</th>
              <th>Tokens in/out</th>
              <th>Cost echiv.</th>
            </tr>
          </thead>
          <tbody>
            {byAgent.map((a) => (
              <tr key={`${a.agent}-${a.model}`}>
                <td>{a.agent}</td>
                <td>{a.model ?? "—"}</td>
                <td>{a._count}</td>
                <td>
                  {fmtInt(a._sum.inputTokens ?? 0)} / {fmtInt(a._sum.outputTokens ?? 0)}
                </td>
                <td>{fmtUsd(a._sum.costUsd ?? 0)}</td>
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
              <th>Valid</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.createdAt)}</td>
                <td>{r.agent}</td>
                <td>
                  {r.model ?? "—"} / {r.effort ?? "—"}
                </td>
                <td>{r.job.story?.title ?? "—"}</td>
                <td>
                  {fmtInt(r.inputTokens)} / {fmtInt(r.outputTokens)}
                </td>
                <td>{fmtUsd(r.costUsd)}</td>
                <td>{(r.durationMs / 1000).toFixed(1)} s</td>
                <td>{r.outputValid ? "✓" : `✕ ${r.error ?? ""}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
