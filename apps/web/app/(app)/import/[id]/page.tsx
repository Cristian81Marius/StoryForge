import Link from "next/link";
import { notFound } from "next/navigation";
import type { ImportedStory, ImportReport } from "@storyforge/core/import";
import { prisma } from "@/lib/db";
import { ConfirmForm } from "@/components/ImportForms";
import { discardImportAction, toggleSkipAction } from "@/app/import-actions";

const PAGE = 50;

export default async function ImportPreview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ f?: string; p?: string; open?: string; flash?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const imp = await prisma.bookImport.findUnique({ where: { id } });
  if (!imp) notFound();

  const items = imp.items as unknown as ImportedStory[];
  const report = imp.report as unknown as ImportReport & { preamble?: string };
  const filter = sp.f === "warn" ? "warn" : sp.f === "skip" ? "skip" : "all";
  const shown = items.filter((s) => (filter === "warn" ? s.warnings.length > 0 : filter === "skip" ? s.skip : true));
  const page = Math.max(0, Number(sp.p ?? 0));
  const slice = shown.slice(page * PAGE, page * PAGE + PAGE);
  const open = sp.open ? Number(sp.open) : null;
  const q = (o: Record<string, string | number | undefined>) =>
    "?" + Object.entries({ f: filter, p: page, ...o }).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${v}`).join("&");

  return (
    <>
      <p>
        <Link href="/import">← Importuri</Link>
      </p>
      <h1>
        Import {imp.source} <span className="badge">{imp.status}</span>
      </h1>
      {sp.flash && (
        <div className="msg ok" data-testid="flash">
          {sp.flash.slice(0, 300)}
        </div>
      )}

      {imp.status === "FETCHING" && (
        <div className="panel">
          <p>
            Descărcare în curs: <b>{imp.progress}%</b>. Reîncarcă pagina pentru progres. (Workerul trebuie să ruleze.)
          </p>
        </div>
      )}
      {imp.status === "FAILED" && <div className="msg err">{imp.error}</div>}

      {items.length > 0 && (
        <>
          <div className="grid" data-testid="import-report">
            <div className="stat">
              <b>{report.total}</b>
              <span>istorioare găsite (din {report.expected})</span>
            </div>
            <div className="stat">
              <b>{report.missing?.length ?? 0}</b>
              <span>numere lipsă</span>
            </div>
            <div className="stat">
              <b>{report.duplicates?.length ?? 0}</b>
              <span>duplicate</span>
            </div>
            <div className="stat">
              <b>{report.withWarnings}</b>
              <span>cu avertismente</span>
            </div>
            <div className="stat">
              <b>{items.filter((s) => s.skip).length}</b>
              <span>excluse de tine</span>
            </div>
          </div>
          {report.missing?.length > 0 && (
            <p className="msg err">
              Lipsă: {report.missing.slice(0, 60).join(", ")}
              {report.missing.length > 60 ? "…" : ""}
            </p>
          )}
          {report.preamble && (
            <details className="panel">
              <summary>Text ignorat dinaintea primei istorioare (prefață)</summary>
              <pre>{report.preamble}</pre>
            </details>
          )}

          {imp.status === "PREVIEW" && <ConfirmForm importId={imp.id} blocking={report.blocking ?? []} />}

          <div className="tabs">
            <a className={filter === "all" ? "on" : ""} href={q({ f: "all", p: 0 })}>
              Toate ({items.length})
            </a>
            <a className={filter === "warn" ? "on" : ""} href={q({ f: "warn", p: 0 })}>
              Cu avertismente ({items.filter((s) => s.warnings.length).length})
            </a>
            <a className={filter === "skip" ? "on" : ""} href={q({ f: "skip", p: 0 })}>
              Excluse ({items.filter((s) => s.skip).length})
            </a>
          </div>

          <div className="panel">
            <table data-testid="import-items">
              <thead>
                <tr>
                  <th>Nr.</th>
                  <th>Titlu</th>
                  <th>Început</th>
                  <th>Caractere</th>
                  <th>Avertismente</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {slice.map((s) => (
                  <tr key={s.number} data-number={s.number} style={s.skip ? { opacity: 0.5 } : undefined}>
                    <td>{s.number}</td>
                    <td>
                      <a href={q({ open: open === s.number ? "" : s.number })}>{s.title}</a>
                    </td>
                    <td className="muted" style={{ maxWidth: 380 }}>
                      {open === s.number ? <div className="source">{s.text}</div> : `${s.text.slice(0, 140)}${s.text.length > 140 ? "…" : ""}`}
                    </td>
                    <td>{s.text.length}</td>
                    <td>
                      {s.warnings.map((w, i) => (
                        <div key={i} className="badge bad" style={{ marginBottom: 2 }}>
                          {w}
                        </div>
                      ))}
                    </td>
                    <td>
                      {imp.status === "PREVIEW" && (
                        <form action={toggleSkipAction}>
                          <input type="hidden" name="importId" value={imp.id} />
                          <input type="hidden" name="number" value={s.number} />
                          <input type="hidden" name="skip" value={s.skip ? "0" : "1"} />
                          <button className="small">{s.skip ? "Include" : "Exclude"}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row" style={{ marginTop: ".6rem" }}>
              {page > 0 && (
                <a className="btn" href={q({ p: page - 1 })}>
                  ← Anterioarele
                </a>
              )}
              <span className="muted">
                {shown.length ? `${page * PAGE + 1}–${Math.min(shown.length, (page + 1) * PAGE)} din ${shown.length}` : "nimic"}
              </span>
              {(page + 1) * PAGE < shown.length && (
                <a className="btn" href={q({ p: page + 1 })}>
                  Următoarele →
                </a>
              )}
            </div>
          </div>
        </>
      )}

      {(imp.status === "PREVIEW" || imp.status === "FAILED") && (
        <form action={discardImportAction}>
          <input type="hidden" name="importId" value={imp.id} />
          <button className="small">Anulează importul</button>
        </form>
      )}
    </>
  );
}
