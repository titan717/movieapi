import { playbackSourceSchema, type PlaybackSource } from "./schemas.js";
import type { PlaybackProvider } from "./provider.js";
import type { VidLinkProvider } from "./vidlink.js";
import type { VidCoreResolver } from "./vidcore.js";

export type HybridPlaybackProviderOptions = {
  direct: VidCoreResolver;
  embed: VidLinkProvider;
};

export class HybridPlaybackProvider implements PlaybackProvider {
  readonly name = "panda-playback";
  readonly enabled = true;

  constructor(private readonly options: HybridPlaybackProviderOptions) {}

  getHealth() {
    const directEnabled = this.options.direct.enabled;
    return {
      provider: this.name,
      configured: this.options.embed.enabled,
      mode: directEnabled ? "hybrid" as const : "embed" as const
    };
  }

  async getMovieSources(tmdbId: number): Promise<PlaybackSource[]> {
    const embed = this.options.embed.getMovieSources(tmdbId);
    const direct = await this.resolveDirect(() => this.options.direct.resolveMovie(tmdbId));
    return direct ? [direct, ...embed] : embed;
  }

  async getTvEpisodeSources(tmdbId: number, season: number, episode: number): Promise<PlaybackSource[]> {
    const embed = this.options.embed.getTvEpisodeSources(tmdbId, season, episode);
    const direct = await this.resolveDirect(() => this.options.direct.resolveTvEpisode(tmdbId, season, episode));
    return direct ? [direct, ...embed] : embed;
  }

  private async resolveDirect(resolve: () => Promise<PlaybackSource | null>): Promise<PlaybackSource | null> {
    try {
      const source = await resolve();
      return source ? playbackSourceSchema.parse(source) : null;
    } catch {
      return null;
    }
  }
}
