"use client";

import { useActionState } from "react";
import { loginAction } from "../actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="next" value={next} />
      <p>
        <label>
          Utilizator
          <input type="text" name="user" autoComplete="username" required />
        </label>
      </p>
      <p>
        <label>
          Parolă
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
      </p>
      <button className="primary" disabled={pending}>
        Intră
      </button>
      {state && !state.ok && <div className="msg err">{state.message}</div>}
    </form>
  );
}
