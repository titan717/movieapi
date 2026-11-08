/**
 * Panda aggregation layer.
 *
 * Purpose-built, TMDB-native endpoints for the Panda.fun streaming client
 * (TV + mobile). Every response is normalized into small, card-friendly shapes
 * with pre-sized image URLs so TVs never download `original` artwork for rows.
 */
import type { TmdbClient } from "../providers/tmdb/client.js";
import { MemoryCache } from "../reliability.js";

export type MediaType = "movie" | "tv";

const IMG = "https://image.tmdb.org/t/p";
const img = (path: string | null | undefined, size: string) => (path ? `${IMG}/${size}${path}` : null);

export type PandaItem = {
  id: string;
  tmdbId: number;
  type: MediaType;
  title: string;
  year: number | null;
  rating: number | null;
  poster: string | null;
  posterLarge: string | null;
  backdrop: string | null;
  backdropLarge: string | null;
  overview: string | null;
  genres: string[];
  language: string | null;
  releaseDate: string | null;
  logo?: string | null;
};

/** TMDB genre ids → names, merged for movie + tv (used for list results that only carry ids). */
const GENRES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime", 99: "Documentary", 18: "Drama",
  10751: "Family", 14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
  878: "Sci-Fi", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western", 10759: "Action & Adventure",
  10762: "Kids", 10763: "News", 10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics"
};

export type PandaPageKind = "home" | "movies" | "tv" | "kids" | "new";
export const PANDA_PAGE_KINDS: PandaPageKind[] = ["home", "movies", "tv", "kids", "new"];

export const LANGUAGES: Record<string, string> = {
  en: "English", hi: "Hindi", ml: "Malayalam", ta: "Tamil", te: "Telugu", kn: "Kannada", bn: "Bengali", mr: "Marathi",
  ko: "Korean", ja: "Japanese", es: "Spanish", fr: "French", de: "German", it: "Italian", zh: "Chinese", pt: "Portuguese",
  tr: "Turkish", th: "Thai", ru: "Russian", pa: "Punjabi", gu: "Gujarati"
};

export function toItem(raw: any, forcedType?: MediaType): PandaItem | null {
  const type: MediaType | undefined = forcedType ?? (raw.media_type === "movie" || raw.media_type === "tv" ? raw.media_type : raw.title ? "movie" : raw.name ? "tv" : undefined);
  if (!type || !raw?.id) return null;
  const title = (type === "movie" ? raw.title ?? raw.original_title : raw.name ?? raw.original_name) ?? null;
  if (!title) return null;
  const date: string | null = (type === "movie" ? raw.release_date : raw.first_air_date) || null;
  const genres: string[] = Array.isArray(raw.genres) ? raw.genres.map((g: any) => g.name) : Array.isArray(raw.genre_ids) ? raw.genre_ids.map((id: number) => GENRES[id]).filter(Boolean) : [];
  return {
    id: `${type}:${raw.id}`,
    tmdbId: raw.id,
    type,
    title,
    year: date ? Number(date.slice(0, 4)) || null : null,
    rating: typeof raw.vote_average === "number" && raw.vote_average > 0 ? Math.round(raw.vote_average * 10) / 10 : null,
    poster: img(raw.poster_path, "w342"),
    posterLarge: img(raw.poster_path, "w780"),
    backdrop: img(raw.backdrop_path, "w780"),
    backdropLarge: img(raw.backdrop_path, "w1280"),
    overview: raw.overview || null,
    genres,
    language: raw.original_language ?? null,
    releaseDate: date
  };
}

function pickLogo(images: any): string | null {
  const logos: any[] = images?.logos ?? [];
  const best = logos.find((l) => l.iso_639_1 === "en") ?? logos.find((l) => !l.iso_639_1) ?? logos[0];
  return best ? img(best.file_path, "w500") : null;
}

function certification(type: MediaType, raw: any): string | null {
  if (type === "movie") {
    const results: any[] = raw.release_dates?.results ?? [];
    for (const region of ["IN", "US", "GB"]) {
      const r = results.find((x) => x.iso_3166_1 === region);
      const c = r?.release_dates?.map((d: any) => d.certification).find((x: string) => x);
      if (c) return c;
    }
    return null;
  }
  const results: any[] = raw.content_ratings?.results ?? [];
  for (const region of ["IN", "US", "GB"]) {
    const r = results.find((x) => x.iso_3166_1 === region);
    if (r?.rating) return r.rating;
  }
  return null;
}

function videos(raw: any) {
  const list: any[] = raw.videos?.results ?? [];
  const order: Record<string, number> = { Trailer: 0, Teaser: 1, Clip: 2, Featurette: 3, "Behind the Scenes": 4, Bloopers: 5 };
  return list
    .filter((v) => v.site === "YouTube" && v.key)
    .sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9) || Number(b.official) - Number(a.official))
    .map((v) => ({ key: v.key as string, name: v.name as string, type: v.type as string, official: Boolean(v.official), thumbnail: `https://i.ytimg.com/vi/${v.key}/hqdefault.jpg`, publishedAt: v.published_at ?? null }));
}

export type DiscoverOptions = { genre?: string; lang?: string; sort?: string; page?: number; provider?: string; region?: string; country?: string; minVotes?: number; from?: string; to?: string; airing?: boolean };

export class PandaService {
  private readonly cache = new MemoryCache<unknown>(400);
  constructor(private readonly tmdb: TmdbClient) {}

  get enabled() { return this.tmdb.enabled; }

  private q(params: Record<string, string | number | undefined>) {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") s.set(k, String(v));
    return s.toString();
  }

  private async cached<T>(key: string, loader: () => Promise<T>, ttl = 600_000): Promise<T> {
    return (await this.cache.getOrSet(key, loader, ttl, ttl * 6)).value as T;
  }

  async logo(type: MediaType, id: number): Promise<string | null> {
    try {
      const images = await this.tmdb.raw(`/${type}/${id}/images?include_image_language=en,null`, 86_400_000, 604_800_000);
      return pickLogo(images);
    } catch { return null; }
  }

  private async withLogos(items: PandaItem[]) {
    return Promise.all(items.map(async (item) => ({ ...item, logo: await this.logo(item.type, item.tmdbId) })));
  }

  /** Full title page payload: details, logo, certification, cast, seasons, videos, recommendations. */
  title(type: MediaType, id: number) {
    return this.cached(`title:${type}:${id}`, async () => {
      const append = type === "movie" ? "images,credits,videos,recommendations,similar,release_dates,external_ids" : "images,aggregate_credits,videos,recommendations,similar,content_ratings,external_ids";
      const raw = await this.tmdb.raw(`/${type}/${id}?${this.q({ language: "en-US", append_to_response: append, include_image_language: "en,null", include_video_language: "en,null" })}`);
      const base = toItem(raw, type)!;
      const credits = type === "movie" ? raw.credits : raw.aggregate_credits;
      const cast = (credits?.cast ?? []).slice(0, 20).map((c: any) => ({ id: c.id, name: c.name, character: c.character ?? c.roles?.[0]?.character ?? null, profile: img(c.profile_path, "w185") }));
      const recs = [...(raw.recommendations?.results ?? []), ...(raw.similar?.results ?? [])]
        .map((r: any) => toItem(r, type)).filter((r): r is PandaItem => Boolean(r && r.poster));
      const seen = new Set<string>();
      const moreLikeThis = recs.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))).slice(0, 20);
      const spoken: string[] = (raw.spoken_languages ?? []).map((l: any) => l.english_name || l.name).filter(Boolean);
      const originalLanguage = raw.original_language ? LANGUAGES[raw.original_language] ?? raw.original_language : null;
      const languages = originalLanguage ? [originalLanguage, ...spoken.filter((l) => l !== originalLanguage)] : spoken;
      return {
        ...base,
        logo: pickLogo(raw.images),
        tagline: raw.tagline || null,
        certification: certification(type, raw),
        runtime: type === "movie" ? raw.runtime ?? null : raw.episode_run_time?.[0] ?? raw.last_episode_to_air?.runtime ?? null,
        status: raw.status ?? null,
        originalLanguage,
        languages,
        imdbId: raw.imdb_id ?? raw.external_ids?.imdb_id ?? null,
        studio: (raw.networks?.[0] ?? raw.production_companies?.[0])?.name ?? null,
        cast,
        creators: (raw.created_by ?? []).map((c: any) => c.name),
        directors: (raw.credits?.crew ?? []).filter((c: any) => c.job === "Director").map((c: any) => c.name),
        numberOfSeasons: raw.number_of_seasons ?? null,
        numberOfEpisodes: raw.number_of_episodes ?? null,
        seasons: (raw.seasons ?? []).filter((s: any) => s.season_number > 0 && s.episode_count > 0).map((s: any) => ({ number: s.season_number, name: s.name, episodeCount: s.episode_count, airDate: s.air_date ?? null, poster: img(s.poster_path, "w342") })),
        lastEpisode: raw.last_episode_to_air ? { season: raw.last_episode_to_air.season_number, episode: raw.last_episode_to_air.episode_number, name: raw.last_episode_to_air.name, airDate: raw.last_episode_to_air.air_date } : null,
        nextEpisode: raw.next_episode_to_air ? { season: raw.next_episode_to_air.season_number, episode: raw.next_episode_to_air.episode_number, name: raw.next_episode_to_air.name, airDate: raw.next_episode_to_air.air_date } : null,
        videos: videos(raw),
        moreLikeThis
      };
    });
  }

  season(id: number, season: number) {
    return this.cached(`season:${id}:${season}`, async () => {
      const raw = await this.tmdb.raw(`/tv/${id}/season/${season}?language=en-US`);
      return {
        tmdbId: id,
        number: raw.season_number,
        name: raw.name,
        overview: raw.overview || null,
        episodes: (raw.episodes ?? []).map((e: any) => ({
          id: e.id, season: e.season_number, number: e.episode_number, title: e.name, overview: e.overview || null,
          airDate: e.air_date ?? null, runtime: e.runtime ?? null, still: img(e.still_path, "w300"), stillLarge: img(e.still_path, "w780"),
          rating: e.vote_average ? Math.round(e.vote_average * 10) / 10 : null
        }))
      };
    });
  }

  search(query: string, page = 1) {
    return this.cached(`search:${query.toLowerCase()}:${page}`, async () => {
      const raw = await this.tmdb.raw(`/search/multi?${this.q({ query, page, include_adult: "false", language: "en-US" })}`, 120_000, 600_000);
      const results = (raw.results ?? []).map((r: any) => toItem(r)).filter((r: PandaItem | null): r is PandaItem => Boolean(r && (r.poster || r.backdrop)));
      return { query, page: raw.page ?? page, totalPages: raw.total_pages ?? 1, results };
    }, 120_000);
  }

  discover(type: MediaType, o: DiscoverOptions = {}) {
    const key = `discover:${type}:${JSON.stringify(o)}`;
    return this.cached(key, async () => {
      const dateKey = type === "movie" ? "primary_release_date" : "first_air_date";
      const raw = await this.tmdb.raw(`/discover/${type}?${this.q({
        include_adult: "false", language: "en-US", page: o.page ?? 1, sort_by: o.sort ?? "popularity.desc",
        with_genres: o.genre, with_original_language: o.lang, with_watch_providers: o.provider, watch_region: o.provider ? o.region ?? "IN" : undefined,
        with_origin_country: o.country, "vote_count.gte": o.minVotes ?? (o.sort?.startsWith("vote_average") ? 200 : 5),
        [`${dateKey}.gte`]: o.from, [`${dateKey}.lte`]: o.to ?? new Date().toISOString().slice(0, 10),
        "air_date.gte": o.airing ? new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10) : undefined,
        "air_date.lte": o.airing ? new Date().toISOString().slice(0, 10) : undefined
      })}`);
      const results = (raw.results ?? []).map((r: any) => toItem(r, type)).filter((r: PandaItem | null): r is PandaItem => Boolean(r && r.poster));
      return { type, page: raw.page ?? 1, totalPages: Math.min(raw.total_pages ?? 1, 500), results };
    });
  }

  trending(type: "all" | MediaType = "all", window: "day" | "week" = "day", page = 1) {
    return this.cached(`trending:${type}:${window}:${page}`, async () => {
      const raw = await this.tmdb.raw(`/trending/${type}/${window}?language=en-US&page=${page}`, 600_000);
      return { page, results: (raw.results ?? []).map((r: any) => toItem(r, type === "all" ? undefined : type)).filter((r: PandaItem | null): r is PandaItem => Boolean(r && r.poster && r.backdrop)) };
    });
  }

  /** Poster wall for "Who's watching": unique, small posters from this week's trending titles. */
  wall(limit = 120) {
    return this.cached(`wall:${limit}`, async () => {
      const pages = await Promise.all(([["movie", 1], ["tv", 1], ["movie", 2], ["tv", 2], ["movie", 3], ["tv", 3]] as const)
        .map(([t, p]) => this.trending(t, "week", p).then((r) => r.results).catch(() => [] as PandaItem[])));
      const seen = new Set<string>(); const posters: { id: string; title: string; poster: string }[] = [];
      // interleave movie/tv pages so neighbouring tiles differ
      for (let i = 0; i < 20 && posters.length < limit; i++) for (const list of pages) {
        const it = list[i]; if (!it?.poster || seen.has(it.id)) continue;
        seen.add(it.id); posters.push({ id: it.id, title: it.title, poster: it.poster.replace("/w342/", "/w185/") });
      }
      return { posters: posters.slice(0, limit) };
    }, 3_600_000);
  }

  /** Top 10 for a language (blueprint "Top 10 in India Today" with language chips). */
  top10(lang: string) {
    return this.cached(`top10:${lang}`, async () => {
      const today = new Date();
      const from = new Date(today.getTime() - 1000 * 60 * 60 * 24 * 365 * 2).toISOString().slice(0, 10);
      const [movies, shows] = await Promise.all([
        this.discover("movie", { lang, from, minVotes: lang === "en" ? 100 : 5 }),
        this.discover("tv", { lang, from, minVotes: lang === "en" ? 50 : 2 })
      ]);
      const merged: PandaItem[] = [];
      for (let i = 0; i < 10; i++) { if (movies.results[i]) merged.push(movies.results[i]); if (shows.results[i]) merged.push(shows.results[i]); }
      return { lang, label: LANGUAGES[lang] ?? lang, results: merged.slice(0, 10) };
    });
  }

  /** Hero spotlight + curated rails for a page (home, movies, tv). */
  page(kind: PandaPageKind) {
    return this.cached(`page:${kind}`, async () => {
      const yearAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 120).toISOString().slice(0, 10);
      type RailDef = { id: string; title: string; style?: "poster" | "landscape" | "top10" | "shows-watched"; load: () => Promise<PandaItem[]>; link?: string };
      const d = (type: MediaType, o: DiscoverOptions) => () => this.discover(type, o).then((r) => r.results);
      const defs: Record<string, RailDef[]> = {
        home: [
          { id: "trending", title: "Trending Now", load: () => this.trending("all", "day").then((r) => r.results), link: "/browse/trending" },
          { id: "new", title: "New on Panda", load: d("movie", { from: yearAgo, sort: "popularity.desc", minVotes: 30 }), link: "/browse/movie?sort=new" },
          { id: "latest-tv", title: "Latest TV Episodes", style: "landscape", load: () => this.tmdb.raw("/tv/on_the_air?language=en-US", 600_000).then((r: any) => (r.results ?? []).map((x: any) => toItem(x, "tv")).filter((x: PandaItem | null) => x?.backdrop)), link: "/browse/tv?sort=airing" },
          { id: "indian", title: "Indian Cinema", load: d("movie", { country: "IN", minVotes: 20 }), link: "/browse/movie?country=IN" },
          { id: "love", title: "Love Stories", load: d("movie", { genre: "10749", minVotes: 200 }), link: "/browse/movie?genre=10749" },
          { id: "popular-shows", title: "Popular Shows", load: d("tv", { minVotes: 200 }), link: "/browse/tv" },
          { id: "thriller", title: "Thriller Movies", load: d("movie", { genre: "53", minVotes: 200 }), link: "/browse/movie?genre=53" },
          { id: "korean", title: "Korean Dramas", load: d("tv", { lang: "ko", genre: "18", minVotes: 50 }), link: "/browse/tv?lang=ko&genre=18" },
          { id: "animation", title: "Animated Adventures", load: d("movie", { genre: "16", minVotes: 300 }), link: "/browse/movie?genre=16" },
          { id: "top-rated", title: "Critically Acclaimed", load: d("movie", { sort: "vote_average.desc", minVotes: 3000 }), link: "/browse/movie?sort=vote_average.desc" },
          { id: "comedy", title: "Comedy Hits", load: d("movie", { genre: "35", minVotes: 200 }), link: "/browse/movie?genre=35" },
          { id: "crime-tv", title: "The World of Crime", load: d("tv", { genre: "80", minVotes: 200 }), link: "/browse/tv?genre=80" }
        ],
        movies: [
          { id: "popular", title: "Popular Movies", load: d("movie", { minVotes: 100 }), link: "/browse/movie" },
          { id: "new", title: "New Releases", load: d("movie", { from: yearAgo, minVotes: 30 }), link: "/browse/movie?sort=new" },
          { id: "hindi", title: "Hindi Movies", load: d("movie", { lang: "hi", minVotes: 10 }), link: "/browse/movie?lang=hi" },
          { id: "malayalam", title: "Malayalam Movies", load: d("movie", { lang: "ml", minVotes: 5 }), link: "/browse/movie?lang=ml" },
          { id: "tamil", title: "Tamil Movies", load: d("movie", { lang: "ta", minVotes: 5 }), link: "/browse/movie?lang=ta" },
          { id: "action", title: "Action Movies", load: d("movie", { genre: "28", minVotes: 300 }), link: "/browse/movie?genre=28" },
          { id: "scifi", title: "Sci-Fi Worlds", load: d("movie", { genre: "878", minVotes: 300 }), link: "/browse/movie?genre=878" },
          { id: "horror", title: "Horror Nights", load: d("movie", { genre: "27", minVotes: 200 }), link: "/browse/movie?genre=27" },
          { id: "family", title: "Family Movies", load: d("movie", { genre: "10751", minVotes: 200 }), link: "/browse/movie?genre=10751" },
          { id: "top-rated", title: "Top Rated", load: d("movie", { sort: "vote_average.desc", minVotes: 3000 }), link: "/browse/movie?sort=vote_average.desc" }
        ],
        tv: [
          { id: "popular", title: "Popular Shows", load: d("tv", { minVotes: 100 }), link: "/browse/tv" },
          { id: "airing", title: "Latest TV Episodes", style: "landscape", load: () => this.tmdb.raw("/tv/on_the_air?language=en-US", 600_000).then((r: any) => (r.results ?? []).map((x: any) => toItem(x, "tv")).filter((x: PandaItem | null) => x?.backdrop)), link: "/browse/tv?sort=airing" },
          { id: "drama", title: "Binge-worthy Dramas", load: d("tv", { genre: "18", minVotes: 300 }), link: "/browse/tv?genre=18" },
          { id: "hindi", title: "Hindi Shows", load: d("tv", { lang: "hi", minVotes: 3 }), link: "/browse/tv?lang=hi" },
          { id: "korean", title: "Korean Dramas", load: d("tv", { lang: "ko", minVotes: 50 }), link: "/browse/tv?lang=ko" },
          { id: "anime", title: "Anime", load: d("tv", { lang: "ja", genre: "16", minVotes: 100 }), link: "/browse/tv?lang=ja&genre=16" },
          { id: "crime", title: "Crime Shows", load: d("tv", { genre: "80", minVotes: 200 }), link: "/browse/tv?genre=80" },
          { id: "scifi", title: "Sci-Fi & Fantasy", load: d("tv", { genre: "10765", minVotes: 300 }), link: "/browse/tv?genre=10765" },
          { id: "reality", title: "Reality TV", load: d("tv", { genre: "10764", minVotes: 20 }), link: "/browse/tv?genre=10764" },
          { id: "top-rated", title: "Top Rated Shows", load: d("tv", { sort: "vote_average.desc", minVotes: 1500 }), link: "/browse/tv?sort=vote_average.desc" }
        ],
        kids: [
          { id: "animated", title: "Animated Favourites", load: d("movie", { genre: "16", minVotes: 500 }), link: "/browse/movie?genre=16" },
          { id: "kids-tv", title: "Kids Shows", load: d("tv", { genre: "10762", minVotes: 20 }), link: "/browse/tv?genre=10762" },
          { id: "family", title: "Family Movie Night", load: d("movie", { genre: "10751", minVotes: 300 }), link: "/browse/movie?genre=10751" },
          { id: "cartoons", title: "Cartoon Series", load: d("tv", { genre: "16,10762", minVotes: 10 }), link: "/browse/tv?genre=16,10762" },
          { id: "adventure", title: "Family Adventures", load: d("movie", { genre: "10751,12", minVotes: 200 }), link: "/browse/movie?genre=10751,12" },
          { id: "new-animated", title: "New Animated Movies", load: d("movie", { genre: "16", from: yearAgo, minVotes: 10 }), link: "/browse/movie?genre=16&sort=new" }
        ],
        new: [
          { id: "coming-soon", title: "Coming Soon", style: "landscape", load: () => this.upcoming() },
          { id: "everyone", title: "Everyone's Watching", load: () => this.trending("all", "week").then((r) => r.results), link: "/browse/trending" },
          { id: "airing-today", title: "New Episodes Today", style: "landscape", load: () => this.tmdb.raw("/tv/airing_today?language=en-US", 600_000).then((r: any) => (r.results ?? []).map((x: any) => toItem(x, "tv")).filter((x: PandaItem | null) => x?.backdrop)), link: "/browse/tv?sort=airing" },
          { id: "new-movies", title: "Fresh Movie Releases", load: d("movie", { from: yearAgo, minVotes: 30 }), link: "/browse/movie?sort=new" },
          { id: "new-shows", title: "New Shows", load: d("tv", { from: yearAgo, minVotes: 10 }), link: "/browse/tv?sort=new" }
        ]
      };
      const heroSource = kind === "home" || kind === "new" ? this.trending("all", kind === "new" ? "week" : "day").then((r) => r.results)
        : kind === "kids" ? this.discover("movie", { genre: "16", minVotes: 500 }).then((r) => r.results.filter((i: PandaItem) => i.backdrop))
        : this.trending(kind === "movies" ? "movie" : "tv", "day").then((r) => r.results);
      const [heroRaw, ...railItems] = await Promise.all([heroSource.catch(() => [] as PandaItem[]), ...defs[kind].map((r) => r.load().catch(() => [] as PandaItem[]))]);
      const hero = (await this.withLogos((heroRaw as PandaItem[]).filter((i: PandaItem) => i.backdrop).slice(0, 8)));
      const rails = defs[kind]
        .map((r, i) => ({ id: r.id, title: r.title, style: r.style ?? "poster", link: r.link ?? null, items: railItems[i].slice(0, 20) }))
        .filter((r) => r.items.length > 0);
      return { kind, hero, rails };
    }, 900_000);
  }

  /** Upcoming theatrical releases (future dates only) for New & Hot. */
  upcoming() {
    return this.cached("upcoming", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const raw = await this.tmdb.raw("/movie/upcoming?language=en-US&region=IN", 3_600_000);
      return (raw.results ?? []).map((x: any) => toItem(x, "movie"))
        .filter((x: PandaItem | null): x is PandaItem => Boolean(x && x.backdrop && x.releaseDate && x.releaseDate >= today))
        .sort((a: PandaItem, b: PandaItem) => (a.releaseDate ?? "").localeCompare(b.releaseDate ?? ""));
    }, 3_600_000);
  }

  genres() {
    return this.cached("genres", async () => {
      const [m, t] = await Promise.all([this.tmdb.raw("/genre/movie/list?language=en", 86_400_000), this.tmdb.raw("/genre/tv/list?language=en", 86_400_000)]);
      return { movie: m.genres ?? [], tv: t.genres ?? [], languages: Object.entries(LANGUAGES).map(([code, name]) => ({ code, name })) };
    }, 86_400_000);
  }

  /** Artwork for category tiles: one backdrop per genre / language. */
  categoryArt() {
    return this.cached("category-art", async () => {
      const genreIds = [10749, 18, 10751, 35, 28, 53, 27, 878, 16, 80, 99, 14];
      const langs = ["hi", "en", "ta", "te", "ml", "kn", "ko", "ja"];
      const [g, l] = await Promise.all([
        Promise.all(genreIds.map(async (id) => { const r = await this.discover("movie", { genre: String(id), minVotes: 500 }).catch(() => null); return { id, name: GENRES[id], image: r?.results.find((x: PandaItem) => x.backdrop)?.backdrop ?? null }; })),
        Promise.all(langs.map(async (code) => { const r = await this.discover("movie", { lang: code, minVotes: 20 }).catch(() => null); return { code, name: LANGUAGES[code], image: r?.results.find((x: PandaItem) => x.backdrop)?.backdrop ?? null }; }))
      ]);
      return { genres: g.filter((x) => x.image), languages: l.filter((x) => x.image) };
    }, 86_400_000);
  }
}

/**
 * Source registry: every adapter builds its embed URL from TMDB ids (no network), declares its
 * capabilities and a probe URL used by the background health check. Order = default ranking.
 * Only the two providers chosen for Panda are registered: CineSrc (cinesrc.st) and Vidy (vidy.st).
 */
export type SourceAdapter = {
  id: "cinesrc" | "vidy";
  label: string;
  origin: string;
  events: "cinesrc" | "vidy";
  capabilities: { commands: boolean; start: boolean; quality: boolean; autonext: boolean; hideControls: boolean };
  build: (type: MediaType, id: number, o: { s: number; e: number; start?: number; color: string; quality?: string }) => string;
  probe: string;
};

export const SOURCE_ADAPTERS: SourceAdapter[] = [
  {
    id: "cinesrc", label: "CineSrc", origin: "https://cinesrc.st", events: "cinesrc",
    capabilities: { commands: true, start: true, quality: true, autonext: true, hideControls: true },
    build: (type, id, o) => {
      const u = new URL(type === "movie" ? `https://cinesrc.st/embed/movie/${id}` : `https://cinesrc.st/embed/tv/${id}`);
      if (type === "tv") { u.searchParams.set("s", String(o.s)); u.searchParams.set("e", String(o.e)); }
      u.searchParams.set("autoplay", "true");
      u.searchParams.set("color", `#${o.color}`);
      u.searchParams.set("autonext", "false");
      u.searchParams.set("back", "close");
      if (o.quality) u.searchParams.set("quality", o.quality);
      if (o.start) { u.searchParams.set("t", String(o.start)); u.searchParams.set("continueprompt", "false"); }
      return u.toString();
    },
    probe: "https://cinesrc.st/embed/movie/550"
  },
  {
    id: "vidy", label: "Vidy", origin: "https://www.vidy.st", events: "vidy",
    capabilities: { commands: false, start: true, quality: false, autonext: true, hideControls: false },
    build: (type, id, o) => {
      const u = new URL(type === "movie" ? `https://www.vidy.st/movie/${id}` : `https://www.vidy.st/tv/${id}/${o.s}/${o.e}`);
      u.searchParams.set("autoplay", "true");
      u.searchParams.set("color", o.color);
      if (o.start) u.searchParams.set("progress", String(o.start));
      return u.toString();
    },
    probe: "https://www.vidy.st/movie/550"
  }
];

/** Playback sources for every registered adapter. Pure function; no network. */
export function playbackSources(type: MediaType, id: number, opts: { season?: number; episode?: number; start?: number; color?: string; quality?: string } = {}) {
  const color = (opts.color ?? "1f80e0").replace(/^#/, "");
  const start = opts.start && opts.start > 5 ? Math.floor(opts.start) : undefined;
  const s = opts.season ?? 1, e = opts.episode ?? 1;
  const quality = opts.quality && /^(2160|1080|720|480)$/.test(opts.quality) ? opts.quality : undefined;
  return SOURCE_ADAPTERS.map((a) => ({
    id: a.id, provider: a.id, label: a.label, origin: a.origin, events: a.events,
    supportsStart: a.capabilities.start, capabilities: a.capabilities,
    url: a.build(type, id, { s, e, start, color, quality })
  }));
}

export type SourceHealth = { id: SourceAdapter["id"]; label: string; state: "healthy" | "degraded" | "down"; status: number | null; latencyMs: number | null; checkedAt: string };

let healthCache: { at: number; value: SourceHealth[] } | null = null;

/** Probes every adapter (GET with a 6 s timeout). Cached for 5 minutes per instance. */
export async function sourceHealth(fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<SourceHealth[]> {
  if (healthCache && now - healthCache.at < 300_000) return healthCache.value;
  const value = await Promise.all(SOURCE_ADAPTERS.map(async (a): Promise<SourceHealth> => {
    const t0 = Date.now();
    try {
      const res = await fetchImpl(a.probe, { redirect: "follow", signal: AbortSignal.timeout(6000), headers: { "user-agent": "Mozilla/5.0 (PandaHealth)" } });
      const latencyMs = Date.now() - t0;
      await res.body?.cancel().catch(() => undefined);
      const state = res.ok ? (latencyMs > 3000 ? "degraded" : "healthy") : res.status === 403 || res.status === 429 ? "degraded" : "down";
      return { id: a.id, label: a.label, state, status: res.status, latencyMs, checkedAt: new Date().toISOString() };
    } catch {
      return { id: a.id, label: a.label, state: "down", status: null, latencyMs: null, checkedAt: new Date().toISOString() };
    }
  }));
  healthCache = { at: now, value };
  return value;
}
