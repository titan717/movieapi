/**
 * Smart search helpers for Panda.fun (app v1.1.1).
 * - interpretQuery: turns plain requests such as "hindi movies", "korean dramas", "90s action" or
 *   "best horror films" into a TMDB discover request. It only fires when every word is understood.
 * - fuzzy helpers: when a title search finds nothing, shorter variants of the query are tried and
 *   results are kept only if their title is close to what was typed ("intersteller" -> Interstellar).
 */
import type { MediaType } from "./service.js";

export interface Interpretation {
  type: MediaType;
  lang?: string;
  genre?: string;
  from?: string;
  to?: string;
  sort?: string;
  minVotes?: number;
  /** Human label, e.g. "Hindi Movies" or "Action Movies from the 1990s". */
  label: string;
}

const LANGS: Record<string, string> = {
  english: "en", hindi: "hi", malayalam: "ml", tamil: "ta", telugu: "te", kannada: "kn", bengali: "bn", marathi: "mr",
  korean: "ko", japanese: "ja", spanish: "es", french: "fr", german: "de", italian: "it", chinese: "zh", portuguese: "pt",
  turkish: "tr", thai: "th", russian: "ru", punjabi: "pa", gujarati: "gu",
  bollywood: "hi", tollywood: "te", kollywood: "ta", mollywood: "ml", sandalwood: "kn"
};
const LANG_NAMES: Record<string, string> = {
  en: "English", hi: "Hindi", ml: "Malayalam", ta: "Tamil", te: "Telugu", kn: "Kannada", bn: "Bengali", mr: "Marathi",
  ko: "Korean", ja: "Japanese", es: "Spanish", fr: "French", de: "German", it: "Italian", zh: "Chinese", pt: "Portuguese",
  tr: "Turkish", th: "Thai", ru: "Russian", pa: "Punjabi", gu: "Gujarati"
};

/** Genre words -> TMDB ids for movies and for TV (TV lists merge some genres). */
const GENRES: Record<string, { name: string; movie: string; tv: string }> = {
  action: { name: "Action", movie: "28", tv: "10759" },
  adventure: { name: "Adventure", movie: "12", tv: "10759" },
  animation: { name: "Animated", movie: "16", tv: "16" },
  comedy: { name: "Comedy", movie: "35", tv: "35" },
  crime: { name: "Crime", movie: "80", tv: "80" },
  documentary: { name: "Documentary", movie: "99", tv: "99" },
  drama: { name: "Drama", movie: "18", tv: "18" },
  family: { name: "Family", movie: "10751", tv: "10751" },
  fantasy: { name: "Fantasy", movie: "14", tv: "10765" },
  history: { name: "History", movie: "36", tv: "10768" },
  horror: { name: "Horror", movie: "27", tv: "9648" },
  music: { name: "Music", movie: "10402", tv: "" },
  mystery: { name: "Mystery", movie: "9648", tv: "9648" },
  romance: { name: "Romance", movie: "10749", tv: "18" },
  scifi: { name: "Sci-Fi", movie: "878", tv: "10765" },
  thriller: { name: "Thriller", movie: "53", tv: "9648" },
  war: { name: "War", movie: "10752", tv: "10768" },
  western: { name: "Western", movie: "37", tv: "37" },
  kids: { name: "Kids", movie: "10751", tv: "10762" },
  reality: { name: "Reality", movie: "", tv: "10764" }
};
const GENRE_WORDS: Record<string, string> = {
  action: "action", adventure: "adventure", adventures: "adventure", animated: "animation", animation: "animation", cartoon: "animation", cartoons: "animation",
  comedy: "comedy", comedies: "comedy", funny: "comedy", crime: "crime", documentary: "documentary", documentaries: "documentary", docs: "documentary",
  drama: "drama", dramas: "drama", family: "family", fantasy: "fantasy", history: "history", historical: "history", horror: "horror", scary: "horror",
  music: "music", musical: "music", musicals: "music", mystery: "mystery", mysteries: "mystery", romance: "romance", romantic: "romance", love: "romance",
  scifi: "scifi", thriller: "thriller", thrillers: "thriller", suspense: "thriller", war: "war", western: "western", westerns: "western",
  kids: "kids", children: "kids", reality: "reality"
};
const MOVIE_WORDS = new Set(["movie", "movies", "film", "films", "cinema"]);
const TV_WORDS = new Set(["show", "shows", "series", "tv", "serial", "serials", "webseries"]);
const BEST_WORDS = new Set(["best", "top", "greatest", "classic", "classics", "acclaimed", "rated"]);
const NEW_WORDS = new Set(["new", "latest", "recent", "fresh"]);
const FILLER = new Set(["the", "a", "of", "in", "and", "with", "from", "good", "popular", "some", "all", "to", "watch", "for", "me", "language"]);

export function normalize(q: string) {
  return q.toLowerCase()
    .replace(/sci[\s-]?fi|science fiction/g, "scifi")
    .replace(/\bk[\s-]?dramas?\b/g, "korean drama shows")
    .replace(/web series/g, "webseries")
    .replace(/top rated/g, "best")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/'s\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function interpretQuery(raw: string, now = new Date()): Interpretation | null {
  const words = normalize(raw).split(" ").filter(Boolean);
  if (!words.length || words.length > 7) return null;
  let type: MediaType | null = null, lang: string | undefined, genre: string | undefined, from: string | undefined, to: string | undefined;
  let best = false, fresh = false, anime = false, decadeLabel = "";
  for (const w of words) {
    if (MOVIE_WORDS.has(w)) { type = type ?? "movie"; continue; }
    if (TV_WORDS.has(w)) { type = "tv"; continue; }
    if (LANGS[w]) { if (lang && lang !== LANGS[w]) return null; lang = LANGS[w]; continue; }
    if (GENRE_WORDS[w]) { if (genre && genre !== GENRE_WORDS[w]) return null; genre = GENRE_WORDS[w]; continue; }
    if (w === "anime") { anime = true; continue; }
    if (BEST_WORDS.has(w)) { best = true; continue; }
    if (NEW_WORDS.has(w)) { fresh = true; continue; }
    if (FILLER.has(w)) continue;
    const dec = /^(?:(19|20)?(\d)0)s$/.exec(w);
    if (dec) {
      const century = dec[1] ?? (Number(dec[2]) >= 3 ? "19" : "20");
      const start = Number(`${century}${dec[2]}0`);
      from = `${start}-01-01`; to = `${start + 9}-12-31`; decadeLabel = `from the ${start}s`;
      continue;
    }
    const yr = /^(19[2-9]\d|20[0-4]\d)$/.exec(w);
    if (yr) { from = `${yr[1]}-01-01`; to = `${yr[1]}-12-31`; decadeLabel = `from ${yr[1]}`; continue; }
    return null; // a word we don't understand: treat the query as a title search
  }
  if (anime) { lang = lang ?? "ja"; genre = genre ?? "animation"; type = type ?? "tv"; }
  if (!lang && !genre && !from) return null; // "movies" or "best shows" alone stay title searches
  const t: MediaType = type ?? (genre === "reality" ? "tv" : "movie");
  const g = genre ? GENRES[genre] : undefined;
  const gid = g ? (t === "movie" ? g.movie : g.tv) : undefined;
  const langLabel = lang && !(anime && lang === "ja") ? LANG_NAMES[lang] : "";
  const genreLabel = anime ? "Anime" : g?.name ?? "";
  const typeLabel = anime && t === "tv" ? "" : t === "movie" ? "Movies" : "Shows";
  const parts = [best ? "Top Rated" : fresh ? "New" : "", langLabel, genreLabel, typeLabel].filter(Boolean);
  const label = [parts.join(" "), decadeLabel].filter(Boolean).join(" ");
  const today = now.toISOString().slice(0, 10);
  const yearAgo = new Date(now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
  return {
    type: t,
    lang,
    genre: gid || undefined,
    from: fresh && !from ? yearAgo : from,
    to: to && to > today ? today : to,
    sort: best ? "vote_average.desc" : undefined,
    minVotes: best ? (lang && lang !== "en" ? 50 : 500) : lang && lang !== "en" ? 5 : 30,
    label
  };
}

/* ---------- fuzzy title matching ---------- */

function bigrams(s: string) {
  const t = ` ${normalize(s).replace(/\s+/g, " ")} `;
  const out = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) { const b = t.slice(i, i + 2); out.set(b, (out.get(b) ?? 0) + 1); }
  return out;
}

/** Dice similarity of letter pairs, 0..1. */
export function similarity(a: string, b: string) {
  const x = bigrams(a), y = bigrams(b);
  let inter = 0, nx = 0, ny = 0;
  for (const v of x.values()) nx += v;
  for (const v of y.values()) ny += v;
  for (const [k, v] of x) inter += Math.min(v, y.get(k) ?? 0);
  return nx + ny ? (2 * inter) / (nx + ny) : 0;
}

/** Shorter queries to try when the typed one finds nothing, most specific first. */
export function fuzzyVariants(q: string): string[] {
  const n = normalize(q);
  const words = n.split(" ").filter(Boolean);
  const out: string[] = [];
  const push = (v: string) => { const t = v.trim(); if (t.length >= 3 && t !== n && !out.includes(t)) out.push(t); };
  // drop doubled letters typed by mistake ("avatarr")
  push(n.replace(/(\p{L})\1+/gu, "$1"));
  // prefix of each word: TMDB matches word prefixes, so "intersteller" -> "interst"
  push(words.map((w) => (w.length > 4 ? w.slice(0, Math.max(3, Math.ceil(w.length * 0.6))) : w)).join(" "));
  if (words.length > 1) {
    const longest = [...words].sort((a, b) => b.length - a.length)[0]!;
    push(longest.slice(0, Math.max(3, Math.ceil(longest.length * 0.6))));
  }
  return out.slice(0, 3);
}
