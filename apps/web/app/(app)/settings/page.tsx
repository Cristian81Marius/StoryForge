import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { saveTemplateAction } from "@/app/settings-actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ flash?: string }> }) {
  const { flash } = await searchParams;
  const [channels, integrations, settings, books] = await Promise.all([
    prisma.channel.findMany(),
    prisma.integration.findMany(),
    prisma.settings.findUnique({ where: { id: "global" } }),
    prisma.book.findMany(),
  ]);
  return (
    <>
      <h1>Setări</h1>
      {flash && (
        <div className="msg ok" data-testid="flash">
          {flash.slice(0, 200)}
        </div>
      )}
      <p className="muted">Canalele, integrările și ritmul săptămânal devin editabile în fazele 4–6.</p>

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

      <h2>Template video (outro de brand)</h2>
      <form action={saveTemplateAction} className="panel" data-testid="template-form">
        <p className="muted">
          Outro-ul se lipește după cartela finală a skill-ului și conține atribuirea obligatorie (RO/EN, cu numărul și titlul istorioarei). Fonturile
          rămân cele ale canalului (Cinzel, Lora).
        </p>
        <div className="two">
          <label>
            Numele canalului
            <input type="text" name="brandName" defaultValue={(settings?.template as { brandName?: string })?.brandName ?? ""} maxLength={40} />
          </label>
          <label>
            Culoare de accent
            <input type="text" name="accent" placeholder="#ffd36b" defaultValue={(settings?.template as { accent?: string })?.accent ?? ""} />
          </label>
          <label>
            Slogan RO
            <input type="text" name="taglineRo" defaultValue={(settings?.template as { tagline?: { ro?: string } })?.tagline?.ro ?? ""} maxLength={60} />
          </label>
          <label>
            Slogan EN
            <input type="text" name="taglineEn" defaultValue={(settings?.template as { tagline?: { en?: string } })?.tagline?.en ?? ""} maxLength={60} />
          </label>
          <label>
            Durata outro (s)
            <input type="text" name="durationSec" defaultValue={String((settings?.template as { durationSec?: number })?.durationSec ?? 4)} />
          </label>
          <label>
            Logo (PNG/JPG/SVG, max 2 MB)
            <input type="file" name="logo" accept="image/png,image/jpeg,image/svg+xml" />
          </label>
        </div>
        {(settings?.template as { logoKey?: string })?.logoKey && (
          <p className="row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/files/${(settings!.template as { logoKey: string }).logoKey}`} alt="logo" style={{ height: 48 }} />
            <label>
              <input type="checkbox" name="removeLogo" /> elimină logo-ul
            </label>
          </p>
        )}
        <button className="primary">Salvează template-ul</button>
      </form>

      <h2>Ritm săptămânal</h2>
      <pre>{JSON.stringify(settings?.rhythm, null, 2)}</pre>
    </>
  );
}
