/**
 * Trendul săptămânal al costului echivalent (o singură serie → fără legendă; titlul o numește).
 * Bare subțiri cu capete rotunjite ancorate la bază, grilă discretă, linie de prag punctată,
 * tooltip la hover pe fiecare bară (zona de hover = toată coloana) și tabel echivalent dedesubt.
 */
export interface WeekPoint {
  week: string; // „2026-W47”
  claude: number;
  external: number;
}

export function WeeklyCostChart({ data, threshold }: { data: WeekPoint[]; threshold?: number | null }) {
  const W = 720;
  const H = 220;
  const pad = { l: 44, r: 12, t: 12, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const totals = data.map((d) => d.claude + d.external);
  const max = Math.max(threshold ?? 0, ...totals, 1);
  const nice = niceMax(max);
  const y = (v: number) => pad.t + ih - (v / nice) * ih;
  const step = iw / Math.max(1, data.length);
  const bw = Math.min(28, step * 0.55);
  const ticks = [0, nice / 2, nice];

  return (
    <figure style={{ margin: 0 }} data-testid="weekly-chart">
      <figcaption className="muted" style={{ marginBottom: ".4rem" }}>
        Cost echivalent pe săptămână (Claude + servicii externe), ultimele {data.length} săptămâni
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Cost pe săptămână" style={{ maxWidth: W, display: "block" }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              ${t.toFixed(t < 10 ? 1 : 0)}
            </text>
          </g>
        ))}
        {threshold ? (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={y(threshold)} y2={y(threshold)} stroke="var(--bad)" strokeWidth={1.5} strokeDasharray="5 4" />
            <text x={W - pad.r} y={y(threshold) - 5} textAnchor="end" fontSize="11" fill="var(--muted)">
              prag ${threshold}
            </text>
          </g>
        ) : null}
        {data.map((d, i) => {
          const total = totals[i];
          const x = pad.l + i * step + (step - bw) / 2;
          const h = Math.max(0, ih - (y(total) - pad.t));
          const r = Math.min(4, bw / 2, h);
          const label = `${d.week}: $${total.toFixed(2)} (Claude $${d.claude.toFixed(2)}, externe $${d.external.toFixed(2)})`;
          return (
            <g key={d.week} className="bar">
              {/* zona de hover acoperă toată coloana, nu doar bara */}
              <rect x={pad.l + i * step} y={pad.t} width={step} height={ih} fill="transparent">
                <title>{label}</title>
              </rect>
              {h > 0 && (
                <path
                  d={`M${x},${pad.t + ih} V${pad.t + ih - h + r} Q${x},${pad.t + ih - h} ${x + r},${pad.t + ih - h} H${x + bw - r} Q${x + bw},${pad.t + ih - h} ${x + bw},${pad.t + ih - h + r} V${pad.t + ih} Z`}
                  fill={threshold && total > threshold ? "var(--bad)" : "var(--accent)"}
                  pointerEvents="none"
                />
              )}
              {(i === data.length - 1 || i % Math.ceil(data.length / 6) === 0) && (
                <text x={pad.l + i * step + step / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
                  {d.week.slice(5)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke="var(--muted)" strokeWidth={1} />
      </svg>
      <details>
        <summary className="muted">Tabel</summary>
        <table>
          <thead>
            <tr>
              <th>Săptămâna</th>
              <th>Claude (echivalent)</th>
              <th>Externe</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={d.week}>
                <td>{d.week}</td>
                <td>${d.claude.toFixed(2)}</td>
                <td>${d.external.toFixed(2)}</td>
                <td>${totals[i].toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
