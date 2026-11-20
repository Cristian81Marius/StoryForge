import type { SocialPost } from "./schemas/agents";
import { REQUIRED_ATTRIBUTION, hasRequiredAttribution } from "./attribution";

/**
 * Postarea Metricool (format comun API REST /api/v2/scheduler/posts și MCP createScheduledPost).
 * Fiecare platformă devine o postare separată (titluri/descrieri diferite pe platformă).
 */
export interface MetricoolInfo {
  autoPublish: boolean;
  draft: boolean;
  text: string;
  media: string[];
  providers: Array<{ network: string }>;
  publicationDate: { dateTime: string; timezone: string };
  firstCommentText: string;
  shortener: boolean;
  smartLinkData: { ids: string[] };
  descendants: unknown[];
  hasNotReadNotes: boolean;
  mediaAltText: string[];
  youtubeData?: Record<string, unknown>;
  tiktokData?: Record<string, unknown>;
  instagramData?: Record<string, unknown>;
  facebookData?: Record<string, unknown>;
}

/** Textul postării: descrierea (cu atribuirea), CTA și hashtag-urile. */
export function postText(p: SocialPost): string {
  const parts = [p.description.trim()];
  if (p.cta && !p.description.includes(p.cta)) parts.push(p.cta.trim());
  const tags = p.hashtags.filter((h) => !p.description.includes(h));
  if (tags.length) parts.push(tags.join(" "));
  return parts.join("\n\n");
}

export function buildMetricoolInfo(p: SocialPost, o: { localDateTime: string; timezone: string; videoUrl: string }): MetricoolInfo {
  const info: MetricoolInfo = {
    autoPublish: true,
    draft: false,
    text: postText(p),
    media: [o.videoUrl],
    providers: [{ network: p.platform }],
    publicationDate: { dateTime: o.localDateTime, timezone: o.timezone },
    firstCommentText: "",
    shortener: false,
    smartLinkData: { ids: [] },
    descendants: [],
    hasNotReadNotes: false,
    mediaAltText: [],
  };
  switch (p.platform) {
    case "youtube":
      info.youtubeData = { title: p.title.slice(0, 100), type: "short", privacy: "public", tags: p.hashtags.map((h) => h.slice(1)), category: "FILM_ANIMATION", madeForKids: p.madeForKids, isAiGeneratedContent: p.aiGenerated };
      break;
    case "tiktok":
      info.tiktokData = { title: p.title, privacyOption: "PUBLIC_TO_EVERYONE", isAigc: p.aiGenerated, disableComment: false, disableDuet: false, disableStitch: false, autoAddMusic: false };
      break;
    case "instagram":
      info.instagramData = { type: "REEL", showReelOnFeed: true, isAiGenerated: p.aiGenerated };
      break;
    case "facebook":
      info.facebookData = { type: "REEL", title: p.title };
      break;
  }
  return info;
}

/** Garantează atribuirea obligatorie în descriere (o adaugă dacă agentul a omis-o). */
export function ensureAttribution(p: SocialPost, attribution: string, author: string, number: number): { post: SocialPost; added: boolean } {
  if (hasRequiredAttribution(p.description, p.lang, author, number)) return { post: p, added: false };
  return { post: { ...p, description: `${p.description.trim()}\n\n${attribution}` }, added: true };
}

export { REQUIRED_ATTRIBUTION };

// ---------------------------------------------------------------- fusuri orare, fără dependențe

/** Diferența (minute) dintre ora locală în `tz` și UTC, la momentul `at`. */
export function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(at)
    .reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** „2026-11-24T19:00” în fusul `tz` → momentul UTC (corect și la trecerea la ora de vară). */
export function zonedToUtc(localDateTime: string, tz: string): Date {
  const [d, t = "00:00"] = localDateTime.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  let ts = guess - tzOffsetMinutes(tz, new Date(guess)) * 60000;
  ts = guess - tzOffsetMinutes(tz, new Date(ts)) * 60000;
  return new Date(ts);
}

/** Momentul UTC → „YYYY-MM-DDTHH:mm:ss” în fusul `tz`. */
export function utcToLocal(at: Date, tz: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(at)
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** Ziua săptămânii (1 = luni … 7 = duminică) a momentului `at` în fusul `tz`. */
export function isoWeekday(at: Date, tz: string): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(at);
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd) + 1;
}

/**
 * Următorul slot de postare: prima zi din `postDays` (1–7) la ora `hour` în fusul canalului,
 * după `after` + `minLeadHours`. Platformele aceluiași episod se decalează cu `staggerMin`.
 */
export function nextPostSlot(after: Date, o: { postDays: number[]; hour: string; tz: string; minLeadHours?: number }): Date {
  const days = o.postDays.length ? o.postDays : [1, 2, 3, 4, 5, 6, 7];
  const earliest = new Date(after.getTime() + (o.minLeadHours ?? 2) * 3600_000);
  for (let i = 0; i < 15; i++) {
    const probe = new Date(earliest.getTime() + i * 86400_000);
    const localDay = utcToLocal(probe, o.tz).slice(0, 10);
    const slot = zonedToUtc(`${localDay}T${o.hour}`, o.tz);
    if (slot >= earliest && days.includes(isoWeekday(slot, o.tz))) return slot;
  }
  throw new Error("nu s-a găsit un slot de postare în următoarele 2 săptămâni");
}
