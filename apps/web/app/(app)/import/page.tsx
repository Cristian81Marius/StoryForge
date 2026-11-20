import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { UploadForm } from "@/components/ImportForms";
import { purgeMockAction, startComoriImportAction } from "@/app/import-actions";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ flash?: string }> }) {
  const { flash } = await searchParams;
  const [imports, mockCount] = await Promise.all([
    prisma.bookImport.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: { id: true, source: true, fileName: true, status: true, progress: true, createdAt: true, report: true, error: true } }),
    prisma.story.count({ where: { title: { startsWith: "[MOCK]" } } }),
  ]);
  return (
    <>
      <h1>Import carte</h1>
      {flash && (
        <div className="msg ok" data-testid="flash">
          {flash.slice(0, 200)}
        </div>
      )}
      <p className="muted">
        Se importă DOAR textul istorioarelor: prefața, notele, ilustrațiile și adăugirile editoriale nu se folosesc. Împărțirea se verifică și se confirmă manual.
      </p>

      <div className="two">
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Din fișier</h2>
          <p className="muted">TXT, DOCX sau PDF. Fiecare istorioară începe cu un rând „Număr. Titlu”.</p>
          <UploadForm />
        </div>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>De pe comori-od.ro</h2>
          <p className="muted">Sursa folosită și de skill. Descărcare secvențială, ~10–15 minute pentru 600 (paginile se păstrează în cache). Rulează în worker.</p>
          <form action={startComoriImportAction} className="row">
            <label>
              Doar primele <input type="text" name="limit" placeholder="toate" style={{ width: 70 }} />
            </label>
            <button className="primary">Pornește importul</button>
          </form>
        </div>
      </div>

      {mockCount > 0 && (
        <div className="panel">
          <form action={purgeMockAction} className="row">
            <span>
              Există {mockCount} povești demo <code>[MOCK]</code> din faza 1.
            </span>
            <button className="danger small">Șterge datele demo</button>
          </form>
        </div>
      )}

      <h2>Importuri</h2>
      <div className="panel">
        <table data-testid="imports">
          <thead>
            <tr>
              <th>Când</th>
              <th>Sursă</th>
              <th>Status</th>
              <th>Istorioare</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {imports.map((i) => {
              const r = i.report as { total?: number; withWarnings?: number };
              return (
                <tr key={i.id}>
                  <td>{fmtDate(i.createdAt)}</td>
                  <td>
                    {i.source}
                    {i.fileName ? ` (${i.fileName})` : ""}
                  </td>
                  <td>
                    <span className={`badge ${i.status === "FAILED" ? "bad" : i.status === "CONFIRMED" ? "ok" : ""}`}>{i.status}</span>
                    {i.status === "FETCHING" && ` ${i.progress}%`}
                    {i.error && <div className="muted">{i.error}</div>}
                  </td>
                  <td>{r.total ? `${r.total} (${r.withWarnings ?? 0} cu avertismente)` : "—"}</td>
                  <td>
                    <Link href={`/import/${i.id}`}>deschide</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
