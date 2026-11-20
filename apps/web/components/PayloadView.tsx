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
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
  return null;
}
