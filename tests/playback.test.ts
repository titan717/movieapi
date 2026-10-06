import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createPlaybackRoutes } from "../src/providers/playback/routes.js";
import { VidyProvider } from "../src/providers/playback/vidy.js";
import type { Config } from "../src/config.js";

const base: Config = {
  apiKeys: new Set(["test-key"]),
  authRequired: false,
  rateLimit: 100,
  rateWindowMs: 60_000,
  tvmaze: { baseUrl: "https://api.tvmaze.com", userAgent: "MovieApi-test", timeoutMs: 1000 },
  tmdb: { accessToken: "tmdb-test-token", baseUrl: "https://api.themoviedb.org/3", timeoutMs: 1000 },
  vidy: {
    baseUrl: "https://vidy.st",
    moviePath: "/movie/{tmdbId}",
    tvPath: "/tv/{tmdbId}/{season}/{episode}"
  },
  corsOrigin: "*",
  port: 3000
};

describe("Vidy playback", () => {
  it("returns the only configured movie playback source", async () => {
    const response = await createApp(base).request("/api/v1/movie/11/sources");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.mode).toBe("embed");
    expect(body.data.sources).toHaveLength(1);
    expect(body.data.sources[0]).toMatchObject({
      provider: "vidy",
      type: "embed",
      requiresClientPlayback: true
    });
    expect(body.data.sources[0].url).toBe("https://vidy.st/movie/11?autoplay=true");
  });

  it("resolves a TVMaze ID to TMDB before creating the Vidy episode URL", async () => {
    const provider = new VidyProvider(base.vidy);
    const app = createPlaybackRoutes(provider, async (id) => id === 169 ? 1396 : null);
    const response = await app.request("/tv/169/season/1/episode/1/sources");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.tmdbId).toBe(1396);
    expect(body.data.sources[0].url).toBe("https://vidy.st/tv/1396/1/1?autoplay=true&nextEpisode=true&episodeSelector=true&autoplayNextEpisode=true");
  });

  it("returns an episode playback source", async () => {
    const response = await createApp(base).request("/api/v1/tv/1399/season/1/episode/1/play?tmdbId=1399");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.source.provider).toBe("vidy");
    expect(body.data.source.url).toBe("https://vidy.st/tv/1399/1/1?autoplay=true&nextEpisode=true&episodeSelector=true&autoplayNextEpisode=true");
  });

  it("rejects invalid playback identifiers", async () => {
    const response = await createApp(base).request("/api/v1/movie/nope/sources");
    expect(response.status).toBe(400);
  });

  it("reports Vidy as the active provider", async () => {
    const response = await createApp(base).request("/api/v1/health");
    const body = await response.json();
    expect(body.data.providers.playback.provider).toBe("vidy");
    expect(body.data.providers.playback.mode).toBe("embed");
  });
});
