import { MemoryCache, ProviderHealth, CircuitBreaker, isRetryableProviderError, withRetry } from "../../reliability.js";
import { TmdbProviderError } from "./client.js";
import { tmdbVideosResponseSchema } from "./video-schemas.js";
import { normalizeTmdbVideo, selectPrimaryTrailer, type NormalizedVideo } from "./video-normalizer.js";

export class TmdbVideoClient {
  private readonly cache = new MemoryCache<unknown>(1000);
  private readonly breaker = new CircuitBreaker();
  private readonly health = new ProviderHealth();

  constructor(private readonly options: { accessToken?: string; baseUrl?: string; timeoutMs?: number }) {}

  get enabled() { return Boolean(this.options.accessToken); }

  getHealth() {
    return {
      provider: "tmdb-videos",
      configured: this.enabled,
      ...this.health.snapshot(),
      circuit: this.breaker.snapshot(),
      cache: this.cache.stats()
    };
  }

  getMovieVideos(id: number, language = "en-US") {
    return this.get(`/movie/${id}/videos`, language);
  }

  getTvVideos(id: number, language = "en-US") {
    return this.get(`/tv/${id}/videos`, language);
  }

  getTvSeasonVideos(id: number, season: number, language = "en-US") {
    return this.get(`/tv/${id}/season/${season}/videos`, language);
  }

  getTvEpisodeVideos(id: number, season: number, episode: number, language = "en-US") {
    return this.get(`/tv/${id}/season/${season}/episode/${episode}/videos`, language);
  }

  async getPrimaryTrailer(
    type: "movie" | "tv",
    id: number,
    options: { season?: number; episode?: number; language?: string } = {}
  ): Promise<NormalizedVideo | null> {
    if (!this.enabled) return null;

    const language = options.language ?? "en-US";
    const requests = type === "movie"
      ? [
          () => this.getMovieVideos(id, language)
        ]
      : [
          () => this.getTvVideos(id, language),
          // TMDB TV pages can have no series-level videos. The premiere
          // episode is the canonical fallback used for a show trailer.
          () => this.getTvEpisodeVideos(id, options.season ?? 1, options.episode ?? 1, language)
        ];

    for (const load of requests) {
      try {
        const trailer = selectPrimaryTrailer(await load());
        if (trailer) return trailer;
      } catch {
        // A missing show/season video list must not block the next fallback source.
      }
    }

    return null;
  }

  private async get(path: string, language: string): Promise<NormalizedVideo[]> {
    if (!this.enabled) throw new TmdbProviderError("TMDB is not configured.", "UNCONFIGURED", 503);
    const base = (this.options.baseUrl ?? "https://api.themoviedb.org/3").replace(/\/$/, "");
    const cached = await this.cache.getOrSet(`${path}?${language}`, async () => {
      if (!this.breaker.canRequest()) throw new TmdbProviderError("TMDB circuit is open.", "CIRCUIT_OPEN", 503);
      const started = Date.now();
      try {
        const value = await withRetry(async () => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 8000);
          try {
            const response = await fetch(
              `${base}${path}?language=${encodeURIComponent(language)}&include_video_language=en,null`,
              {
                headers: {
                  accept: "application/json",
                  authorization: `Bearer ${this.options.accessToken}`,
                  "user-agent": "MovieApi/0.9.0 (Panda.fun)"
                },
                signal: controller.signal
              }
            );
            if (response.status === 401 || response.status === 403) throw new TmdbProviderError("TMDB authentication failed.", "UNAUTHORIZED", response.status);
            if (response.status === 404) throw new TmdbProviderError("TMDB resource was not found.", "NOT_FOUND", 404);
            if (response.status === 429) throw new TmdbProviderError("TMDB rate limit was reached.", "RATE_LIMIT", 429);
            if (!response.ok) throw new TmdbProviderError(`TMDB returned HTTP ${response.status}.`, "HTTP_ERROR", response.status);
            let payload: unknown;
            try { payload = await response.json(); }
            catch { throw new TmdbProviderError("TMDB returned invalid JSON.", "INVALID_RESPONSE", 502); }
            const parsed = tmdbVideosResponseSchema.safeParse(payload);
            if (!parsed.success) throw new TmdbProviderError("TMDB returned an invalid video response.", "INVALID_RESPONSE", 502);
            return parsed.data.results.map(normalizeTmdbVideo);
          } catch (error) {
            if (error instanceof TmdbProviderError) throw error;
            if (error instanceof DOMException && error.name === "AbortError") throw new TmdbProviderError("TMDB request timed out.", "TIMEOUT", 504);
            if (error instanceof TypeError) throw new TmdbProviderError("TMDB request failed.", "HTTP_ERROR", 502);
            throw error;
          } finally {
            clearTimeout(timeout);
          }
        }, { attempts: 3, baseDelayMs: 150, maxDelayMs: 1500, shouldRetry: isRetryableProviderError });
        this.breaker.onSuccess();
        this.health.recordSuccess(Date.now() - started);
        return value;
      } catch (error) {
        this.breaker.onFailure();
        this.health.recordFailure(Date.now() - started);
        throw error;
      }
    }, 300_000, 900_000);

    return cached.value as NormalizedVideo[];
  }
}
