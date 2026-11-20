/** Logger JSON structurat, cu redactarea secretelor. Fără dependențe. */
const SECRET_KEY = /(token|secret|password|passwd|api[-_]?key|authorization|cookie|x-mc-auth|enc[-_]?key)/i;
const SECRET_VALUE = [
  /sk_[A-Za-z0-9_-]{8,}/g, // Speko
  /sk-ant-[A-Za-z0-9_-]{8,}/g, // Anthropic
  /Bearer\s+[A-Za-z0-9._-]{8,}/gi,
  /v1:[A-Za-z0-9+/=]{8,}:[A-Za-z0-9+/=]{8,}:[A-Za-z0-9+/=]+/g, // secrete criptate
];

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[depth]";
  if (typeof value === "string") {
    let s = value;
    for (const re of SECRET_VALUE) s = s.replace(re, "[REDACTED]");
    return s;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    return out;
  }
  return value;
}

export type LogLevel = "debug" | "info" | "warn" | "error";
export interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
  [k: string]: unknown;
}

export function makeLogger(base: Record<string, unknown> = {}, sink: (e: LogEntry) => void = (e) => console.log(JSON.stringify(e))) {
  const log = (level: LogLevel, msg: string, fields: Record<string, unknown> = {}) => {
    const entry = redact({ ts: new Date().toISOString(), level, msg, ...base, ...fields }) as LogEntry;
    sink(entry);
    return entry;
  };
  return {
    debug: (m: string, f?: Record<string, unknown>) => log("debug", m, f),
    info: (m: string, f?: Record<string, unknown>) => log("info", m, f),
    warn: (m: string, f?: Record<string, unknown>) => log("warn", m, f),
    error: (m: string, f?: Record<string, unknown>) => log("error", m, f),
    child: (more: Record<string, unknown>) => makeLogger({ ...base, ...more }, sink),
  };
}
export type Logger = ReturnType<typeof makeLogger>;
