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
  port: 3000
};

afterEach(() => vi.unstubAllGlobals());

function tmdbList(type: "movie" | "tv") {
  return {
    page: 1,
    total_pages: 1,
    total_results: 1,
    results: [type === "movie"
      ? { id: 11, title: "Test Movie", original_title: "Test Movie", overview: "Movie", release_date: "2026-01-01", poster_path: "/movie.jpg", backdrop_path: "/backdrop.jpg", vote_average: 8.1, popularity: 20, genre_ids: [18], original_language: "en" }
      : { id: 22, name: "Test Show", original_name: "Test Show", overview: "Show", first_air_date: "2026-01-02", poster_path: "/tv.jpg", backdrop_path: "/backdrop.jpg", vote_average: 8.2, popularity: 21, genre_ids: [18], original_language: "en", origin_country: ["US"] }]
  };
}

describe("MovieApi Phase 5 discovery", () => {
  it("serves popular movies through the discovery layer", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/movie/popular")) return new Response(JSON.stringify(tmdbList("movie")), { status: 200 });
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }));
    const response = await createApp(base).request("/api/v1/popular/movies");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.results[0].id).toBe("kinoma_tmdb_movie_11");
  });

  it("serves trending with normalized movie and TV identity", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/trending/all/day")) return new Response(JSON.stringify({
        page: 1, total_pages: 1, total_results: 2,
        results: [
          { media_type: "movie", id: 11, title: "Movie", original_title: "Movie", release_date: "2026-01-01", poster_path: null, backdrop_path: null, vote_average: 8 },
          { media_type: "tv", id: 22, name: "Show", original_name: "Show", first_air_date: "2026-01-02", poster_path: null, backdrop_path: null, vote_average: 8 }
        ]
      }), { status: 200 });
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }));
    const response = await createApp(base).request("/api/v1/trending");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.results).toHaveLength(2);
    expect(body.data.results[0].type).toBe("movie");
    expect(body.data.results[1].type).toBe("tv");
  });

  it("resolves a named genre before discovery", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/genre/movie/list")) return new Response(JSON.stringify({ genres: [{ id: 18, name: "Drama" }] }), { status: 200 });
      if (url.includes("/discover/movie")) return new Response(JSON.stringify(tmdbList("movie")), { status: 200 });
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }));
    const response = await createApp(base).request("/api/v1/genres/drama?type=movie");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.genreId).toBe(18);
    expect(body.data.results[0].ids.tmdb).toBe(11);
  });

  it("returns provider-unavailable when discovery needs an unconfigured TMDB", async () => {
    const response = await createApp({ ...base, tmdb: { baseUrl: "https://api.themoviedb.org/3", timeoutMs: 1_000 } }).request("/api/v1/popular/movies");
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.error.code).toBe("PROVIDER_UNAVAILABLE");
  });
});
