import { INTEGRATIONS } from "@storyforge/core/services";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { saveTemplateAction } from "@/app/settings-actions";
import { setTtsProviderAction } from "@/app/voice-actions";
import { saveChannelAction, saveIntegrationAction, saveRhythmAction, testIntegrationAction } from "@/app/integration-actions";

const DAYS = ["", "Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];
const PLATFORMS = ["tiktok", "instagram", "youtube", "facebook"] as const;

type Tpl = { brandName?: string; accent?: string; tagline?: { ro?: string; en?: string }; durationSec?: number; logoKey?: string; musicKey?: string; musicVolumeDb?: number };
type Rhythm = { storiesPerWeek?: number; days?: number[]; hour?: string; timezone?: string; postDays?: number[]; postHour?: string };
type Thr = { weeklyCostUsd?: number | null; monthlyCostUsd?: number | null; weeklyTokens?: number | null };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ flash?: string }> }) {
  const { flash } = await searchParams;
  const [channels, integrations, settings, books] = await Promise.all([
    prisma.channel.findMany({ orderBy: { language: "desc" } }),
    prisma.integration.findMany(),
    prisma.settings.findUnique({ where: { id: "global" } }),
    prisma.book.findMany(),
  ]);
  const tpl = (settings?.template ?? {}) as Tpl;
  const rhythm = (settings?.rhythm ?? {}) as Rhythm;
  const thr = (settings?.thresholds ?? {}) as Thr;
  const integ = (t: keyof typeof INTEGRATIONS) => integrations.find((i) => i.type === t);
  const cfg = (t: keyof typeof INTEGRATIONS) => (integ(t)?.config ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  return (
    <>
      <h1>Setări</h1>
      {flash && (
        <div className="msg ok" data-testid="flash">
          {flash.slice(0, 300)}
        </div>
      )}

      <h2>Surse (cărți)</h2>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Carte</th>
              <th>Skill</th>
              <th>Animație</th>
              <th>Voce</th>
              <th>Atribuire RO / EN</th>
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
                <td>
                  <form action={setTtsProviderAction} className="row">
                    <input type="hidden" name="bookId" value={b.id} />
                    <select name="ttsProvider" defaultValue={b.ttsProvider}>
                      <option value="speko">Speko</option>
                      <option value="manual">upload manual</option>
                    </select>
                    <button className="small">OK</button>
                  </form>
                </td>
                <td className="muted">
                  {b.attributionRo}
                  <br />
                  {b.attributionEn}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Canale (limbă → brand Metricool)</h2>
      {[...channels, null].map((c) => (
        <form key={c?.id ?? "new"} action={saveChannelAction} className="panel" data-testid={c ? `channel-${c.language}` : "channel-new"}>
          <input type="hidden" name="id" value={c?.id ?? ""} />
          <div className="row">
            <b>{c ? c.name : "Canal nou"}</b>
          </div>
          <div className="two">
            <label>
              Nume
              <input type="text" name="name" defaultValue={c?.name ?? ""} />
            </label>
            <label>
              Limbă (ro / en)
              <input type="text" name="language" defaultValue={c?.language ?? "ro"} />
            </label>
            <label>
              ID brand Metricool (blogId)
              <input type="text" name="metricoolBrandId" defaultValue={c?.metricoolBrandId ?? ""} />
            </label>
            <label>
              Fus orar al publicului
              <input type="text" name="timezone" defaultValue={c?.timezone ?? ""} placeholder="Europe/Bucharest" />
            </label>
          </div>
          <p className="row">
            {PLATFORMS.map((p) => (
              <label key={p}>
                <input type="checkbox" name={`p_${p}`} defaultChecked={c ? c.platforms.includes(p) : true} /> {p}
              </label>
            ))}
            <label>
              <input type="checkbox" name="active" defaultChecked={c?.active ?? true} /> activ
            </label>
          </p>
          <button className="small">{c ? "Salvează canalul" : "Adaugă canal"}</button>
        </form>
      ))}

      <h2 id="integrari">Integrări</h2>
      <p className="muted">
        Doar token-uri API, criptate în baza de date (AES-GCM). Token-ul nu se mai afișează după salvare. Conectarea TikTok / Instagram / YouTube / Facebook se face în
        Metricool, de tine (OAuth).
      </p>
      {(["SPEKO", "METRICOOL", "SMTP"] as const).map((t) => {
        const i = integ(t);
        const c = cfg(t);
        return (
          <div key={t} className="panel" data-testid={`integration-${t}`}>
            <div className="row">
              <b>{INTEGRATIONS[t].label}</b>
              <span className={`badge ${i?.status === "OK" ? "ok" : i?.status === "EXPIRED" || i?.status === "ERROR" ? "bad" : ""}`}>{i?.status ?? "NECONFIGURAT"}</span>
              <span className="muted">
                {c.tokenHint ? `token ${c.tokenHint}` : "fără token"} · verificat: {fmtDate(i?.lastChecked)}
              </span>
            </div>
            {i?.lastError && <p className="msg err">{i.lastError}</p>}
            <form action={saveIntegrationAction}>
              <input type="hidden" name="type" value={t} />
              <div className="two">
                <label>
                  {INTEGRATIONS[t].tokenLabel} <span className="muted">({INTEGRATIONS[t].help})</span>
                  <input type="password" name="token" autoComplete="off" placeholder={c.tokenHint ? "lasă gol ca să păstrezi token-ul" : ""} />
                </label>
                {t === "SPEKO" && (
                  <>
                    <label>
                      Voce RO (id) · provider
                      <span className="row">
                        <input type="text" name="voiceRo" defaultValue={c.voices?.ro?.voice ?? ""} placeholder="din voci.json: Cartesia „Andrei”" style={{ flex: 2 }} />
                        <input type="text" name="providerRo" defaultValue={c.voices?.ro?.provider ?? ""} placeholder="cartesia" style={{ flex: 1 }} />
                      </span>
                    </label>
                    <label>
                      Voce EN (id) · provider
                      <span className="row">
                        <input type="text" name="voiceEn" defaultValue={c.voices?.en?.voice ?? ""} placeholder="neaprobată încă" style={{ flex: 2 }} />
                        <input type="text" name="providerEn" defaultValue={c.voices?.en?.provider ?? ""} style={{ flex: 1 }} />
                      </span>
                    </label>
                  </>
                )}
                {t === "METRICOOL" && (
                  <>
                    <label>
                      Mod de programare
                      <input type="text" name="mode" defaultValue={c.mode ?? "manual"} placeholder="manual | mcp | api" />
                    </label>
                    <label>
                      userId Metricool (pentru API)
                      <input type="text" name="userId" defaultValue={c.userId ?? ""} />
                    </label>
                    <label>
                      URL public pentru media (obligatoriu la api/mcp)
                      <input type="text" name="publicMediaBaseUrl" defaultValue={c.publicMediaBaseUrl ?? ""} placeholder="https://media.exemplu.ro/" />
                    </label>
                    <label>
                      Limită postări / lună (Free: 20)
                      <input type="text" name="monthlyPostLimit" defaultValue={c.monthlyPostLimit ?? 20} />
                    </label>
                  </>
                )}
                {t === "SMTP" && (
                  <>
                    <label>
                      Expeditor (domeniu verificat în Resend)
                      <input type="text" name="from" defaultValue={c.from ?? ""} placeholder="StoryForge <notificari@domeniul-tau.ro>" />
                    </label>
                    <label>
                      Destinatar notificări
                      <input type="text" name="to" defaultValue={c.to ?? settings?.notifyEmail ?? ""} />
                    </label>
                  </>
                )}
              </div>
              <p className="row">
                <button className="small primary">Salvează</button>
                {c.tokenHint && (
                  <label>
                    <input type="checkbox" name="clearToken" /> șterge token-ul
                  </label>
                )}
              </p>
            </form>
            {c.tokenHint && (
              <form action={testIntegrationAction}>
                <input type="hidden" name="type" value={t} />
                <button className="small">Testează conexiunea</button>
              </form>
            )}
          </div>
        );
      })}

      <h2>Template video (outro de brand)</h2>
      <form action={saveTemplateAction} className="panel" data-testid="template-form">
        <p className="muted">
          Outro-ul se lipește după cartela finală a skill-ului și conține atribuirea obligatorie (RO/EN, cu numărul și titlul istorioarei). Fonturile rămân cele ale
          canalului (Cinzel, Lora).
        </p>
        <div className="two">
          <label>
            Numele canalului
            <input type="text" name="brandName" defaultValue={tpl.brandName ?? ""} maxLength={40} />
          </label>
          <label>
            Culoare de accent
            <input type="text" name="accent" placeholder="#ffd36b" defaultValue={tpl.accent ?? ""} />
          </label>
          <label>
            Slogan RO
            <input type="text" name="taglineRo" defaultValue={tpl.tagline?.ro ?? ""} maxLength={60} />
          </label>
          <label>
            Slogan EN
            <input type="text" name="taglineEn" defaultValue={tpl.tagline?.en ?? ""} maxLength={60} />
          </label>
          <label>
            Durata outro (s)
            <input type="text" name="durationSec" defaultValue={String(tpl.durationSec ?? 4)} />
          </label>
          <label>
            Logo (PNG/JPG/SVG, max 2 MB)
            <input type="file" name="logo" accept="image/png,image/jpeg,image/svg+xml" />
          </label>
          <label>
            Muzică de fundal proprie (opțional, MP3/M4A/WAV, max 20 MB)
            <input type="file" name="music" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav" />
          </label>
          <label>
            Volumul muzicii (dB sub voce, ex. -22)
            <input type="text" name="musicVolumeDb" defaultValue={String(tpl.musicVolumeDb ?? -22)} />
          </label>
        </div>
        <p className="muted">
          Skill-ul recomandă muzica din bibliotecile platformelor (fără reclamații Content ID). Folosește muzică proprie doar dacă ai drepturile.
        </p>
        <p className="row">
          {tpl.logoKey && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/${tpl.logoKey}`} alt="logo" style={{ height: 48 }} />
              <label>
                <input type="checkbox" name="removeLogo" /> elimină logo-ul
              </label>
            </>
          )}
          {tpl.musicKey && (
            <>
              <audio src={`/api/files/${tpl.musicKey}`} controls />
              <label>
                <input type="checkbox" name="removeMusic" /> fără muzică
              </label>
            </>
          )}
        </p>
        <button className="primary">Salvează template-ul</button>
      </form>

      <h2>Ritm săptămânal și praguri</h2>
      <form action={saveRhythmAction} className="panel" data-testid="rhythm-form">
        <div className="two">
          <label>
            Povești pe săptămână (pe canal)
            <input type="text" name="storiesPerWeek" defaultValue={String(rhythm.storiesPerWeek ?? 1)} />
          </label>
          <label>
            Ora pornirii scenariilor (HH:mm)
            <input type="text" name="hour" defaultValue={rhythm.hour ?? "09:00"} />
          </label>
          <label>
            Fus orar
            <input type="text" name="timezone" defaultValue={rhythm.timezone ?? "Europe/Bucharest"} />
          </label>
          <label>
            Ora implicită a postărilor (HH:mm, fusul canalului)
            <input type="text" name="postHour" defaultValue={rhythm.postHour ?? "19:00"} />
          </label>
        </div>
        <p className="row">
          Zile pornire:
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <label key={d}>
              <input type="checkbox" name={`d_${d}`} defaultChecked={(rhythm.days ?? [2]).includes(d)} /> {DAYS[d]}
            </label>
          ))}
        </p>
        <p className="row">
          Zile postare:
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <label key={d}>
              <input type="checkbox" name={`pd_${d}`} defaultChecked={(rhythm.postDays ?? [2, 3, 4]).includes(d)} /> {DAYS[d]}
            </label>
          ))}
        </p>
        <div className="two">
          <label>
            Prag cost / săptămână (USD echivalent)
            <input type="text" name="weeklyCostUsd" defaultValue={String(thr.weeklyCostUsd ?? "")} />
          </label>
          <label>
            Prag cost / lună (USD echivalent)
            <input type="text" name="monthlyCostUsd" defaultValue={String(thr.monthlyCostUsd ?? "")} />
          </label>
          <label>
            Prag tokens / săptămână
            <input type="text" name="weeklyTokens" defaultValue={String(thr.weeklyTokens ?? "")} />
          </label>
          <label>
            Email pentru notificări
            <input type="text" name="notifyEmail" defaultValue={settings?.notifyEmail ?? ""} />
          </label>
        </div>
        <button className="primary">Salvează</button>
      </form>
    </>
  );
}
