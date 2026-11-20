import Link from "next/link";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <nav className="nav">
        <Link className="brand" href="/">
          StoryForge
        </Link>
        <Link className="item" href="/">
          Dashboard
        </Link>
        <Link className="item" href="/import">
          Import
        </Link>
        <Link className="item" href="/calendar">
          Calendar
        </Link>
        <Link className="item" href="/usage">
          Usage
        </Link>
        <Link className="item" href="/settings">
          Setări
        </Link>
        <form action={logoutAction} style={{ marginTop: "1rem" }}>
          <button className="small">Ieșire</button>
        </form>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
