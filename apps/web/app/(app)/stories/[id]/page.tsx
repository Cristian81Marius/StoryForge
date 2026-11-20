import Link from "next/link";
import { notFound } from "next/navigation";
import { STAGES, STAGE_DEF, isReview, stageOfStatus, availableActions, type Stage, type StoryStatus } from "@storyforge/core";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/StatusBadge";
import { ReviewForm } from "@/components/ReviewForm";
import { VersionDiff } from "@/components/VersionDiff";
import { PayloadView } from "@/components/PayloadView";
import { fmtDate, fmtUsd, fmtInt } from "@/lib/format";
import { retryJobAction, startAction } from "@/app/actions";

type FileRef = { key: string; kind: string; lang?: string; mime?: string; url?: string };

export default async function StoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stage?: string; v?: string; cmp?: string; flash?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const story = await prisma.story.findUnique({
    where: { id },
    include: {
      book: true,
      versions: { orderBy: [{ stage: "asc" }, { number: "asc" }] },
      jobs: { orderBy: { createdAt: "desc" }, include: { runs: true } },
    },
  });
  if (!story) notFound();

  const status = story.status as StoryStatus;
  const currentStage = stageOfStatus(status);
  const stagesWithVersions = STAGES.filter((s) => story.versions.some((v) => v.stage === s));
  const stage = (STAGES.includes(sp.stage as Stage) ? sp.stage : (currentStage && stagesWithVersions.includes(currentStage) ? currentStage : stagesWithVersions.at(-1))) as Stage | undefined;
  const versions = story.versions.filter((v) => v.stage === stage);
  const selected = versions.find((v) => String(v.number) === sp.v) ?? versions.at(-1);
  const compare = sp.cmp ? versions.find((v) => String(v.number) === sp.cmp) : undefined;
  const latest = versions.at(-1);
  const canDecide = isReview(status) && stage === currentStage && selected && latest && selected.id === latest.id && !latest.decision;
  // fișierele din storage se servesc prin /api/files (paginile HTML din work/ rămân doar referințe)
  const files = ((selected?.files ?? []) as FileRef[]).map((f) =>
    f.kind === "page" ? f : { ...f, url: `/api/files/${f.key.split("/").map(encodeURIComponent).join("/")}` },
  );
  const q = (o: Record<string, string | number | undefined>) =>
    "?" + Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${v}`).join("&");

  return (
    <>
      <p>
        <Link href="/">← Dashboard</Link>
      </p>
      <h1>
        {story.number}. {story.title} <StatusBadge status={status} />
      </h1>
      {sp.flash && (
        <div className="msg ok" role="status" data-testid="flash">
          {sp.flash.slice(0, 200)}
        </div>
      )}
      <p className="muted" data-testid="source-reference">
        Sursa: {story.sourceReference} · {story.book.title}, {story.book.author}
      </p>

      {availableActions(status).includes("START") && (
        <form action={startAction} className="panel">
          <input type="hidden" name="storyId" value={story.id} />
          <button className="primary">Pornește scenariul</button>
        </form>
      )}

      <div className="two">
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Text sursă</h2>
          <div className="source">{story.text}</div>
        </div>

        <div>
          {canDecide && <ReviewForm storyId={story.id} stageLabel={STAGE_DEF[stage!].label} />}
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>Joburi</h2>
            {story.jobs.length === 0 && <p className="muted">Niciun job.</p>}
            <table>
              <tbody>
                {story.jobs.map((j) => {
                  const cost = j.runs.reduce((a, r) => a + r.costUsd, 0);
                  const tokens = j.runs.reduce((a, r) => a + r.inputTokens + r.outputTokens, 0);
                  return (
                    <tr key={j.id} data-testid="job-row" data-kind={j.kind} data-status={j.status}>
                      <td>{j.kind}</td>
                      <td>
                        <span className={`badge ${j.status === "FAILED" ? "bad" : j.status === "SUCCEEDED" ? "ok" : ""}`}>{j.status}</span>
                        {j.error && <div className="muted" style={{ whiteSpace: "pre-wrap", fontSize: ".8rem" }}>{j.error}</div>}
                      </td>
                      <td className="muted">
                        {j.runs.length} rulări · {fmtInt(tokens)} tok · {fmtUsd(cost)}
                      </td>
                      <td>
                        {j.status === "FAILED" && (
                          <form action={retryJobAction}>
                            <input type="hidden" name="jobId" value={j.id} />
                            <input type="hidden" name="storyId" value={story.id} />
                            <button className="small">Reîncearcă</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <h2>Versiuni pe etape</h2>
      <div className="tabs">
        {STAGES.map((s) => {
          const n = story.versions.filter((v) => v.stage === s).length;
          return n ? (
            <a key={s} className={s === stage ? "on" : ""} href={q({ stage: s })}>
              {STAGE_DEF[s].label} ({n})
            </a>
          ) : (
            <span key={s} className="muted" style={{ padding: ".3rem .6rem" }}>
              {STAGE_DEF[s].label}
            </span>
          );
        })}
      </div>

      {selected ? (
        <div className="panel" data-testid="version-panel">
          <div className="tabs">
            {versions.map((v) => (
              <a key={v.id} className={v.id === selected.id ? "on" : ""} href={q({ stage, v: v.number })}>
                v{v.number}
                {v.decision === "APPROVED" ? " ✓" : v.decision === "CHANGES_REQUESTED" ? " ↺" : v.decision === "REJECTED" ? " ✕" : ""}
              </a>
            ))}
          </div>
          <p className="muted">
            Versiunea {selected.number} · {fmtDate(selected.createdAt)}
            {selected.decision && ` · decizie: ${selected.decision}`}
            {selected.decisionComment && ` — „${selected.decisionComment}”`}
          </p>
          {selected.inputFeedback && (
            <p className="msg ok">
              Feedback aplicat în această versiune: „{selected.inputFeedback}”
            </p>
          )}

          {files.length > 0 && (
            <div className="row">
              {files.map((f) =>
                f.url && f.mime?.startsWith("video/") ? (
                  <figure key={f.key} style={{ margin: 0 }}>
                    <video src={f.url} controls preload="metadata" style={{ maxHeight: 480 }} data-testid={`video-${f.kind}-${f.lang}`} />
                    <figcaption className="muted">{f.kind} {f.lang?.toUpperCase()}</figcaption>
                  </figure>
                ) : f.url && f.mime?.startsWith("audio/") ? (
                  <audio key={f.key} src={f.url} controls />
                ) : f.url && f.mime?.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={f.key} href={f.url} target="_blank" rel="noreferrer">
                    <img src={f.url} alt={`${f.kind} ${f.lang ?? ""}`} style={{ maxWidth: 420, borderRadius: 6 }} />
                  </a>
                ) : (
                  <span key={f.key} className="badge">
                    {f.kind}
                    {f.lang ? ` (${f.lang})` : ""}: {f.key}
                  </span>
                ),
              )}
            </div>
          )}

          <PayloadView stage={stage!} payload={selected.payload} />

          {versions.length > 1 && (
            <>
              <h3>Diff</h3>
              <div className="row">
                {versions
                  .filter((v) => v.id !== selected.id)
                  .map((v) => (
                    <a key={v.id} className="btn" href={q({ stage, v: selected.number, cmp: v.number })}>
                      compară cu v{v.number}
                    </a>
                  ))}
              </div>
              {compare && (
                <>
                  <p>
                    v{compare.number} → v{selected.number}
                  </p>
                  <VersionDiff before={compare.payload} after={selected.payload} />
                </>
              )}
            </>
          )}

          <details>
            <summary>JSON brut</summary>
            <pre>{JSON.stringify(selected.payload, null, 2)}</pre>
          </details>
        </div>
      ) : (
        <p className="muted">Nicio versiune încă.</p>
      )}
    </>
  );
}
