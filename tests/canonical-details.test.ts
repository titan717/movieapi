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

describe("canonical TV detail enrichment", () => {
  it("returns TMDB title and synopsis plus a normalized trailer for a TVMaze show", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("api.tvmaze.com/shows/44776")) {
        return new Response(JSON.stringify({
          id: 44776,
          name: "Lanterns",
          type: "Scripted",
          language: "English",
          genres: ["Drama", "Mystery"],
          status: "Running",
          runtime: null,
          averageRuntime: 55,
          premiered: "2026-08-23",
          ended: null,
          officialSite: null,
          schedule: { time: "21:00", days: ["Sunday"], timezone: "America/New_York" },
          rating: { average: 8.6 },
          weight: 90,
          network: null,
          webChannel: null,
          dvdCountry: null,
          externals: { imdb: "tt24083908", thetvdb: null, tvrage: null },
          image: { medium: "https://example.com/lanterns-medium.jpg", original: "https://example.com/lanterns-original.jpg" },
          summary: "<p>TVMaze synopsis.</p>",
          updated: 1
        }), { status: 200 });
      }

      if (url.includes("/find/tt24083908")) {
        return new Response(JSON.stringify({
          tv_results: [{ id: 95350, name: "Lanterns", first_air_date: "2026-08-23" }]
        }), { status: 200 });
      }

      if (url.includes("/tv/95350/videos")) {
        return new Response(JSON.stringify({ id: 95350, results: [] }), { status: 200 });
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
        }), { status: 200 });
      }

      if (url.includes("/tv/95350/season/1/episode/1/videos")) {
        return new Response(JSON.stringify({
          id: 123456,
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
        }), { status: 200 });
      }

      throw new Error("Unexpected upstream request: " + url);
    }));

    const response = await createApp(base).request("/api/v1/tv/44776");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.title).toBe("Lanterns");
    expect(body.data.overview).toBe("TMDB canonical synopsis.");
    expect(body.data.ids.tmdb).toBe(95350);
    expect(body.data.trailer.embedUrl).toBe("https://www.youtube.com/embed/LANTRAILER");
    expect(body.data.trailer.type).toBe("Trailer");
    expect(body.data.trailer.official).toBe(true);
  });
});
