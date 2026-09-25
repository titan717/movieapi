import { MemoryCache } from "../reliability.js";
import type { TmdbClient } from "../providers/tmdb/client.js";
import type { TvmazeClient } from "../providers/tvmaze/client.js";
import { normalizeTmdbMovieResult, normalizeTmdbTvResult, normalizeTmdbTrendingResult } from "../providers/tmdb/normalizer.js";
import { normalizeShow } from "../providers/tvmaze/normalizer.js";

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function slug(value: string) {
  return value.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export class DiscoveryService {
  private readonly cache = new MemoryCache<unknown>(300);

  constructor(
    private readonly tmdb: TmdbClient,
    private readonly tvmaze: TvmazeClient
  ) {}

  private async cached<T>(key: string, loader: () => Promise<T>, ttlMs = 60_000, staleTtlMs = 300_000): Promise<T> {
    const result = await this.cache.getOrSet(key, loader, ttlMs, staleTtlMs);
    return result.value as T;
  }

  popularMovies(page = 1) {
    return this.cached(`popular:movies:${page}`, async () => {
      const result = await this.tmdb.popularMovies(page);
      return {
        page: result.page ?? page,
        totalPages: result.total_pages ?? 0,
        totalResults: result.total_results ?? 0,
        results: result.results.map(normalizeTmdbMovieResult)
      };
    });
  }

  popularTv(page = 1) {
    return this.cached(`popular:tv:${page}`, async () => {
      const result = await this.tmdb.popularTv(page);
      return {
        page: result.page ?? page,
        totalPages: result.total_pages ?? 0,
        totalResults: result.total_results ?? 0,
        results: result.results.map(normalizeTmdbTvResult)
      };
    });
  }

  latestMovies(page = 1) {
    return this.cached(`latest:movies:${page}`, async () => {
      const result = await this.tmdb.discoverMovie({
        page,
        sortBy: "primary_release_date.desc",
        primaryReleaseDateLte: todayUtc()
      });
      return {
        page: result.page ?? page,
        totalPages: result.total_pages ?? 0,
        totalResults: result.total_results ?? 0,
        results: result.results.map(normalizeTmdbMovieResult)
      };
    });
  }

  latestTv(page = 1) {
    return this.cached(`latest:tv:${page}`, async () => {
      const result = await this.tmdb.discoverTv({
        page,
        sortBy: "first_air_date.desc",
        firstAirDateLte: todayUtc()
      });
      return {
        page: result.page ?? page,
        totalPages: result.total_pages ?? 0,
        totalResults: result.total_results ?? 0,
        results: result.results.map(normalizeTmdbTvResult)
      };
    });
  }

  upcomingMovies(page = 1, region?: string) {
    return this.cached(`upcoming:movies:${page}:${region ?? ""}`, async () => {
      const result = await this.tmdb.upcomingMovies(page, region);
      return {
        page: result.page ?? page,
        totalPages: result.total_pages ?? 0,
        totalResults: result.total_results ?? 0,
        results: result.results.map(normalizeTmdbMovieResult)
      };
    });
  }

  upcomingTv(page = 1) {
    return this.cached(`upcoming:tv:${page}`, async () => {
      const result = await this.tmdb.discoverTv({
        page,
        sortBy: "first_air_date.asc",
        firstAirDateGte: todayUtc()
      });
      return {
        page: result.page ?? page,
        totalPages: result.total_pages ?? 0,
        totalResults: result.total_results ?? 0,
        results: result.results.map(normalizeTmdbTvResult)
      };
    });
  }

  airingToday(country = "US") {
    return this.cached(`airing:today:${country}`, async () => {
      const date = todayUtc();
      const episodes = await this.tvmaze.getSchedule(country, date);
      return {
        date,
        country,
        episodes: episodes.map((episode) => ({
          id: episode.id,
          title: episode.name,
          season: episode.season ?? null,
          number: episode.number ?? null,
          airdate: episode.airdate ?? null,
          airtime: episode.airtime ?? null,
          airstamp: episode.airstamp ?? null,
          image: episode.image?.original ?? episode.image?.medium ?? null,
          show: episode._embedded?.show ? normalizeShow(episode._embedded.show) : null
        })),
        source: "tvmaze"
      };
    }, 300_000, 900_000);
  }


  upcomingAiring(page = 1) {
    return this.cached(`airing:upcoming:${page}`, async () => {
      const result = await this.tmdb.onTheAirTv(page);
      return {
        page: result.page ?? page,
        totalPages: result.total_pages ?? 0,
        totalResults: result.total_results ?? 0,
        results: result.results.map(normalizeTmdbTvResult),
        source: "tmdb"
      };
    });
  }

  trending(timeWindow: "day" | "week" = "day") {
    return this.cached(`trending:${timeWindow}`, async () => {
      const result = await this.tmdb.trending(timeWindow);
      return {
        page: result.page ?? 1,
        totalPages: result.total_pages ?? 1,
        totalResults: result.total_results ?? result.results.length,
        results: result.results.map(normalizeTmdbTrendingResult)
      };
    });
  }

  featured() {
    return this.cached("featured", async () => {
      const trending = await this.trending("day");
      return { item: trending.results[0] ?? null, source: "tmdb-trending" };
    });
  }

  async genres(type: "movie" | "tv") {
    return this.cached(`genres:${type}`, async () => {
      const result = type === "movie" ? await this.tmdb.movieGenres() : await this.tmdb.tvGenres();
      return { type, genres: result.genres };
    }, 86_400_000, 604_800_000);
  }

  async genre(type: "movie" | "tv", value: string, page = 1) {
    const numeric = Number(value);
    let genreId: number | null = Number.isInteger(numeric) && numeric > 0 ? numeric : null;
    if (!genreId) {
      const list = await this.genres(type);
      const match = list.genres.find((genre) => slug(genre.name) === slug(value));
      genreId = match?.id ?? null;
    }
    if (!genreId) return null;

    if (type === "movie") {
      const result = await this.tmdb.discoverMovie({ page, withGenres: String(genreId), sortBy: "popularity.desc" });
      return {
        type, genreId, page: result.page ?? page, totalPages: result.total_pages ?? 0,
        totalResults: result.total_results ?? 0, results: result.results.map(normalizeTmdbMovieResult)
      };
    }

    const result = await this.tmdb.discoverTv({ page, withGenres: String(genreId), sortBy: "popularity.desc" });
    return {
      type, genreId, page: result.page ?? page, totalPages: result.total_pages ?? 0,
      totalResults: result.total_results ?? 0, results: result.results.map(normalizeTmdbTvResult)
    };
  }

  recommendations(type: "movie" | "tv", id: number, page = 1) {
    return this.cached(`recommendations:${type}:${id}:${page}`, async () => {
      const result = type === "movie"
        ? await this.tmdb.movieRecommendations(id, page)
        : await this.tmdb.tvRecommendations(id, page);
      if (type === "movie") {
        return {
          type, id, page: result.page ?? page, totalPages: result.total_pages ?? 0,
          totalResults: result.total_results ?? 0,
          results: result.results.map(normalizeTmdbMovieResult)
        };
      }
      return {
        type, id, page: result.page ?? page, totalPages: result.total_pages ?? 0,
        totalResults: result.total_results ?? 0,
        results: result.results.map(normalizeTmdbTvResult)
      };
    });
  }

  async home() {
    const [featured, trending, popularMovies, popularTv, latestMovies, latestTv] = await Promise.all([
      this.featured(), this.trending("day"), this.popularMovies(1), this.popularTv(1), this.latestMovies(1), this.latestTv(1)
    ]);
    return {
      featured: featured.item,
      sections: {
        trending: trending.results,
        popularMovies: popularMovies.results,
        popularTv: popularTv.results,
        latestMovies: latestMovies.results,
        latestTv: latestTv.results
      },
      generatedAt: new Date().toISOString()
    };
  }
}
