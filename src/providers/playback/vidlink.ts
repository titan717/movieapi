import type { PlaybackSource } from "./schemas.js";

export class VidLinkProviderError extends Error {
  constructor(
    public readonly kind: "UNCONFIGURED" | "INVALID",
    message: string
  ) {
    super(message);
    this.name = "VidLinkProviderError";
  }
}

export type VidLinkProviderOptions = {
  baseUrl?: string;
};

export class VidLinkProvider {
  readonly name = "vidlink";
  readonly enabled = true;
  private readonly baseUrl: string;

  constructor(options: VidLinkProviderOptions = {}) {
    this.baseUrl = (options.baseUrl || "https://vidlink.pro").replace(/\/$/, "");
  }

  getHealth() {
    return {
      provider: this.name,
      configured: true,
      mode: "embed" as const
    };
  }

  private playerParams() {
    return new URLSearchParams({
      primaryColor: "A5D6A7",
      secondaryColor: "26362A",
      iconColor: "FFFFFF",
      icons: "default",
      player: "jw",
      title: "false",
      poster: "true",
      autoplay: "true",
      nextbutton: "true"
    });
  }

  getMovieSources(tmdbId: number): PlaybackSource[] {
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
      throw new VidLinkProviderError("INVALID", "A valid TMDB movie ID is required.");
    }
    const url = new URL(`${this.baseUrl}/movie/${tmdbId}`);
    url.search = this.playerParams().toString();
    return [{
      id: `vidlink-movie-${tmdbId}`,
      type: "embed",
      url: url.toString(),
      title: "VidLink JW",
      quality: "auto",
      language: null,
      subtitles: [],
      expiresAt: null,
      requiresClientPlayback: true,
      provider: this.name
    }];
  }

  getTvEpisodeSources(tmdbId: number, season: number, episode: number): PlaybackSource[] {
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !Number.isInteger(season) || season <= 0 || !Number.isInteger(episode) || episode <= 0) {
      throw new VidLinkProviderError("INVALID", "Valid TMDB, season, and episode IDs are required.");
    }
    const url = new URL(`${this.baseUrl}/tv/${tmdbId}/${season}/${episode}`);
    url.search = this.playerParams().toString();
    return [{
      id: `vidlink-tv-${tmdbId}-s${season}e${episode}`,
      type: "embed",
      url: url.toString(),
      title: "VidLink JW",
      quality: "auto",
      language: null,
      subtitles: [],
      expiresAt: null,
      requiresClientPlayback: true,
      provider: this.name
    }];
  }
}
