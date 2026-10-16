import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";

const base: Config = {
  apiKeys: new Set(["test-key"]),
  authRequired: false,
  rateLimit: 100,
  rateWindowMs: 60_000,
  tvmaze: { baseUrl: "https://api.tvmaze.com", userAgent: "MovieApi-test", timeoutMs: 1_000 },
  tmdb: { accessToken: "tmdb-test-token", baseUrl: "https://api.themoviedb.org/3", timeoutMs: 1_000 },
  vidy: { baseUrl: "https://vidy.st", moviePath: "/movie/{tmdbId}", tvPath: "/tv/{tmdbId}/{season}/{episode}" },
  corsOrigin: "*",
  port: 3000
};

afterEach(() => vi.unstubAllGlobals());

describe("canonical TMDB TV details", () => {
  it("returns TMDB title, synopsis, artwork, and normalized trailer", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/tv/95350/videos")) {
        return new Response(JSON.stringify({
          id: 95350,
          results: [{
            id: "lanterns-trailer",
            iso_639_1: "en",
            iso_3166_1: "US",
            key: "LANTRAILER",
            name: "Lanterns — Official Trailer",
            site: "YouTube",
            size: 1080,
            type: "Trailer",
            official: true,
            published_at: "2026-08-20T00:00:00Z"
          }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/tv/95350")) {
        return new Response(JSON.stringify({
          id: 95350,
          name: "Lanterns",
          original_name: "Lanterns",
          overview: "TMDB canonical synopsis.",
          first_air_date: "2026-08-23",
          poster_path: "/lanterns.jpg",
          backdrop_path: "/lanterns-backdrop.jpg",
          vote_average: 8.7,
          genres: [{ id: 18, name: "Drama" }],
          episode_run_time: [55],
          status: "Returning Series",
          original_language: "en"
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error("Unexpected upstream request: " + url);
    }));

    const response = await createApp(base).request("/api/v1/details/tv/95350");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.title).toBe("Lanterns");
    expect(body.data.overview).toBe("TMDB canonical synopsis.");
    expect(body.data.poster).toContain("https://image.tmdb.org/t/p/original/lanterns.jpg");
    expect(body.data.ids.tmdb).toBe(95350);
    expect(body.data.trailer.embedUrl).toBe("https://www.youtube.com/embed/LANTRAILER");
    expect(body.data.trailer.type).toBe("Trailer");
    expect(body.data.trailer.official).toBe(true);
  });
});
