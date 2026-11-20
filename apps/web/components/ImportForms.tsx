"use client";

import { useActionState } from "react";
import { confirmImportAction, uploadBookAction } from "@/app/import-actions";

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadBookAction, null);
  return (
    <form action={action} data-testid="upload-form">
      <div className="row">
        <input type="file" name="file" accept=".txt,.docx,.pdf" aria-label="Fișierul cărții" required />
        <button className="primary" disabled={pending}>
          {pending ? "Se citește…" : "Încarcă și previzualizează"}
        </button>
      </div>
      {state && !state.ok && <div className="msg err">{state.message}</div>}
    </form>
  );
}

export function ConfirmForm({ importId, blocking }: { importId: string; blocking: string[] }) {
  const [state, action, pending] = useActionState(confirmImportAction, null);
  return (
    <form action={action} className="panel" data-testid="confirm-form">
      <input type="hidden" name="importId" value={importId} />
      <h2 style={{ marginTop: 0 }}>Confirmare</h2>
      <p className="muted">
        La confirmare, istorioarele intră în coadă în ordinea numerelor. Cele deja în producție nu sunt atinse.
      </p>
      {blocking.length > 0 && (
        <p>
          <label>
            <input type="checkbox" name="force" /> Am verificat problemele ({blocking.join("; ")}) și confirm oricum
          </label>
        </p>
      )}
      <button className="primary" disabled={pending}>
        Confirmă împărțirea și adaugă în coadă
      </button>
      {state && !state.ok && (
        <div className="msg err" role="status">
          {state.message}
        </div>
      )}
    </form>
  );
}
