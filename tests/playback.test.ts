import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createPlaybackRoutes } from "../src/providers/playback/routes.js";
import { VidSrcProvider } from "../src/providers/playback/vidsrc.js";
import type { Config } from "../src/config.js";

const base: Config = {
  apiKeys: new Set(["test-key"]),
  authRequired: false,
  rateLimit: 100,
  rateWindowMs: 60_000,
  tvmaze: { baseUrl: "https://api.tvmaze.com", userAgent: "MovieApi-test", timeoutMs: 1000 },
  tmdb: { accessToken: "tmdb-test-token", baseUrl: "https://api.themoviedb.org/3", timeoutMs: 1000 },
  vidsrc: { baseUrl: "https://vidsrc.sh" },
  corsOrigin: "*",
  port: 3000
};

afterEach(() => {});

describe("MovieApi Phase 8 playback", () => {
  it("returns a provider-neutral movie playback source", async () => {
    const response = await createApp(base).request("/api/v1/movie/11/sources");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.mediaType).toBe("movie");
    expect(body.data.mode).toBe("embed");
    expect(body.data.sources[0]).toMatchObject({
      provider: "vidsrc",
      type: "embed",
      requiresClientPlayback: true
    });
    expect(body.data.sources[0].url).toBe("https://vidsrc.sh/embed/movie/11");
  });

  it("resolves a TVMaze ID to a TMDB ID before playback", async () => {
    const provider = new VidSrcProvider(base.vidsrc);
    const app = createPlaybackRoutes(provider, async (id) => id === 169 ? 1396 : null);
    const response = await app.request("/tv/169/season/1/episode/1/sources");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.tmdbId).toBe(1396);
    expect(body.data.mode).toBe("embed");
    expect(body.data.sources[0].url).toBe("https://vidsrc.sh/embed/tv/1396/1/1");
  });

  it("returns an episode playback source", async () => {
    const provider = new VidSrcProvider(base.vidsrc);
    const app = createPlaybackRoutes(provider);
    const response = await app.request("/tv/1399/season/1/episode/1/play");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.mediaType).toBe("tv_episode");
    expect(body.data.mode).toBe("embed");
    expect(body.data.source.url).toBe("https://vidsrc.sh/embed/tv/1399/1/1");
  });


  it("prefers a validated direct movie source and keeps embed fallback", async () => {
    const provider = new VidSrcProvider({
      ...base.vidsrc,
      directResolver: {
        resolveMovie: async (tmdbId) => ({
          id: `direct-movie-${tmdbId}`,
          provider: "authorized-direct",
          type: "hls",
          url: "https://media.example.com/movie.m3u8",
          title: "Authorized HLS",
          quality: "1080p",
          language: "en",
          subtitles: [],
          expiresAt: null,
          requiresClientPlayback: false
        })
      }
    });
    const app = createPlaybackRoutes(provider);
    const response = await app.request("/movie/11/play");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.mode).toBe("hybrid");
    expect(body.data.source.type).toBe("hls");
    expect(body.data.source.requiresClientPlayback).toBe(false);
  });

  it("falls back to embed when the direct resolver returns nothing", async () => {
    const provider = new VidSrcProvider({
      ...base.vidsrc,
      directResolver: {
        resolveMovie: async () => null
      }
    });
    const app = createPlaybackRoutes(provider);
    const response = await app.request("/movie/11/play");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.mode).toBe("embed");
    expect(body.data.source.type).toBe("embed");
    expect(body.data.source.url).toBe("https://vidsrc.sh/embed/movie/11");
  });

  it("ignores an invalid direct source and falls back to embed", async () => {
    const provider = new VidSrcProvider({
      ...base.vidsrc,
      directResolver: {
        resolveMovie: async () => ({
          id: "bad",
          provider: "authorized-direct",
          type: "hls",
          url: "not-a-url",
          title: "Invalid",
          quality: null,
          language: null,
          subtitles: [],
          expiresAt: null,
          requiresClientPlayback: false
        } as any)
      }
    });
    const app = createPlaybackRoutes(provider);
    const response = await app.request("/movie/11/play");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.mode).toBe("embed");
    expect(body.data.source.type).toBe("embed");
  });

  it("rejects invalid playback identifiers", async () => {
    const response = await createApp(base).request("/api/v1/movie/nope/sources");
    expect(response.status).toBe(400);
  });

  it("reports an unconfigured playback provider", async () => {
    const config = { ...base, vidsrc: { baseUrl: "" } };
    const response = await createApp(config).request("/api/v1/movie/11/sources");
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("PROVIDER_UNAVAILABLE");
  });
});
