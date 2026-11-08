/**
 * External subtitles (v1.2.1): GET /panda/subtitles/:imdb and GET /panda/subtitles/file.
 *
 * Search uses the public OpenSubtitles.org REST index (no key) by IMDb id, optional season/episode and
 * language. The file route downloads the gzipped subtitle, decodes its declared encoding, converts SRT
 * to WebVTT and removes advertising cues (lines with web addresses or "watch online" spam) so the
 * caption layer never shows an ad. Only dl.opensubtitles.org download paths are accepted (no SSRF).
 */
import { gunzipSync } from "node:zlib";

const SEARCH = "https://rest.opensubtitles.org/search";
const DL_HOST = "https://dl.opensubtitles.org/";
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

/** dl.opensubtitles.org path ("en/download/src-api/vrf-…/file/123.gz") ⇄ URL-safe token. */
export const encodeFile = (url: string) => {
  if (!url.startsWith(DL_HOST)) return null;
  const path = url.slice(DL_HOST.length);
  return /^[a-z]{2}\/download\/[A-Za-z0-9/_.-]+$/.test(path) ? Buffer.from(path).toString("base64url") : null;
};
export const decodeFile = (token: string) => {
  if (!/^[A-Za-z0-9_-]{8,400}$/.test(token)) return null;
  const path = Buffer.from(token, "base64url").toString("utf8");
  return /^[a-z]{2}\/download\/[A-Za-z0-9/_.-]+$/.test(path) && !path.includes("..") ? DL_HOST + path : null;
};

const searchCache = new Map<string, { at: number; value: SubtitleTrack[] }>();

/** Best 4 single-file subtitles per language, most downloaded first, hearing-impaired versions after regular ones. */
export function pickTracks(raw: any[], lang: string): SubtitleTrack[] {
  const out: SubtitleTrack[] = [];
  const rows = (Array.isArray(raw) ? raw : [])
    .filter((r) => r && (r.SubFormat === "srt" || r.SubFormat === "vtt") && String(r.SubSumCD ?? "1") === "1" && Number(r.SubBad ?? 0) === 0 && typeof r.SubDownloadLink === "string")
    .sort((a, b) => (Number(a.SubHearingImpaired) - Number(b.SubHearingImpaired)) || Number(b.SubDownloadsCnt ?? 0) - Number(a.SubDownloadsCnt ?? 0));
  for (const r of rows) {
    const token = encodeFile(r.SubDownloadLink);
    if (!token) continue;
    const enc = String(r.SubEncoding ?? "utf-8").toLowerCase();
    const hi = r.SubHearingImpaired === "1";
    const n = out.filter((t) => t.hearingImpaired === hi).length + 1;
    out.push({
      id: String(r.IDSubtitleFile),
      language: lang,
      label: `${LANG_NAMES[lang]}${hi ? " (SDH)" : ""}${n > 1 ? ` ${n}` : ""}`,
      hearingImpaired: hi,
      downloads: Number(r.SubDownloadsCnt ?? 0) || 0,
      release: String(r.MovieReleaseName || r.SubFileName || "").trim().slice(0, 80),
      file: `/api/v1/panda/subtitles/file?f=${token}&enc=${encodeURIComponent(ENCODINGS.has(enc) ? enc : "utf-8")}`
    });
    if (out.length >= 4) break;
  }
  return out;
}

export async function searchSubtitles(imdb: string, season: number | null, episode: number | null, langs: string[], fetchImpl: typeof fetch = fetch, now = Date.now()) {
  const all = await Promise.all(langs.map(async (lang) => {
    const key = `${imdb}:${season ?? ""}:${episode ?? ""}:${lang}`;
    const hit = searchCache.get(key);
    if (hit && now - hit.at < TTL) return hit.value;
    const parts = season && episode ? [`episode-${episode}`, `imdbid-${imdb.slice(2)}`, `season-${season}`] : [`imdbid-${imdb.slice(2)}`];
    const url = `${SEARCH}/${[...parts, `sublanguageid-${LANGS[lang]}`].join("/")}`;
    let value: SubtitleTrack[] = [];
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(6000), headers: { "user-agent": UA, "x-user-agent": UA, accept: "application/json" } });
      if (res.ok && (res.headers.get("content-type") ?? "").includes("json")) value = pickTracks(await res.json(), lang);
      else { await res.body?.cancel().catch(() => undefined); throw new Error(`opensubtitles ${res.status}`); }
    } catch (e) {
      if (hit) return hit.value;
      throw e;
    }
    searchCache.set(key, { at: now, value });
    if (searchCache.size > 3000) searchCache.delete(searchCache.keys().next().value as string);
    return value;
  }));
  return all.flat();
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
