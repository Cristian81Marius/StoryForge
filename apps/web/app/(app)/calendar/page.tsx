import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";

export default async function CalendarPage() {
  const items = await prisma.schedule.findMany({ include: { story: true, channel: true }, orderBy: { scheduledAt: "asc" } });
  return (
    <>
      <h1>Calendar</h1>
      <p className="muted">Faza 1: listă. Mutarea postărilor și sincronizarea cu Metricool vin în faza 5.</p>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Când</th>
              <th>Canal</th>
              <th>Platformă</th>
              <th>Poveste</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td>{fmtDate(s.scheduledAt)}</td>
                <td>
                  {s.channel.name} ({s.channel.language})
                </td>
                <td>{s.platform}</td>
                <td>
                  <Link href={`/stories/${s.storyId}`}>{s.story.title}</Link>
                </td>
                <td>
                  <span className="badge">{s.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
