import { z } from "zod";
import { CircuitBreaker, MemoryCache, ProviderHealth, isRetryableProviderError, withRetry } from "../../reliability.js";
import { tmdbFindSchema, tmdbGenresSchema, tmdbMovieDetailsSchema, tmdbMovieListSchema, tmdbSearchMovieSchema, tmdbSearchTvSchema, tmdbTrendingSchema, tmdbTvDetailsSchema, tmdbTvListSchema, tmdbTvSeasonSchema, type TmdbMovieDetails, type TmdbTvDetails } from "./schemas.js";

export const TMDB_BASE_URL = "https://api.themoviedb.org/3";
export type TmdbClientOptions = { accessToken?: string; baseUrl?: string; timeoutMs?: number };

export class TmdbProviderError extends Error {
  constructor(message: string, public readonly kind: "UNCONFIGURED" | "TIMEOUT" | "RATE_LIMIT" | "HTTP_ERROR" | "INVALID_RESPONSE" | "NOT_FOUND" | "UNAUTHORIZED" | "CIRCUIT_OPEN", public readonly status?: number) {
    super(message); this.name = "TmdbProviderError";
  }
}

export class TmdbClient {
  private readonly baseUrl: string;
  private readonly accessToken?: string;
  private readonly timeoutMs: number;
  private readonly cache = new MemoryCache<unknown>(1000);
  private readonly breaker = new CircuitBreaker();
  private readonly health = new ProviderHealth();

  constructor(options: TmdbClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? TMDB_BASE_URL).replace(/\/$/, "");
    this.accessToken = options.accessToken?.trim() || undefined;
    this.timeoutMs = options.timeoutMs ?? 8_000;
  }

  get enabled() { return Boolean(this.accessToken); }
  getHealth() { return { provider: "tmdb", configured: this.enabled, ...this.health.snapshot(), circuit: this.breaker.snapshot(), cache: this.cache.stats() }; }

  private async get<T>(path: string, schema: z.ZodType<T>, ttlMs = 300_000, staleTtlMs = 900_000): Promise<T> {
    if (!this.accessToken) throw new TmdbProviderError("TMDB is not configured.", "UNCONFIGURED", 503);
    const cached = await this.cache.getOrSet(path, async () => {
      if (!this.breaker.canRequest()) throw new TmdbProviderError("TMDB circuit is open.", "CIRCUIT_OPEN", 503);
      const started = Date.now();
      try {
        const result = await withRetry(() => this.request(path, schema), { attempts: 3, baseDelayMs: 150, maxDelayMs: 1500, shouldRetry: isRetryableProviderError });
        this.breaker.onSuccess(); this.health.recordSuccess(Date.now() - started); return result;
      } catch (error) {
        this.breaker.onFailure(); this.health.recordFailure(Date.now() - started); throw error;
      }
    }, ttlMs, staleTtlMs);
    return cached.value as T;
  }

  private async request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { headers: { accept: "application/json", authorization: `Bearer ${this.accessToken}`, "user-agent": "MovieApi/0.5.0 (Kinoma)" }, signal: controller.signal });
      if (response.status === 401 || response.status === 403) throw new TmdbProviderError("TMDB authentication failed.", "UNAUTHORIZED", response.status);
      if (response.status === 404) throw new TmdbProviderError("TMDB resource was not found.", "NOT_FOUND", 404);
      if (response.status === 429) throw new TmdbProviderError("TMDB rate limit was reached.", "RATE_LIMIT", 429);
      if (!response.ok) throw new TmdbProviderError(`TMDB returned HTTP ${response.status}.`, "HTTP_ERROR", response.status);
      let payload: unknown;
      try { payload = await response.json(); } catch { throw new TmdbProviderError("TMDB returned invalid JSON.", "INVALID_RESPONSE", 502); }
      const parsed = schema.safeParse(payload);
      if (!parsed.success) throw new TmdbProviderError("TMDB returned an invalid response.", "INVALID_RESPONSE", 502);
      return parsed.data;
    } catch (error) {
      if (error instanceof TmdbProviderError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") throw new TmdbProviderError("TMDB request timed out.", "TIMEOUT", 504);
      if (error instanceof TypeError) throw new TmdbProviderError("TMDB request failed.", "HTTP_ERROR", 502);
      throw error;
    } finally { clearTimeout(timeout); }
  }

  private query(params: Record<string, string | number | undefined>) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== undefined) query.set(key, String(value));
    return query.toString();
  }

  searchTv(query: string, page = 1, language = "en-US") {
    return this.get(`/search/tv?${this.query({ query, page, language, include_adult: "false" })}`, tmdbSearchTvSchema, 60_000, 300_000);
  }
  searchMovie(query: string, page = 1, language = "en-US") {
    return this.get(`/search/movie?${this.query({ query, page, language, include_adult: "false" })}`, tmdbSearchMovieSchema, 60_000, 300_000);
  }
  discoverMovie(options: { page?: number; sortBy?: string; primaryReleaseDateGte?: string; primaryReleaseDateLte?: string; withGenres?: string; language?: string; region?: string } = {}) {
    return this.get(`/discover/movie?${this.query({ include_adult: "false", include_video: "false", language: options.language ?? "en-US", page: options.page ?? 1, sort_by: options.sortBy ?? "popularity.desc", "primary_release_date.gte": options.primaryReleaseDateGte, "primary_release_date.lte": options.primaryReleaseDateLte, with_genres: options.withGenres, region: options.region })}`, tmdbMovieListSchema, 60_000, 300_000);
  }
  discoverTv(options: { page?: number; sortBy?: string; firstAirDateGte?: string; firstAirDateLte?: string; withGenres?: string; language?: string } = {}) {
    return this.get(`/discover/tv?${this.query({ include_adult: "false", include_null_first_air_dates: "false", language: options.language ?? "en-US", page: options.page ?? 1, sort_by: options.sortBy ?? "popularity.desc", "first_air_date.gte": options.firstAirDateGte, "first_air_date.lte": options.firstAirDateLte, with_genres: options.withGenres })}`, tmdbTvListSchema, 60_000, 300_000);
  }
  popularMovies(page = 1, language = "en-US", region?: string) {
    return this.get(`/movie/popular?${this.query({ language, page, region })}`, tmdbMovieListSchema, 60_000, 300_000);
  }
  popularTv(page = 1, language = "en-US") {
    return this.get(`/tv/popular?${this.query({ language, page })}`, tmdbTvListSchema, 60_000, 300_000);
  }
  upcomingMovies(page = 1, region?: string, language = "en-US") {
    return this.get(`/movie/upcoming?${this.query({ language, page, region })}`, tmdbMovieListSchema, 300_000, 900_000);
  }
  onTheAirTv(page = 1, language = "en-US") {
    return this.get(`/tv/on_the_air?${this.query({ language, page })}`, tmdbTvListSchema, 300_000, 900_000);
  }
  trending(timeWindow: "day" | "week" = "day", language = "en-US") {
    return this.get(`/trending/all/${timeWindow}?${this.query({ language })}`, tmdbTrendingSchema, 60_000, 300_000);
  }
  movieRecommendations(id: number, page = 1, language = "en-US") {
    return this.get(`/movie/${id}/recommendations?${this.query({ language, page })}`, tmdbMovieListSchema, 300_000, 900_000);
  }
  tvRecommendations(id: number, page = 1, language = "en-US") {
    return this.get(`/tv/${id}/recommendations?${this.query({ language, page })}`, tmdbTvListSchema, 300_000, 900_000);
  }
  movieGenres(language = "en") {
    return this.get(`/genre/movie/list?${this.query({ language })}`, tmdbGenresSchema, 86_400_000, 604_800_000);
  }
  tvGenres(language = "en") {
    return this.get(`/genre/tv/list?${this.query({ language })}`, tmdbGenresSchema, 86_400_000, 604_800_000);
  }
  getTv(id: number): Promise<TmdbTvDetails> {
    return this.get(`/tv/${id}`, tmdbTvDetailsSchema, 600_000, 3_600_000);
  }
  getMovie(id: number): Promise<TmdbMovieDetails> {
    return this.get(`/movie/${id}`, tmdbMovieDetailsSchema, 600_000, 3_600_000);
  }
  getTvSeason(id: number, season: number): Promise<z.infer<typeof tmdbTvSeasonSchema>> {
    return this.get(`/tv/${id}/season/${season}`, tmdbTvSeasonSchema, 600_000, 3_600_000);
  }
  findByExternalId(externalId: string, externalSource = "imdb_id") {
    return this.get(`/find/${encodeURIComponent(externalId)}?external_source=${encodeURIComponent(externalSource)}`, tmdbFindSchema, 300_000, 900_000);
  }
}
