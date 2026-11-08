/**
 * AniList bridge (v1.2.0).
 *
 * AniList (https://anilist.co, public GraphQL API, no key) is the catalogue Vidy's anime player is
 * keyed by (`https://www.vidy.st/anime/{anilistId}/{episode}`). Two jobs:
 *  1. TMDB title → AniList id, so a Japanese animated title gets the "Vidy Anime" source.
 *     AniList keeps one entry per season; season N is reached by following SEQUEL relations.
 *  2. The Anime page: AniList's trending / seasonal / all-time rows, each card resolved back to the
 *     TMDB title so it opens the normal Panda title page.
 */
import { MemoryCache } from "../reliability.js";
import type { MediaType, PandaItem } from "./service.js";

export const ANILIST = "https://graphql.anilist.co";

type Fetch = typeof fetch;
const memo = new MemoryCache<unknown>(600);

export async function anilistQuery<T>(query: string, variables: Record<string, unknown>, fetchImpl: Fetch = fetch): Promise<T> {
  const res = await fetchImpl(ANILIST, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(6000)
  });
  if (!res.ok) throw new Error(`AniList ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: unknown[] };
  if (!json.data) throw new Error("AniList returned no data");
  return json.data;
}

const SERIES = new Set(["TV", "TV_SHORT", "ONA"]);

export type AniCandidate = {
  id: number; format: string | null; startDate?: { year: number | null } | null;
  title?: { romaji?: string | null; english?: string | null; native?: string | null } | null;
  relations?: { edges: { relationType: string; node: { id: number; format: string | null; type: string } }[] } | null;
};

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "");

/** Best AniList match for a TMDB title: right format family, same start year (±1), then closest title. */
export function pickCandidate(list: AniCandidate[], o: { type: MediaType; year: number | null; titles: string[] }): AniCandidate | null {
  const fam = list.filter((m) => (o.type === "movie" ? m.format === "MOVIE" : SERIES.has(m.format ?? "")));
  if (!fam.length) return null;
  const wanted = o.titles.map(norm).filter(Boolean);
  const score = (m: AniCandidate) => {
    const y = m.startDate?.year ?? null;
    const yearScore = o.year && y ? (y === o.year ? 0 : Math.abs(y - o.year) === 1 ? 1 : 5) : 2;
    const names = [m.title?.english, m.title?.romaji, m.title?.native].map(norm);
    const titleScore = names.some((n) => n && wanted.includes(n)) ? 0 : 1;
    return yearScore * 2 + titleScore;
  };
  const best = [...fam].sort((a, b) => score(a) - score(b))[0]!;
  // a year more than a year off with no exact title is a different show
  return score(best) >= 10 ? null : best;
}

const SEARCH = `query($q:String,$f:[MediaFormat]){Page(perPage:10){media(search:$q,type:ANIME,format_in:$f,isAdult:false){id format startDate{year} title{romaji english native} relations{edges{relationType node{id format type}}}}}}`;
const RELATIONS = `query($id:Int){Media(id:$id,type:ANIME){id format relations{edges{relationType node{id format type}}}}}`;

/** Follows SEQUEL edges to reach the AniList entry for TMDB season `season` (1 = the entry itself). */
async function walkSeasons(first: AniCandidate, season: number, fetchImpl: Fetch): Promise<number | null> {
  let cur: AniCandidate = first;
  for (let n = 1; n < season; n++) {
    const next = cur.relations?.edges.find((e) => e.relationType === "SEQUEL" && e.node.type === "ANIME" && SERIES.has(e.node.format ?? ""));
    if (!next) return null;
    if (n === season - 1) return next.node.id;
    const d = await anilistQuery<{ Media: AniCandidate }>(RELATIONS, { id: next.node.id }, fetchImpl);
    cur = d.Media;
  }
  return cur.id;
}

/** True when a TMDB title is Japanese animation (the titles Vidy's anime catalogue covers). */
export const isAnime = (t: { language?: string | null; genres?: string[] }) => t.language === "ja" && (t.genres ?? []).includes("Animation");

/** TMDB title → AniList id for the given season (null when no confident match). Cached 24 h. */
export async function resolveAnilist(o: { type: MediaType; tmdbId: number; season: number; year: number | null; titles: string[] }, fetchImpl: Fetch = fetch): Promise<number | null> {
  const key = `al:${o.type}:${o.tmdbId}:${o.season}`;
  const hit = await memo.getOrSet(key, async () => {
    const formats = o.type === "movie" ? ["MOVIE"] : ["TV", "TV_SHORT", "ONA"];
    for (const q of [...new Set(o.titles.filter(Boolean))].slice(0, 2)) {
      const d = await anilistQuery<{ Page: { media: AniCandidate[] } }>(SEARCH, { q, f: formats }, fetchImpl);
      const first = pickCandidate(d.Page.media, o);
      if (first) return o.type === "movie" ? first.id : await walkSeasons(first, Math.max(1, o.season), fetchImpl);
    }
    return null;
  }, 86_400_000, 86_400_000 * 6);
  return hit.value as number | null;
}

/* ---------------- Anime page ---------------- */

export type AnimeCard = PandaItem & {
  anilistId: number;
  /** AniList cover colour, used as the card's accent while artwork loads. */
  color: string | null;
  score: number | null;
  format: string | null;
  episodes: number | null;
  /** Next airing episode from AniList, for the "Ep 6 in 2d" badge. */
  airing: { episode: number; at: string } | null;
  studio: string | null;
};

export type AnimeRow = { id: string; title: string; items: AnimeCard[] };
export type AnimeHome = { hero: AnimeCard | null; rows: AnimeRow[]; season: { name: string; year: number } };

const MEDIA_FIELDS = `id format episodes averageScore seasonYear startDate{year} title{romaji english native} coverImage{color} bannerImage nextAiringEpisode{episode airingAt} studios(isMain:true){nodes{name}}`;

export function currentSeason(d = new Date()) {
  const m = d.getUTCMonth();
  const name = m < 3 ? "WINTER" : m < 6 ? "SPRING" : m < 9 ? "SUMMER" : "FALL";
  return { name, year: d.getUTCFullYear() };
}

function nextSeason(s: { name: string; year: number }) {
  const order = ["WINTER", "SPRING", "SUMMER", "FALL"];
  const i = order.indexOf(s.name);
  return i === 3 ? { name: "WINTER", year: s.year + 1 } : { name: order[i + 1]!, year: s.year };
}

/** Strips "Season 2", "2nd Season", "Part 2", "Cour 2" so a sequel entry finds the one TMDB show. */
export function baseTitle(t: string) {
  return t
    .replace(/[:\s-]*(\d+(st|nd|rd|th)\s+season|season\s*\d+|part\s*\d+|cour\s*\d+|final\s+season.*)$/i, "")
    .replace(/\s+(II|III|IV|V)$/i, "")
    .trim();
}

type RawMedia = {
  id: number; format: string | null; episodes: number | null; averageScore: number | null; seasonYear: number | null; startDate?: { year: number | null };
  title: { romaji: string | null; english: string | null; native: string | null }; coverImage?: { color: string | null }; bannerImage: string | null;
  nextAiringEpisode: { episode: number; airingAt: number } | null; studios?: { nodes: { name: string }[] };
};

export type TmdbLookup = (type: MediaType, query: string, year: number | null) => Promise<PandaItem | null>;

async function toCard(m: RawMedia, lookup: TmdbLookup): Promise<AnimeCard | null> {
  const type: MediaType = m.format === "MOVIE" ? "movie" : "tv";
  const full = [m.title.english, m.title.romaji].filter((x): x is string => Boolean(x));
  // sequel arcs ("MASHLE: MAGIC AND MUSCLES The Divine Visionary Arc") also try the part before the colon
  const names = [...new Set(type === "tv" ? [...full, ...full.map((n) => n.split(":")[0]!.trim())] : full)];
  let item: PandaItem | null = null;
  for (const n of names) {
    item = await lookup(type, type === "tv" ? baseTitle(n) : n, type === "movie" ? m.startDate?.year ?? m.seasonYear : null).catch(() => null);
    if (item) break;
  }
  if (!item || !item.poster) return null;
  return {
    ...item,
    anilistId: m.id,
    color: m.coverImage?.color ?? null,
    score: m.averageScore ? Math.round(m.averageScore) / 10 : null,
    format: m.format,
    episodes: m.episodes,
    airing: m.nextAiringEpisode ? { episode: m.nextAiringEpisode.episode, at: new Date(m.nextAiringEpisode.airingAt * 1000).toISOString() } : null,
    studio: m.studios?.nodes?.[0]?.name ?? null
  };
}

function dedupe(cards: (AnimeCard | null)[]) {
  const seen = new Set<string>();
  return cards.filter((c): c is AnimeCard => Boolean(c) && !seen.has(c!.id) && (seen.add(c!.id), true));
}

/** The Anime page: five AniList rows resolved to TMDB titles. Cached 6 h per instance. */
export async function animeHome(lookup: TmdbLookup, fetchImpl: Fetch = fetch, now = new Date()): Promise<AnimeHome> {
  const season = currentSeason(now);
  const upcoming = nextSeason(season);
  const hit = await memo.getOrSet(`anime-home:${season.name}:${season.year}`, async () => {
    const q = `query($s:MediaSeason,$y:Int,$ns:MediaSeason,$ny:Int){
      trending:Page(perPage:20){media(type:ANIME,sort:TRENDING_DESC,isAdult:false){${MEDIA_FIELDS}}}
      season:Page(perPage:20){media(type:ANIME,season:$s,seasonYear:$y,sort:POPULARITY_DESC,isAdult:false){${MEDIA_FIELDS}}}
      popular:Page(perPage:20){media(type:ANIME,sort:POPULARITY_DESC,isAdult:false){${MEDIA_FIELDS}}}
      movies:Page(perPage:20){media(type:ANIME,format:MOVIE,sort:SCORE_DESC,isAdult:false){${MEDIA_FIELDS}}}
      upcoming:Page(perPage:20){media(type:ANIME,season:$ns,seasonYear:$ny,sort:POPULARITY_DESC,isAdult:false){${MEDIA_FIELDS}}}
    }`;
    const d = await anilistQuery<Record<"trending" | "season" | "popular" | "movies" | "upcoming", { media: RawMedia[] }>>(q, { s: season.name, y: season.year, ns: upcoming.name, ny: upcoming.year }, fetchImpl);
    const label = (s: { name: string; year: number }) => `${s.name[0]}${s.name.slice(1).toLowerCase()} ${s.year}`;
    const defs: { id: keyof typeof d; title: string }[] = [
      { id: "trending", title: "Trending Anime" },
      { id: "season", title: `Popular This Season · ${label(season)}` },
      { id: "popular", title: "All-Time Favourites" },
      { id: "movies", title: "Top Anime Movies" },
      { id: "upcoming", title: `Coming Next Season · ${label(upcoming)}` }
    ];
    const rows: AnimeRow[] = [];
    for (const def of defs) {
      const items = dedupe(await Promise.all((d[def.id]?.media ?? []).map((m) => toCard(m, lookup))));
      if (items.length >= 4) rows.push({ id: def.id, title: def.title, items });
    }
    const pool = rows.find((r) => r.id === "trending")?.items ?? rows[0]?.items ?? [];
    const hero = pool.find((x) => x.backdropLarge) ?? null;
    return { hero, rows, season };
  }, 21_600_000, 86_400_000);
  return hit.value as AnimeHome;
}
