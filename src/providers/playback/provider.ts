import type { PlaybackSource } from "./schemas.js";

export type PlaybackProvider = {
  readonly name: string;
  readonly enabled: boolean;
  getHealth(): {
    provider: string;
    configured: boolean;
    mode: "direct" | "embed" | "hybrid";
  };
  getMovieSources(tmdbId: number): PlaybackSource[] | Promise<PlaybackSource[]>;
  getTvEpisodeSources(tmdbId: number, season: number, episode: number): PlaybackSource[] | Promise<PlaybackSource[]>;
};
