import { z } from "zod";
import { CircuitBreaker, MemoryCache, ProviderHealth, isRetryableProviderError, withRetry } from "../../reliability.js";
import { episodeSchema, scheduleEpisodeSchema, searchResultSchema, seasonSchema, showSchema, type TvmazeEpisode, type TvmazeSeason, type TvmazeShow } from "./schemas.js";

export const TVMAZE_BASE_URL = "https://api.tvmaze.com";

export type TvmazeClientOptions = { baseUrl?: string; userAgent?: string; timeoutMs?: number };

export class TvmazeProviderError extends Error {
  constructor(message: string, public readonly kind: "TIMEOUT" | "RATE_LIMIT" | "HTTP_ERROR" | "INVALID_RESPONSE" | "NOT_FOUND" | "CIRCUIT_OPEN", public readonly status?: number) {
    super(message); this.name = "TvmazeProviderError";
  }
}

export class TvmazeClient {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly cache = new MemoryCache<unknown>(1500);
  private readonly breaker = new CircuitBreaker();
  private readonly health = new ProviderHealth();

  constructor(options: TvmazeClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? TVMAZE_BASE_URL).replace(/\/$/, "");
    this.userAgent = options.userAgent ?? "MovieApi/0.4.0 (Kinoma)";
    this.timeoutMs = options.timeoutMs ?? 8_000;
  }

  getHealth() { return { provider: "tvmaze", configured: true, ...this.health.snapshot(), circuit: this.breaker.snapshot(), cache: this.cache.stats() }; }

  private async get<T>(path: string, schema: z.ZodType<T>, ttlMs = 300_000, staleTtlMs = 900_000): Promise<T> {
    const cached = await this.cache.getOrSet(path, async () => {
      if (!this.breaker.canRequest()) throw new TvmazeProviderError("TVmaze circuit is open.", "CIRCUIT_OPEN", 503);
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
      const response = await fetch(`${this.baseUrl}${path}`, { headers: { accept: "application/json", "user-agent": this.userAgent }, signal: controller.signal });
      if (response.status === 404) throw new TvmazeProviderError("TVmaze resource was not found.", "NOT_FOUND", 404);
      if (response.status === 429) throw new TvmazeProviderError("TVmaze rate limit was reached.", "RATE_LIMIT", 429);
      if (!response.ok) throw new TvmazeProviderError(`TVmaze returned HTTP ${response.status}.`, "HTTP_ERROR", response.status);
      let payload: unknown;
      try { payload = await response.json(); } catch { throw new TvmazeProviderError("TVmaze returned invalid JSON.", "INVALID_RESPONSE", 502); }
      const parsed = schema.safeParse(payload);
      if (!parsed.success) throw new TvmazeProviderError("TVmaze returned an invalid response.", "INVALID_RESPONSE", 502);
      return parsed.data;
    } catch (error) {
      if (error instanceof TvmazeProviderError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") throw new TvmazeProviderError("TVmaze request timed out.", "TIMEOUT", 504);
      if (error instanceof TypeError) throw new TvmazeProviderError("TVmaze request failed.", "HTTP_ERROR", 502);
      throw error;
    } finally { clearTimeout(timeout); }
  }

  searchShows(query: string) { return this.get(`/search/shows?q=${encodeURIComponent(query)}`, z.array(searchResultSchema), 60_000, 300_000); }
  getShow(id: number): Promise<TvmazeShow> { return this.get(`/shows/${id}`, showSchema, 600_000, 3_600_000); }
  getShowEpisodes(id: number, specials = false): Promise<TvmazeEpisode[]> { return this.get(`/shows/${id}/episodes${specials ? "?specials=1" : ""}`, z.array(episodeSchema), 600_000, 3_600_000); }
  getShowSeasons(id: number): Promise<TvmazeSeason[]> { return this.get(`/shows/${id}/seasons`, z.array(seasonSchema), 600_000, 3_600_000); }
  getSeasonEpisodes(seasonId: number): Promise<TvmazeEpisode[]> { return this.get(`/seasons/${seasonId}/episodes`, z.array(episodeSchema), 3_600_000, 86_400_000); }
  getEpisodeByNumber(showId: number, season: number, episode: number): Promise<TvmazeEpisode> { return this.get(`/shows/${showId}/episodebynumber?season=${season}&number=${episode}`, episodeSchema, 600_000, 3_600_000); }
  getShowImages(id: number) {
    return this.get(`/shows/${id}/images`, z.array(z.object({ id: z.number().int(), type: z.string().nullable().optional(), main: z.boolean().optional(), resolutions: z.record(z.string(), z.object({ url: z.string().url(), width: z.number().int().positive().optional(), height: z.number().int().positive().optional() }).passthrough()).optional() }).passthrough()), 86_400_000, 604_800_000);
  }
  getSchedule(country = "US", date?: string) {
    const params = new URLSearchParams(); if (country) params.set("country", country); if (date) params.set("date", date);
    const query = params.toString(); return this.get(`/schedule${query ? `?${query}` : ""}`, z.array(scheduleEpisodeSchema), 300_000, 900_000);
  }
}
