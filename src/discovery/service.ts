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

