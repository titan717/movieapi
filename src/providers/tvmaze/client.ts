import { z } from "zod";
import {
  episodeSchema,
  scheduleEpisodeSchema,
  searchResultSchema,
  seasonSchema,
  showSchema,
  type TvmazeEpisode,
  type TvmazeSeason,
  type TvmazeShow
} from "./schemas.js";

export const TVMAZE_BASE_URL = "https://api.tvmaze.com";

export type TvmazeClientOptions = {
  baseUrl?: string;
  userAgent?: string;
  timeoutMs?: number;
};

export class TvmazeProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: "TIMEOUT" | "RATE_LIMIT" | "HTTP_ERROR" | "INVALID_RESPONSE" | "NOT_FOUND",
    public readonly status?: number
  ) {
    super(message);
    this.name = "TvmazeProviderError";
  }
}

export class TvmazeClient {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;

  constructor(options: TvmazeClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? TVMAZE_BASE_URL).replace(/\/$/, "");
    this.userAgent = options.userAgent ?? "MovieApi/0.2.0 (Kinoma)";
    this.timeoutMs = options.timeoutMs ?? 8_000;
  }

  private async get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          accept: "application/json",
          "user-agent": this.userAgent
        },
        signal: controller.signal
      });

      if (response.status === 404) {
        throw new TvmazeProviderError("TVmaze resource was not found.", "NOT_FOUND", 404);
      }
      if (response.status === 429) {
        throw new TvmazeProviderError("TVmaze rate limit was reached.", "RATE_LIMIT", 429);
      }
      if (!response.ok) {
        throw new TvmazeProviderError(`TVmaze returned HTTP ${response.status}.`, "HTTP_ERROR", response.status);
      }

      const payload: unknown = await response.json();
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        throw new TvmazeProviderError("TVmaze returned an invalid response.", "INVALID_RESPONSE", 502);
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof TvmazeProviderError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new TvmazeProviderError("TVmaze request timed out.", "TIMEOUT", 504);
      }
      if (error instanceof TypeError) {
        throw new TvmazeProviderError("TVmaze request failed.", "HTTP_ERROR", 502);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  searchShows(query: string) {
    return this.get(`/search/shows?q=${encodeURIComponent(query)}`, z.array(searchResultSchema));
  }

  getShow(id: number): Promise<TvmazeShow> {
    return this.get(`/shows/${id}`, showSchema);
  }

  getShowEpisodes(id: number, specials = false): Promise<TvmazeEpisode[]> {
    return this.get(`/shows/${id}/episodes${specials ? "?specials=1" : ""}`, z.array(episodeSchema));
  }

  getShowSeasons(id: number): Promise<TvmazeSeason[]> {
    return this.get(`/shows/${id}/seasons`, z.array(seasonSchema));
  }

  getSeasonEpisodes(seasonId: number): Promise<TvmazeEpisode[]> {
    return this.get(`/seasons/${seasonId}/episodes`, z.array(episodeSchema));
  }

  getEpisodeByNumber(showId: number, season: number, episode: number): Promise<TvmazeEpisode> {
    return this.get(
      `/shows/${showId}/episodebynumber?season=${season}&number=${episode}`,
      episodeSchema
    );
  }

  getShowImages(id: number) {
    return this.get(
      `/shows/${id}/images`,
      z.array(z.object({
        id: z.number().int(),
        type: z.string().nullable().optional(),
        main: z.boolean().optional(),
        resolutions: z.record(z.string(), z.object({
          url: z.string().url(),
          width: z.number().int().positive().optional(),
          height: z.number().int().positive().optional()
        }).passthrough()).optional()
      }).passthrough())
    );
  }

  getSchedule(country = "US", date?: string) {
    const params = new URLSearchParams();
    if (country) params.set("country", country);
    if (date) params.set("date", date);
    const query = params.toString();
    return this.get(`/schedule${query ? `?${query}` : ""}`, z.array(scheduleEpisodeSchema));
  }
}
