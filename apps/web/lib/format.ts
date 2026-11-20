export const fmtDate = (d: Date | string | null | undefined) =>
  d
    ? new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bucharest" }).format(new Date(d))
    : "—";
export const fmtUsd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;
export const fmtInt = (n: number) => new Intl.NumberFormat("ro-RO").format(n);
