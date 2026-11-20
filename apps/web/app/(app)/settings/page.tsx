import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";

export default async function SettingsPage() {
  const [channels, integrations, settings, books] = await Promise.all([
    prisma.channel.findMany(),
    prisma.integration.findMany(),
    prisma.settings.findUnique({ where: { id: "global" } }),
    prisma.book.findMany(),
  ]);
  return (
    <>
      <h1>Setări</h1>
      <p className="muted">Faza 1: doar afișare. Editarea, testul de conexiune și token-urile criptate vin în fazele 4–5.</p>

      <h2>Surse (cărți)</h2>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Carte</th>
              <th>Skill</th>
              <th>Animație</th>
              <th>Voce</th>
              <th>Atribuire RO</th>
            </tr>
          </thead>
          <tbody>
            {books.map((b) => (
              <tr key={b.id}>
                <td>
                  {b.title} — {b.author}
                </td>
                <td>{b.skillName}</td>
                <td>{b.animationProvider}</td>
                <td>{b.ttsProvider}</td>
                <td className="muted">{b.attributionRo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Canale</h2>
      <div className="panel">
        <table>
          <tbody>
            {channels.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.language}</td>
                <td>{c.platforms.join(", ")}</td>
                <td>{c.timezone}</td>
                <td className="muted">brand Metricool: {c.metricoolBrandId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Integrări</h2>
      <div className="panel">
        {integrations.length === 0 ? (
          <p className="muted">Nicio integrare configurată.</p>
        ) : (
          <table>
            <tbody>
              {integrations.map((i) => (
                <tr key={i.id}>
                  <td>{i.type}</td>
                  <td>{i.tokenEnc ? "token salvat (criptat)" : "fără token"}</td>
                  <td>
                    <span className="badge">{i.status}</span>
                  </td>
                  <td className="muted">verificat: {fmtDate(i.lastChecked)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2>Ritm săptămânal</h2>
      <pre>{JSON.stringify(settings?.rhythm, null, 2)}</pre>
    </>
  );
}
