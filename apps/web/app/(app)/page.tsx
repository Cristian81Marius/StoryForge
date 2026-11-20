import Link from "next/link";
import { STORY_STATUSES, STATUS_LABEL, isReview, type StoryStatus } from "@storyforge/core";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/format";
import { excludeAction, moveAction, retryJobAction, startAction } from "../actions";

export default async function Dashboard() {
  const [counts, awaiting, queue, failed, running] = await Promise.all([
    prisma.story.groupBy({ by: ["status"], _count: true }),
    prisma.story.findMany({
      where: { status: { in: STORY_STATUSES.filter((s) => isReview(s)) as StoryStatus[] } },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.story.findMany({ where: { status: "NEW" }, orderBy: [{ position: "asc" }, { number: "asc" }], take: 50 }),
    prisma.job.findMany({ where: { status: "FAILED" }, include: { story: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.job.findMany({ where: { status: { in: ["QUEUED", "RUNNING", "WAITING_LIMIT"] } }, include: { story: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const count = (s: StoryStatus) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <>
      <h1>Dashboard</h1>

      <div className="grid" data-testid="status-counts">
        {STORY_STATUSES.filter((s) => count(s) > 0).map((s) => (
          <div className="stat" key={s}>
            <b>{count(s)}</b>
            <span>{STATUS_LABEL[s]}</span>
          </div>
        ))}
      </div>

      <h2>Așteaptă aprobarea mea ({awaiting.length})</h2>
      <div className="panel">
        {awaiting.length === 0 ? (
          <p className="muted">Nimic de aprobat.</p>
        ) : (
          <table data-testid="awaiting">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Titlu</th>
                <th>Etapă</th>
                <th>De când</th>
              </tr>
            </thead>
            <tbody>
              {awaiting.map((s) => (
                <tr key={s.id}>
                  <td>{s.number}</td>
                  <td>
                    <Link href={`/stories/${s.id}`}>{s.title}</Link>
                  </td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="muted">{fmtDate(s.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {failed.length > 0 && (
        <>
          <h2>Joburi eșuate ({failed.length})</h2>
          <div className="panel">
            <table data-testid="failed-jobs">
              <tbody>
                {failed.map((j) => (
                  <tr key={j.id}>
                    <td>{j.kind}</td>
                    <td>{j.story ? <Link href={`/stories/${j.story.id}`}>{j.story.title}</Link> : "—"}</td>
                    <td>
                      <pre style={{ margin: 0, maxHeight: 120 }}>{j.error}</pre>
                    </td>
                    <td>
                      <form action={retryJobAction}>
                        <input type="hidden" name="jobId" value={j.id} />
                        <input type="hidden" name="storyId" value={j.storyId ?? ""} />
                        <button className="small">Reîncearcă</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {running.length > 0 && (
        <>
          <h2>În lucru ({running.length})</h2>
          <div className="panel">
            <table>
              <tbody>
                {running.map((j) => (
                  <tr key={j.id}>
                    <td>{j.kind}</td>
                    <td>{j.story?.title ?? "—"}</td>
                    <td>
                      <span className="badge">{j.status}</span>
                    </td>
                    <td className="muted">{j.status === "WAITING_LIMIT" ? `reluare după ${fmtDate(j.runAfter)}` : fmtDate(j.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Coada ({count("NEW")})</h2>
      <div className="panel">
        <table data-testid="queue">
          <thead>
            <tr>
              <th>Ordine</th>
              <th>Nr.</th>
              <th>Titlu</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {queue.map((s, i) => (
              <tr key={s.id} style={s.excluded ? { opacity: 0.5 } : undefined} data-story={s.number}>
                <td>
                  <div className="row">
                    <form action={moveAction}>
                      <input type="hidden" name="storyId" value={s.id} />
                      <input type="hidden" name="dir" value="up" />
                      <button className="small" disabled={i === 0} aria-label="Mută sus">
                        ↑
                      </button>
                    </form>
                    <form action={moveAction}>
                      <input type="hidden" name="storyId" value={s.id} />
                      <input type="hidden" name="dir" value="down" />
                      <button className="small" disabled={i === queue.length - 1} aria-label="Mută jos">
                        ↓
                      </button>
                    </form>
                  </div>
                </td>
                <td>{s.number}</td>
                <td>
                  <Link href={`/stories/${s.id}`}>{s.title}</Link> {s.excluded && <span className="badge bad">exclusă</span>}
                </td>
                <td>
                  <div className="row">
                    <form action={excludeAction}>
                      <input type="hidden" name="storyId" value={s.id} />
                      <input type="hidden" name="excluded" value={s.excluded ? "0" : "1"} />
                      <button className="small">{s.excluded ? "Include" : "Exclude"}</button>
                    </form>
                    {!s.excluded && (
                      <form action={startAction}>
                        <input type="hidden" name="storyId" value={s.id} />
                        <button className="small">Pornește acum</button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
