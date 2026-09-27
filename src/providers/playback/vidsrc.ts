import { playbackSourceSchema, type PlaybackSource } from "./schemas.js";
import type { PlaybackProvider } from "./provider.js";

export type VidSrcDirectResolver = {
  resolveMovie?: (tmdbId: number) => Promise<PlaybackSource | null>;
  resolveTvEpisode?: (tmdbId: number, season: number, episode: number) => Promise<PlaybackSource | null>;
};

export type VidSrcOptions = {
  baseUrl?: string;
  directResolver?: VidSrcDirectResolver;
};

export class VidSrcProviderError extends Error {
  constructor(message: string, public readonly kind: "UNCONFIGURED" | "INVALID_REQUEST") {
    super(message);
    this.name = "VidSrcProviderError";
  }
}

export class VidSrcProvider implements PlaybackProvider {
  readonly name = "vidsrc";
  private readonly baseUrl?: string;
  private readonly directResolver?: VidSrcDirectResolver;

  constructor(options: VidSrcOptions = {}) {
    const configured = options.baseUrl?.trim();
    this.baseUrl = configured ? configured.replace(/\/$/, "") : undefined;
    this.directResolver = options.directResolver;
  }

  get enabled() { return Boolean(this.baseUrl); }

  getHealth() {
    return { provider: this.name, configured: this.enabled, mode: "hybrid" as const };
  }

  async getMovieSources(tmdbId: number): Promise<PlaybackSource[]> {
    const direct = await this.resolveDirectMovie(tmdbId);
    return direct ? [direct, this.movieEmbedSource(tmdbId)] : [this.movieEmbedSource(tmdbId)];
  }

  async getTvEpisodeSources(tmdbId: number, season: number, episode: number): Promise<PlaybackSource[]> {
    const direct = await this.resolveDirectTvEpisode(tmdbId, season, episode);
    return direct ? [direct, this.tvEpisodeEmbedSource(tmdbId, season, episode)] : [this.tvEpisodeEmbedSource(tmdbId, season, episode)];
  }

  private async resolveDirectMovie(tmdbId: number): Promise<PlaybackSource | null> {
    if (!this.directResolver?.resolveMovie) return null;
    try {
      const source = await this.directResolver.resolveMovie(tmdbId);
      return source ? playbackSourceSchema.parse(source) : null;
    } catch { return null; }
  }

  private async resolveDirectTvEpisode(tmdbId: number, season: number, episode: number): Promise<PlaybackSource | null> {
    if (!this.directResolver?.resolveTvEpisode) return null;
    try {
      const source = await this.directResolver.resolveTvEpisode(tmdbId, season, episode);
      return source ? playbackSourceSchema.parse(source) : null;
    } catch { return null; }
  }

  private movieEmbedSource(tmdbId: number): PlaybackSource {
    if (!this.baseUrl) throw new VidSrcProviderError("VidSrc playback is not configured.", "UNCONFIGURED");
    return playbackSourceSchema.parse({
      id: `vidsrc-movie-${tmdbId}`, provider: this.name, type: "embed",
      url: `${this.baseUrl}/embed/movie/${tmdbId}`, title: "VidSrc",
      quality: null, language: null, subtitles: [], expiresAt: null, requiresClientPlayback: true
    });
  }

  private tvEpisodeEmbedSource(tmdbId: number, season: number, episode: number): PlaybackSource {
    if (!this.baseUrl) throw new VidSrcProviderError("VidSrc playback is not configured.", "UNCONFIGURED");
    return playbackSourceSchema.parse({
      id: `vidsrc-tv-${tmdbId}-s${season}-e${episode}`, provider: this.name, type: "embed",
      url: `${this.baseUrl}/embed/tv/${tmdbId}/${season}/${episode}`, title: "VidSrc",
      quality: null, language: null, subtitles: [], expiresAt: null, requiresClientPlayback: true
    });
  }
}
