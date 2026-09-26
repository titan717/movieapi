import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
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

describe("MovieApi Phase 7 playback", () => {
  it("returns a provider-neutral movie playback source", async () => {
    const response = await createApp(base).request("/api/v1/movie/11/sources");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.mediaType).toBe("movie");
    expect(body.data.sources[0]).toMatchObject({
      provider: "vidsrc",
      type: "embed",
      requiresClientPlayback: true
    });
    expect(body.data.sources[0].url).toBe("https://vidsrc.sh/embed/movie/11");
  });

  it("returns an episode playback source", async () => {
    const response = await createApp(base).request("/api/v1/tv/1399/season/1/episode/1/play");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.mediaType).toBe("tv_episode");
    expect(body.data.source.url).toBe("https://vidsrc.sh/embed/tv/1399/1/1");
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
