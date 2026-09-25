import { z } from "zod";
import { CircuitBreaker, MemoryCache, ProviderHealth, isRetryableProviderError, withRetry } from "../../reliability.js";
import {
  tmdbFindSchema,
  tmdbMovieDetailsSchema,
  tmdbSearchMovieSchema,
  tmdbSearchTvSchema,
  tmdbTvDetailsSchema,
  type TmdbMovieDetails,
  type TmdbTvDetails
} from "./schemas.js";

export const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export type TmdbClientOptions = {
  accessToken?: string;
  baseUrl?: string;
  timeoutMs?: number;
};

export class TmdbProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: "UNCONFIGURED" | "TIMEOUT" | "RATE_LIMIT" | "HTTP_ERROR" | "INVALID_RESPONSE" | "NOT_FOUND" | "UNAUTHORIZED" | "CIRCUIT_OPEN",
    public readonly status?: number
  ) {
    super(message);
    this.name = "TmdbProviderError";
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

  get enabled() {
    return Boolean(this.accessToken);
  }

  private async get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    if (!this.accessToken) {
      throw new TmdbProviderError("TMDB is not configured.", "UNCONFIGURED", 503);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.accessToken}`,
          "user-agent": "MovieApi/0.3.0 (Kinoma)"
        },
        signal: controller.signal
      });

      if (response.status === 401 || response.status === 403) {
        throw new TmdbProviderError("TMDB authentication failed.", "UNAUTHORIZED", response.status);
      }
      if (response.status === 404) {
        throw new TmdbProviderError("TMDB resource was not found.", "NOT_FOUND", 404);
      }
      if (response.status === 429) {
        throw new TmdbProviderError("TMDB rate limit was reached.", "RATE_LIMIT", 429);
      }
      if (!response.ok) {
        throw new TmdbProviderError(`TMDB returned HTTP ${response.status}.`, "HTTP_ERROR", response.status);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new TmdbProviderError("TMDB returned invalid JSON.", "INVALID_RESPONSE", 502);
      }

      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        throw new TmdbProviderError("TMDB returned an invalid response.", "INVALID_RESPONSE", 502);
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof TmdbProviderError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new TmdbProviderError("TMDB request timed out.", "TIMEOUT", 504);
      }
      if (error instanceof TypeError) {
        throw new TmdbProviderError("TMDB request failed.", "HTTP_ERROR", 502);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  searchTv(query: string, page = 1, language = "en-US") {
    return this.get(
      `/search/tv?query=${encodeURIComponent(query)}&page=${page}&language=${encodeURIComponent(language)}&include_adult=false`,
      tmdbSearchTvSchema
    );
  }

  searchMovie(query: string, page = 1, language = "en-US") {
    return this.get(
      `/search/movie?query=${encodeURIComponent(query)}&page=${page}&language=${encodeURIComponent(language)}&include_adult=false`,
      tmdbSearchMovieSchema
    );
  }

  getTv(id: number): Promise<TmdbTvDetails> {
    return this.get(`/tv/${id}`, tmdbTvDetailsSchema, 600_000, 3_600_000);
  }

  getMovie(id: number): Promise<TmdbMovieDetails> {
    return this.get(`/movie/${id}`, tmdbMovieDetailsSchema, 600_000, 3_600_000);
  }

  findByExternalId(externalId: string, externalSource = "imdb_id") {
    return this.get(
      `/find/${encodeURIComponent(externalId)}?external_source=${encodeURIComponent(externalSource)}`,
      tmdbFindSchema
    );
  }
}
