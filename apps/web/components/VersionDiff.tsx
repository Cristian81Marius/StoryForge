import { diffLines } from "diff";

/** Diff pe linii între două payload-uri JSON (formatate stabil). */
export function VersionDiff({ before, after }: { before: unknown; after: unknown }) {
  const parts = diffLines(JSON.stringify(before, null, 2), JSON.stringify(after, null, 2));
  const changed = parts.filter((p) => p.added || p.removed).length;
  return (
    <div data-testid="diff">
      <p className="muted">{changed === 0 ? "Fără diferențe." : `${changed} blocuri modificate`}</p>
      <pre className="diff">
        {parts.map((p, i) =>
          p.added ? (
            <span key={i} className="add">
              {p.value}
            </span>
          ) : p.removed ? (
            <span key={i} className="del">
              {p.value}
            </span>
          ) : (
            // context scurtat: primele și ultimele 3 linii
            <span key={i}>{shorten(p.value)}</span>
          ),
        )}
      </pre>
    </div>
  );
}

function shorten(text: string) {
  const lines = text.split("\n");
  if (lines.length <= 8) return text;
  return [...lines.slice(0, 3), `   … ${lines.length - 6} linii neschimbate …`, ...lines.slice(-3)].join("\n");
}
