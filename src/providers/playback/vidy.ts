import type { PlaybackSource } from "./schemas.js";

export type VidyProviderOptions = {
  baseUrl?: string;
  moviePath?: string;
  tvPath?: string;
};

export class VidyProviderError extends Error {
  constructor(
    public readonly kind: "UNCONFIGURED" | "INVALID",
    message: string
  ) {
    super(message);
    this.name = "VidyProviderError";
  }
}

function applyTemplate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(movieId|tmdbId|season|episode)\}/g, (_, key) =>
    encodeURIComponent(String(values[key]))
  );
}

export class VidyProvider {
  readonly name = "vidy";
  readonly enabled = true;
  private readonly baseUrl: string;
  private readonly moviePath: string;
  private readonly tvPath: string;

  constructor(options: VidyProviderOptions = {}) {
    this.baseUrl = (options.baseUrl || "https://vidy.st").replace(/\/$/, "");
    this.moviePath = options.moviePath || "/movie/{tmdbId}";
    this.tvPath = options.tvPath || "/tv/{tmdbId}/{season}/{episode}";
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
      throw new VidyProviderError("INVALID", "A valid TMDB movie ID is required.");
    }
    const url = this.build(this.moviePath, { tmdbId, movieId: tmdbId });
    return [{
      id: `vidy-movie-${tmdbId}`,
      provider: this.name,
      type: "embed",
      url,
      title: "Vidy",
      quality: "auto",
      language: "en",
      subtitles: [],
      expiresAt: null,
      requiresClientPlayback: true
    }];
  }

  getTvEpisodeSources(tmdbId: number, season: number, episode: number): PlaybackSource[] {
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !Number.isInteger(season) || season <= 0 || !Number.isInteger(episode) || episode <= 0) {
      throw new VidyProviderError("INVALID", "Valid TMDB, season, and episode IDs are required.");
    }
    const url = this.build(this.tvPath, { tmdbId, movieId: tmdbId, season, episode });
    return [{
      id: `vidy-tv-${tmdbId}-s${season}e${episode}`,
      provider: this.name,
      type: "embed",
      url,
      title: "Vidy",
      quality: "auto",
      language: "en",
      subtitles: [],
      expiresAt: null,
      requiresClientPlayback: true
    }];
  }

  private build(template: string, values: Record<string, string | number>) {
    const path = applyTemplate(template.startsWith("/") ? template : "/" + template, values);
    const separator = path.includes("?") ? "&" : "?";
    const params = path.startsWith("/tv/")
      ? "autoplay=true&nextEpisode=true&episodeSelector=true&autoplayNextEpisode=true"
      : "autoplay=true";
    return this.baseUrl + path + separator + params;
  }
}
