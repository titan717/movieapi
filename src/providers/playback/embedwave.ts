import type { PlaybackSource } from "./schemas.js";

export type EmbedWaveProviderOptions = {
  baseUrl?: string;
  moviePath?: string;
  tvPath?: string;
};

export class EmbedWaveProviderError extends Error {
  constructor(
    public readonly kind: "UNCONFIGURED" | "INVALID",
    message: string
  ) {
    super(message);
    this.name = "EmbedWaveProviderError";
  }
}

function applyTemplate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(movieId|tmdbId|season|episode)\}/g, (_, key) => encodeURIComponent(String(values[key])));
}

export class EmbedWaveProvider {
  readonly name = "embedwave";
  readonly enabled = true;
  private readonly baseUrl: string;
  private readonly moviePath: string;
  private readonly tvPath: string;
  private readonly query = "autoplay=1&nobrand=1";

  constructor(options: EmbedWaveProviderOptions = {}) {
    this.baseUrl = (options.baseUrl || "https://embedwave.cc").replace(/\/$/, "");
    this.moviePath = options.moviePath || "/embed/movie/{tmdbId}";
    this.tvPath = options.tvPath || "/embed/tv/{tmdbId}/{season}/{episode}";
  }

  getHealth() {
    return {
      provider: this.name,
      configured: true,
      mode: "embed" as const
    };
  }

  getMovieSources(tmdbId: number): PlaybackSource[] {
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
      throw new EmbedWaveProviderError("INVALID", "A valid TMDB movie ID is required.");
    }
    const url = this.build(this.moviePath, { tmdbId, movieId: tmdbId });
    return [{
      id: `embedwave-movie-${tmdbId}`,
      provider: this.name,
      type: "embed",
      url,
      title: "EmbedWave",
      quality: "auto",
      language: null,
      subtitles: [],
      expiresAt: null,
      requiresClientPlayback: true
    }];
  }

  getTvEpisodeSources(tmdbId: number, season: number, episode: number): PlaybackSource[] {
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !Number.isInteger(season) || season <= 0 || !Number.isInteger(episode) || episode <= 0) {
      throw new EmbedWaveProviderError("INVALID", "Valid TMDB, season, and episode IDs are required.");
    }
    const url = this.build(this.tvPath, { tmdbId, movieId: tmdbId, season, episode });
    return [{
      id: `embedwave-tv-${tmdbId}-s${season}e${episode}`,
      provider: this.name,
      type: "embed",
      url,
      title: "EmbedWave",
      quality: "auto",
      language: null,
      subtitles: [],
      expiresAt: null,
      requiresClientPlayback: true
    }];
  }

  private build(template: string, values: Record<string, string | number>) {
    const path = applyTemplate(template.startsWith("/") ? template : "/" + template, values);
    return this.baseUrl + path + (path.includes("?") ? "&" : "?") + this.query;
  }
}
