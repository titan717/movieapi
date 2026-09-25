import { z } from "zod";
import { playbackSourceSchema, type PlaybackSource } from "./schemas.js";

export type VidSrcOptions = {
  baseUrl?: string;
};

export class VidSrcProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: "UNCONFIGURED" | "INVALID_REQUEST"
  ) {
    super(message);
    this.name = "VidSrcProviderError";
  }
}

export class VidSrcProvider {
  private readonly baseUrl?: string;

  constructor(options: VidSrcOptions = {}) {
    const configured = options.baseUrl?.trim();
    this.baseUrl = configured ? configured.replace(/\/$/, "") : undefined;
  }

  get enabled() {
    return Boolean(this.baseUrl);
  }

  getHealth() {
    return {
      provider: "vidsrc",
      configured: this.enabled,
      mode: "embed"
    };
  }

  getMovieSources(tmdbId: number): PlaybackSource[] {
    return [this.movieSource(tmdbId)];
  }

  getTvEpisodeSources(tmdbId: number, season: number, episode: number): PlaybackSource[] {
    return [this.tvEpisodeSource(tmdbId, season, episode)];
  }

  private movieSource(tmdbId: number): PlaybackSource {
    if (!this.baseUrl) throw new VidSrcProviderError("VidSrc playback is not configured.", "UNCONFIGURED");
    return playbackSourceSchema.parse({
      id: `vidsrc-movie-${tmdbId}`,
      provider: "vidsrc",
      type: "embed",
      url: `${this.baseUrl}/embed/movie/${tmdbId}`,
      title: "VidSrc",
      quality: null,
      language: null,
      subtitles: [],
      expiresAt: null,
      requiresClientPlayback: true
    });
  }

  private tvEpisodeSource(tmdbId: number, season: number, episode: number): PlaybackSource {
    if (!this.baseUrl) throw new VidSrcProviderError("VidSrc playback is not configured.", "UNCONFIGURED");
    return playbackSourceSchema.parse({
      id: `vidsrc-tv-${tmdbId}-s${season}-e${episode}`,
      provider: "vidsrc",
      type: "embed",
      url: `${this.baseUrl}/embed/tv/${tmdbId}/${season}/${episode}`,
      title: "VidSrc",
      quality: null,
      language: null,
      subtitles: [],
      expiresAt: null,
      requiresClientPlayback: true
    });
  }
}
