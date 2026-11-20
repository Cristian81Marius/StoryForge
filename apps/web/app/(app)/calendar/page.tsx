import Link from "next/link";
import { utcToLocal } from "@storyforge/core";
import { prisma } from "@/lib/db";
import { moveScheduleAction, markPublishedAction } from "@/app/calendar-actions";

type Payload = { post?: { title?: string; description?: string; hashtags?: string[]; cta?: string; musicSearchTerms?: string[] } };

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("ro-RO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ flash?: string; past?: string }> }) {
  const { flash, past } = await searchParams;
  const from = past ? new Date(Date.now() - 30 * 86400_000) : new Date(Date.now() - 86400_000);
  const [items, metricool] = await Promise.all([
    prisma.schedule.findMany({ where: { scheduledAt: { gte: from } }, include: { story: true, channel: true }, orderBy: { scheduledAt: "asc" } }),
    prisma.integration.findUnique({ where: { type: "METRICOOL" } }),
  ]);
  // grupare pe zile, în fusul canalului (ora afișată e ora publicului)
  const days = new Map<string, typeof items>();
  for (const s of items) {
    const d = utcToLocal(s.scheduledAt, s.channel.timezone).slice(0, 10);
    days.set(d, [...(days.get(d) ?? []), s]);
  }
  const sortedDays = [...days.keys()].sort();

  return (
    <>
      <h1>Calendar</h1>
      {flash && (
        <div className="msg ok" data-testid="flash">
          {flash.slice(0, 200)}
        </div>
      )}
      {metricool?.status === "EXPIRED" && (
        <div className="msg err" data-testid="expired">
          Conexiuni Metricool de refăcut: {metricool.lastError}. Reconectează rețelele în Metricool.
        </div>
      )}
      <p className="muted">
        Orele sunt în fusul orar al fiecărui canal. <Link href={past ? "/calendar" : "/calendar?past=1"}>{past ? "Doar viitoare" : "Include ultimele 30 de zile"}</Link>
      </p>
      {!items.length && <p className="muted">Nicio postare programată.</p>}
      {sortedDays.map((d) => (
        <div key={d} className="panel" data-testid="calendar-day">
          <h2 style={{ marginTop: 0, textTransform: "capitalize" }}>{dayLabel(d)}</h2>
          <table>
            <tbody>
              {days.get(d)!.map((s) => {
                const local = utcToLocal(s.scheduledAt, s.channel.timezone);
                const p = (s.payload as Payload).post;
                return (
                  <tr key={s.id} data-testid="schedule-row" data-status={s.status}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <b>{local.slice(11, 16)}</b>
                      <div className="muted">{s.channel.timezone}</div>
                    </td>
                    <td>
                      {s.platform} · {s.lang.toUpperCase()}
                      <div className="muted">{s.channel.name}</div>
                    </td>
                    <td>
                      <Link href={`/stories/${s.storyId}`}>
                        {s.story.number}. {s.story.title}
                      </Link>
                      {p?.title && <div className="muted">{p.title}</div>}
                    </td>
                    <td>
                      <span className={`badge ${s.status === "FAILED" ? "bad" : s.status === "SCHEDULED" || s.status === "PUBLISHED" ? "ok" : ""}`}>
                        {s.status}
                        {s.mode !== "MANUAL" ? ` · ${s.mode}` : ""}
                      </span>
                      {s.error && <div className="muted" style={{ maxWidth: 260 }}>{s.error}</div>}
                      {s.plannerUrl && (
                        <div>
                          <a href={s.plannerUrl} target="_blank" rel="noreferrer">
                            în Metricool
                          </a>
                        </div>
                      )}
                    </td>
                    <td>
                      <form action={moveScheduleAction} className="row">
                        <input type="hidden" name="id" value={s.id} />
                        <input type="datetime-local" name="when" defaultValue={local.slice(0, 16)} aria-label="Mută la" />
                        <button className="small">Mută</button>
                      </form>
                      {s.status === "MANUAL" && (
                        <>
                          {p && (
                            <details>
                              <summary>Text de copiat</summary>
                              <pre>{[p.title, "", p.description, "", p.cta, (p.hashtags ?? []).join(" "), p.musicSearchTerms?.length ? `\nMuzică: ${p.musicSearchTerms.join(", ")}` : ""].join("\n")}</pre>
                            </details>
                          )}
                          <form action={markPublishedAction}>
                            <input type="hidden" name="id" value={s.id} />
                            <button className="small">Am postat</button>
                          </form>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
