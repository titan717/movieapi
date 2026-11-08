/**
 * External subtitles (v1.2.1): GET /panda/subtitles/:imdb and GET /panda/subtitles/file.
 *
 * Search reads the OpenSubtitles catalogue through Stremio's public OpenSubtitles v3 add-on (no key,
 * one request per title or episode, files already re-encoded to UTF-8) and falls back to the
 * OpenSubtitles.org REST index, which Cloudflare often refuses from data-centre addresses. The file
 * route downloads the subtitle, decodes it, converts SRT to WebVTT and removes advertising cues (lines
 * with web addresses or "watch online" spam) so the caption layer never shows an ad. Only the two
 * download hosts are accepted (no SSRF).
 */
import { gunzipSync } from "node:zlib";

const SEARCH = "https://rest.opensubtitles.org/search";
const V3 = "https://opensubtitles-v3.strem.io/subtitles";
const DL_HOST = "https://dl.opensubtitles.org/";
const STREMIO_HOST = /^https:\/\/subs\d{0,2}\.strem\.io\/[a-z]{2}\/download\/[A-Za-z0-9/_.-]+$/;
const UA = "TemporaryUserAgent";
const TTL = 6 * 3_600_000;

/** ISO 639-1 → OpenSubtitles 639-2/B ids for the languages Panda offers. */
export const LANGS: Record<string, string> = {
  en: "eng", es: "spa", fr: "fre", de: "ger", it: "ita", pt: "por", hi: "hin", ar: "ara", ja: "jpn", ko: "kor",
  zh: "chi", ru: "rus", tr: "tur", nl: "dut", pl: "pol", sv: "swe", id: "ind", th: "tha", vi: "vie", ta: "tam",
  te: "tel", ml: "mal", bn: "ben", el: "ell", he: "heb", ro: "rum", cs: "cze", hu: "hun", uk: "ukr", fa: "per", ms: "may"
};
export const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian", pt: "Portuguese", hi: "Hindi", ar: "Arabic", ja: "Japanese", ko: "Korean",
  zh: "Chinese", ru: "Russian", tr: "Turkish", nl: "Dutch", pl: "Polish", sv: "Swedish", id: "Indonesian", th: "Thai", vi: "Vietnamese", ta: "Tamil",
  te: "Telugu", ml: "Malayalam", bn: "Bengali", el: "Greek", he: "Hebrew", ro: "Romanian", cs: "Czech", hu: "Hungarian", uk: "Ukrainian", fa: "Persian", ms: "Malay"
};
const ENCODINGS = new Set(["utf-8", "cp1250", "cp1251", "cp1252", "cp1253", "cp1254", "cp1255", "cp1256", "cp1257", "iso-8859-1", "iso-8859-2", "iso-8859-7", "koi8-r", "gbk", "gb18030", "big5", "shift_jis", "euc-kr", "windows-874", "cp874"]);

export interface SubtitleTrack {
  id: string;
  language: string;
  label: string;
  hearingImpaired: boolean;
  downloads: number;
  release: string;
  /** Relative API path that returns WebVTT. */
  file: string;
}

export const parseLangs = (v: string | undefined) => {
  const list = (v ?? "en").split(",").map((s) => s.trim().toLowerCase()).filter((s) => s in LANGS);
  return list.length ? [...new Set(list)].slice(0, 3) : null;
};

/** Download URL (dl.opensubtitles.org or subsN.strem.io) ⇄ URL-safe token. */
const allowed = (url: string) => !url.includes("..") && (STREMIO_HOST.test(url) || (url.startsWith(DL_HOST) && /^[a-z]{2}\/download\/[A-Za-z0-9/_.-]+$/.test(url.slice(DL_HOST.length))));
export const encodeFile = (url: string) => (allowed(url) ? Buffer.from(url.replace(/^https:\/\//, "")).toString("base64url") : null);
export const decodeFile = (token: string) => {
  if (!/^[A-Za-z0-9_-]{8,400}$/.test(token)) return null;
  const url = `https://${Buffer.from(token, "base64url").toString("utf8")}`;
  return allowed(url) ? url : null;
};

/** OpenSubtitles 639-2 codes (including the add-on's regional ones) → ISO 639-1. */
const FROM_OS: Record<string, string> = Object.fromEntries([...Object.entries(LANGS).map(([k, v]) => [v, k]), ["pob", "pt"], ["pom", "pt"], ["spn", "es"], ["spl", "es"], ["zht", "zh"], ["zhe", "zh"], ["gre", "el"], ["heb", "he"], ["fas", "fa"], ["msa", "ms"]]);

interface Row { id: string; url: string; lang: string; hi: boolean; downloads: number; release: string; enc: string; order: number }

const searchCache = new Map<string, { at: number; value: Row[] }>();

/** Best 4 subtitles per language: regular before hearing-impaired, then most downloaded / listed first. */
export function toTracks(rows: Row[], lang: string): SubtitleTrack[] {
  const out: SubtitleTrack[] = [];
  const list = rows.filter((r) => r.lang === lang).sort((a, b) => Number(a.hi) - Number(b.hi) || b.downloads - a.downloads || a.order - b.order);
  const seen = new Set<string>();
  for (const r of list) {
    const token = encodeFile(r.url);
    if (!token || seen.has(r.url)) continue;
    seen.add(r.url);
    const n = out.filter((t) => t.hearingImpaired === r.hi).length + 1;
    out.push({
      id: r.id, language: lang, label: `${LANG_NAMES[lang]}${r.hi ? " (SDH)" : ""}${n > 1 ? ` ${n}` : ""}`, hearingImpaired: r.hi, downloads: r.downloads, release: r.release,
      file: `/api/v1/panda/subtitles/file?f=${token}&enc=${encodeURIComponent(ENCODINGS.has(r.enc) ? r.enc : "utf-8")}`
    });
    if (out.length >= 4) break;
  }
  return out;
}

const isHi = (name: string) => /(^|[^a-z])(hi|sdh|cc)([^a-z]|$)/i.test(name.replace(/\.(srt|vtt)$/i, ""));

/** Stremio OpenSubtitles v3 add-on rows (already UTF-8). */
export function fromV3(raw: any): Row[] {
  return (Array.isArray(raw?.subtitles) ? raw.subtitles : []).map((r: any, i: number): Row | null => {
    const lang = FROM_OS[String(r?.lang ?? "")];
    if (!lang || typeof r?.url !== "string") return null;
    const name = String(r.subtitleFileName ?? "");
    return { id: `v3-${r.id ?? i}`, url: r.url, lang, hi: isHi(name), downloads: 0, release: String(r.movieReleaseName || name).trim().slice(0, 80), enc: "utf-8", order: i };
  }).filter((r: Row | null): r is Row => r !== null);
}

/** OpenSubtitles.org REST rows. */
export function fromRest(raw: any): Row[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((r) => r && (r.SubFormat === "srt" || r.SubFormat === "vtt") && String(r.SubSumCD ?? "1") === "1" && Number(r.SubBad ?? 0) === 0 && typeof r.SubDownloadLink === "string")
    .map((r, i): Row | null => {
      const lang = FROM_OS[String(r.SubLanguageID ?? "")] ?? (typeof r.ISO639 === "string" && r.ISO639 in LANGS ? r.ISO639 : null);
      if (!lang) return null;
      return { id: String(r.IDSubtitleFile), url: r.SubDownloadLink, lang, hi: r.SubHearingImpaired === "1", downloads: Number(r.SubDownloadsCnt ?? 0) || 0, release: String(r.MovieReleaseName || r.SubFileName || "").trim().slice(0, 80), enc: String(r.SubEncoding ?? "utf-8").toLowerCase(), order: i };
    }).filter((r): r is Row => r !== null);
}

/** REST rows of one language as tracks. */
export const pickTracks = (raw: any[], lang: string) => toTracks(fromRest(raw), lang);

async function getJson(url: string, fetchImpl: typeof fetch, timeout: number) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeout), headers: { "user-agent": UA, "x-user-agent": UA, accept: "application/json" } });
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) { await res.body?.cancel().catch(() => undefined); throw new Error(`${new URL(url).hostname} ${res.status}`); }
  return res.json();
}

/** Rows for a title or episode: the v3 add-on first (all languages in one call), then the REST index. */
async function rowsFor(imdb: string, season: number | null, episode: number | null, langs: string[], fetchImpl: typeof fetch): Promise<Row[]> {
  const ep = season && episode;
  let v3: Row[] = [];
  let v3Error: unknown = null;
  try { v3 = fromV3(await getJson(`${V3}/${ep ? "series" : "movie"}/${ep ? `${imdb}:${season}:${episode}` : imdb}.json`, fetchImpl, 6000)); } catch (e) { v3Error = e; }
  const missing = langs.filter((l) => !v3.some((r) => r.lang === l));
  if (!missing.length) return v3;
  const rest = await Promise.all(missing.map(async (lang) => {
    const parts = ep ? [`episode-${episode}`, `imdbid-${imdb.slice(2)}`, `season-${season}`] : [`imdbid-${imdb.slice(2)}`];
    try { return fromRest(await getJson(`${SEARCH}/${[...parts, `sublanguageid-${LANGS[lang]}`].join("/")}`, fetchImpl, 5000)); } catch { return null; }
  }));
  if (v3Error && rest.every((r) => r === null)) throw v3Error;
  return [...v3, ...rest.flatMap((r) => r ?? [])];
}

export async function searchSubtitles(imdb: string, season: number | null, episode: number | null, langs: string[], fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<SubtitleTrack[]> {
  const key = `${imdb}:${season ?? ""}:${episode ?? ""}:${[...langs].sort().join(",")}`;
  const hit = searchCache.get(key);
  let rows: Row[];
  if (hit && now - hit.at < TTL) rows = hit.value;
  else {
    try { rows = await rowsFor(imdb, season, episode, langs, fetchImpl); }
    catch (e) { if (hit) rows = hit.value; else throw e; }
    searchCache.set(key, { at: now, value: rows });
    if (searchCache.size > 3000) searchCache.delete(searchCache.keys().next().value as string);
  }
  return langs.flatMap((l) => toTracks(rows, l));
}

const AD = /(https?:\/\/|www\.|\.(com|org|net|link|xyz|io|tv|me|cc)\b|opensubtitles|\b(osdb|subscene|yts|yify)\b|advertise|watch (online|free)|movies and series for free|subtitles? (by|downloaded)|support us and become vip|rate this subtitle)/i;
const TIME = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/g;

/** SRT/VTT text → clean WebVTT: strips ads, formatting tags except i/b/u, and fixes timestamps. */
export function toVtt(input: string) {
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const blocks = text.split(/\n{2,}/);
  const cues: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const timing = lines[i].replace(TIME, (_m, h, m, s, ms) => `${h.padStart(2, "0")}:${m}:${s}.${String(ms).padEnd(3, "0")}`).replace(/\s+(align|position|line|size):\S+/g, "");
    if (!/^\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}$/.test(timing.trim())) continue;
    const body = lines.slice(i + 1).map((l) => l.replace(/\{\\[^}]*\}/g, "").replace(/<(?!\/?[ibu]>)[^>]*>/g, "").trim()).filter(Boolean);
    if (!body.length || body.some((l) => AD.test(l))) continue;
    cues.push(`${timing.trim()}\n${body.join("\n")}`);
  }
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

export function decode(buf: Uint8Array, enc: string) {
  const bytes = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
  // Files declared as legacy code pages are often really UTF-8; prefer UTF-8 when it decodes cleanly.
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { /* not UTF-8 */ }
  const label = enc.replace(/^cp(\d+)$/, "windows-$1");
  try { return new TextDecoder(label).decode(bytes); } catch { return new TextDecoder("windows-1252").decode(bytes); }
}

const fileCache = new Map<string, string>();

export async function subtitleFile(token: string, enc: string, fetchImpl: typeof fetch = fetch) {
  const url = decodeFile(token);
  if (!url) return null;
  const key = `${token}:${enc}`;
  const hit = fileCache.get(key);
  if (hit) return hit;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000), headers: { "user-agent": UA } });
  if (!res.ok) { await res.body?.cancel().catch(() => undefined); throw new Error(`download ${res.status}`); }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > 2_000_000) throw new Error("subtitle too large");
  const vtt = toVtt(decode(buf, ENCODINGS.has(enc) ? enc : "utf-8"));
  fileCache.set(key, vtt);
  if (fileCache.size > 200) fileCache.delete(fileCache.keys().next().value as string);
  return vtt;
}
