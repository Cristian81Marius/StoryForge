import { ScenaristOutput, SocialOutput, type Stage } from "@storyforge/core";

/** Afișarea „umană” a payload-ului unei versiuni; JSON-ul brut e mereu disponibil dedesubt. */
export function PayloadView({ stage, payload }: { stage: Stage; payload: unknown }) {
  if (stage === "SCRIPT") {
    const r = ScenaristOutput.safeParse(payload);
    if (r.success) {
      const sb = r.data.storyboard;
      return (
        <div data-testid="storyboard-view">
          <div className="two">
            <div>
              <h3>{sb.title.ro}</h3>
              <p>
                <b>Morala:</b> {sb.moral.ro}
              </p>
              <p>
                <b>Public:</b> {sb.targetAudience.ro}
              </p>
              <p>
                <b>Rezumat:</b> {sb.summary.ro}
              </p>
              <p>
                <b>Cârlig:</b> {sb.hook.ro}
              </p>
            </div>
            <div>
              <h3>{sb.title.en}</h3>
              <p>
                <b>Moral:</b> {sb.moral.en}
              </p>
              <p>
                <b>Audience:</b> {sb.targetAudience.en}
              </p>
              <p>
                <b>Summary:</b> {sb.summary.en}
              </p>
              <p>
                <b>Hook:</b> {sb.hook.en}
              </p>
            </div>
          </div>
          <p className="muted">
            Tip {sb.episodeType} · {sb.scenes.length} scene · {sb.scenes.reduce((a, s) => a + s.durationSec, 0).toFixed(1)} s planificat · verset {sb.verse.reference}
          </p>
          <h3>Personaje</h3>
          <ul>
            {sb.characters.map((c) => (
              <li key={c.id}>
                <b>{c.name.ro}</b> / {c.name.en} — {c.visual}
                {c.originalName && <span className="muted"> (în original: {c.originalName})</span>}
              </li>
            ))}
          </ul>
          <h3>Scene</h3>
          {sb.scenes.map((s) => (
            <div className="scene" key={s.id}>
              <div className="row">
                <b>{s.id}</b> <span className="badge">{s.role}</span> <span className="muted">{s.durationSec}s · {s.camera} · {s.transition} · {s.background}</span>
              </div>
              <div className="muted">{s.visual}</div>
              <div className="two">
                <div>🇷🇴 {s.narration.ro}</div>
                <div>🇬🇧 {s.narration.en}</div>
              </div>
            </div>
          ))}
          <p>
            <b>Fidelitate:</b> {r.data.fidelityCheck.explanation}
          </p>
          {r.data.changesFromPrevious.length > 0 && (
            <>
              <b>Schimbări față de versiunea anterioară:</b>
              <ul>
                {r.data.changesFromPrevious.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      );
    }
  }
  if (stage === "VIDEO") {
    const p = payload as { qa?: Record<string, { issues?: Array<{ sceneId: string; kind: string; description: string; fixed: boolean }>; notes?: string }>; note?: string };
    if (p?.qa)
      return (
        <div data-testid="qa-view">
          {p.note && <p className="muted">{p.note}</p>}
          {Object.entries(p.qa).map(([lang, q]) => (
            <div key={lang}>
              <h3>QA producer ({lang.toUpperCase()})</h3>
              {!q.issues?.length ? (
                <p className="muted">Nicio problemă găsită.</p>
              ) : (
                <ul>
                  {q.issues.map((i, k) => (
                    <li key={k}>
                      <b>{i.sceneId}</b> · {i.kind} · {i.description} {i.fixed ? <span className="badge ok">reparat</span> : <span className="badge bad">nereparat</span>}
                    </li>
                  ))}
                </ul>
              )}
              {q.notes && <p className="muted">{q.notes}</p>}
            </div>
          ))}
        </div>
      );
  }
  if (stage === "FINAL") {
    const p = payload as {
      check?: Record<string, { width: number; height: number; codec: string; colorSpace: string; fps: number; durationSec: number; audio: string | null; lufs: number | null; peakDbfs: number | null; silences: string }>;
      warnings?: string[];
    };
    const valid = p?.check && Object.values(p.check).every((c) => c && typeof c === "object" && typeof (c as { durationSec?: unknown }).durationSec === "number");
    if (valid && p.check) {
      const ok = (c: NonNullable<typeof p.check>[string]) =>
        c.width === 1080 && c.height === 1920 && c.codec === "h264" && !!c.audio && c.lufs !== null && Math.abs(c.lufs + 14) <= 1 && (c.peakDbfs ?? 0) <= -1;
      return (
        <div data-testid="check-view">
          {p.warnings?.map((w, i) => (
            <p key={i} className="msg err">
              {w}
            </p>
          ))}
          <table>
            <thead>
              <tr>
                <th>Limbă</th>
                <th>Rezoluție</th>
                <th>Codec / culori</th>
                <th>Durată</th>
                <th>Audio</th>
                <th>LUFS (−14 ±1)</th>
                <th>Vârf (≤ −1 dBFS)</th>
                <th>Tăceri &gt; 1,2 s</th>
                <th>Conform skill</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(p.check).map(([lang, c]) => (
                <tr key={lang}>
                  <td>{lang.toUpperCase()}</td>
                  <td>
                    {c.width}×{c.height} @ {c.fps} fps
                  </td>
                  <td>
                    {c.codec} / {c.colorSpace}
                  </td>
                  <td>{Number(c.durationSec).toFixed(1)} s</td>
                  <td>{c.audio ?? "lipsește"}</td>
                  <td>{c.lufs ?? "—"}</td>
                  <td>{c.peakDbfs ?? "—"}</td>
                  <td>{c.silences}</td>
                  <td>{ok(c) ? <span className="badge ok">da</span> : <span className="badge bad">nu</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }
  if (stage === "SOCIAL") {
    const r = SocialOutput.safeParse(payload);
    if (r.success)
      return (
        <table>
          <thead>
            <tr>
              <th>Limbă</th>
              <th>Platformă</th>
              <th>Titlu</th>
              <th>Descriere</th>
              <th>Hashtag-uri</th>
              <th>Propus</th>
            </tr>
          </thead>
          <tbody>
            {r.data.posts.map((p, i) => (
              <tr key={i}>
                <td>{p.lang}</td>
                <td>{p.platform}</td>
                <td>{p.title}</td>
                <td style={{ whiteSpace: "pre-wrap" }}>{p.description}</td>
                <td>{p.hashtags.join(" ")}</td>
                <td className="muted">
                  {p.proposedAt ? new Date(p.proposedAt).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" }) : "—"}
                  <div>{p.madeForKids ? "made for kids" : ""} · AI</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
  return null;
}
