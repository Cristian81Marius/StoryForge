"use client";

import { useActionState, useState } from "react";
import { decideAction } from "@/app/actions";

export function ReviewForm({ storyId, stageLabel }: { storyId: string; stageLabel: string }) {
  const [state, action, pending] = useActionState(decideAction, null);
  const [mode, setMode] = useState<"none" | "changes" | "reject">("none");

  return (
    <form action={action} className="panel" data-testid="review-form">
      <input type="hidden" name="storyId" value={storyId} />
      <h2 style={{ marginTop: 0 }}>Decizie: {stageLabel}</h2>
      {mode !== "none" && (
        <p>
          <label>
            {mode === "changes" ? "Ce trebuie schimbat (obligatoriu)" : "Motiv (opțional)"}
            <textarea name="comment" rows={4} data-testid="review-comment" placeholder={mode === "changes" ? "ex. scena 3: personajul principal mai mare; titlul mai scurt" : ""} />
          </label>
        </p>
      )}
      <div className="row">
        {mode === "none" && (
          <>
            <button className="primary" name="action" value="APPROVE" disabled={pending}>
              Aprobă
            </button>
            <button type="button" className="warn" onClick={() => setMode("changes")}>
              Cere modificări
            </button>
            <button type="button" className="danger" onClick={() => setMode("reject")}>
              Respinge
            </button>
          </>
        )}
        {mode === "changes" && (
          <>
            <button className="warn" name="action" value="REQUEST_CHANGES" disabled={pending}>
              Trimite la refacere
            </button>
            <button type="button" onClick={() => setMode("none")}>
              Anulează
            </button>
          </>
        )}
        {mode === "reject" && (
          <>
            <button className="danger" name="action" value="REJECT" disabled={pending}>
              Confirmă respingerea
            </button>
            <button type="button" onClick={() => setMode("none")}>
              Anulează
            </button>
          </>
        )}
      </div>
      {state && (
        <div className={`msg ${state.ok ? "ok" : "err"}`} role="status" data-testid="review-msg">
          {state.message}
        </div>
      )}
    </form>
  );
}
