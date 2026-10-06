import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";

const base: Config = {
  apiKeys: new Set(["test-key"]),
  authRequired: false,
  rateLimit: 100,
  rateWindowMs: 60_000,
  tvmaze: {
    baseUrl: "https://api.tvmaze.com",
    userAgent: "MovieApi-test",
    timeoutMs: 1_000
  },
  tmdb: {
    accessToken: "tmdb-test-token",
    baseUrl: "https://api.themoviedb.org/3",
    timeoutMs: 1_000
  },
  vidy: { baseUrl: "https://vidy.st", moviePath: "/movie/{tmdbId}", tvPath: "/tv/{tmdbId}/{season}/{episode}" },
  corsOrigin: "*",
  port: 3000
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const show = {
  id: 1,
  name: "Test Show",
  type: "Scripted",
  language: "English",
  genres: ["Drama"],
  status: "Running",
  runtime: 45,
  averageRuntime: 45,
  premiered: "2020-01-01",
  ended: null,
  officialSite: null,
  schedule: { time: "20:00", days: ["Monday"], timezone: "America/New_York" },
  rating: { average: 8.2 },
  weight: 90,
  network: null,
  webChannel: null,
  dvdCountry: null,
  externals: { tvrage: null, thetvdb: 123, imdb: "tt1234567" },
  image: { medium: "https://example.com/medium.jpg", original: "https://example.com/original.jpg" },
  summary: "<p>A test show.</p>",
  updated: 1
};

describe("MovieApi Phase 5", () => {
  it("applies production-safe response headers", async () => {
    const response = await createApp(base).request("/api/v1/health");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });

  it("returns health with provider configuration state", async () => {
    const response = await createApp(base).request("/api/v1/health");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("healthy");
    expect(body.data.providers.tmdb.configured).toBe(true);
    expect(body.data.providers.tmdb.circuit.state).toBe("closed");
    expect(body.data.providers.tvmaze.provider).toBe("tvmaze");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("returns current version", async () => {
    const response = await createApp(base).request("/api/v1/version");
    const body = await response.json();
    expect(body.data.version).toBe("0.9.0");
    expect(body.data.phase).toBe(9);
  });

  it("serves docs and OpenAPI", async () => {
    const app = createApp(base);
    expect((await app.request("/docs")).status).toBe(200);
    const openapi = await app.request("/openapi.yaml");
    const spec = await openapi.text();
    expect(openapi.status).toBe(200);
    expect(spec).toContain("openapi: 3.1.0");
    expect(spec).toContain("/tmdb/movie/{id}");
  });

  it("returns standardized 404", async () => {
    const response = await createApp(base).request("/api/v1/missing");
    const body = await response.json();
    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.requestId).toBeTruthy();
  });

  it("enforces API keys when enabled", async () => {
    const app = createApp({ ...base, authRequired: true });
    expect((await app.request("/api/v1/health")).status).toBe(401);
    expect((await app.request("/api/v1/health", {
      headers: { "x-api-key": "test-key" }
    })).status).toBe(200);
  });

  it("rate limits requests", async () => {
    const app = createApp({ ...base, rateLimit: 1 });
    expect((await app.request("/api/v1/health")).status).toBe(200);
    expect((await app.request("/api/v1/health")).status).toBe(429);
  });

  it("normalizes a TVmaze show without exposing cast or crew", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(show), {
      status: 200,
      headers: { "content-type": "application/json" }
    })));

    const response = await createApp({ ...base, tmdb: { ...base.tmdb, accessToken: undefined } }).request("/api/v1/tv/1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.id).toBe("kinoma_tvmaze_1");
    expect(body.data.title).toBe("Test Show");
    expect(body.data.overview).toBe("A test show.");
    expect(body.data.ids.imdb).toBe("tt1234567");
    expect(body.data).not.toHaveProperty("cast");
    expect(body.data).not.toHaveProperty("crew");
  });

  it("maps TVmaze not found to a public media error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));

    const response = await createApp({ ...base, tmdb: { ...base.tmdb, accessToken: undefined } }).request("/api/v1/tv/999999");
    const body = await response.json();
    expect(response.status).toBe(404);
    expect(body.error.code).toBe("MEDIA_NOT_FOUND");
  });

  it("searches and paginates TVmaze results", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      { score: 1, show },
      { score: 0.9, show: { ...show, id: 2, name: "Second Show" } }
    ]), {
      status: 200,
      headers: { "content-type": "application/json" }
    })));

    const response = await createApp({ ...base, tmdb: { ...base.tmdb, accessToken: undefined } }).request("/api/v1/search?q=test&limit=1");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.results).toHaveLength(1);
    expect(body.data.pagination.total).toBe(2);
    expect(body.data.pagination.hasNext).toBe(true);
  });

  it("normalizes the show embedded in the TVmaze airing response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      {
        id: 10,
        name: "Episode One",
        season: 1,
        number: 1,
        image: null,
        summary: "<p>Episode summary.</p>",
        _embedded: { show }
      }
    ]), {
      status: 200,
      headers: { "content-type": "application/json" }
    })));

    const response = await createApp({ ...base, tmdb: { ...base.tmdb, accessToken: undefined } }).request("/api/v1/airing/today");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.episodes[0].show.id).toBe("kinoma_tvmaze_1");
  });

  it("maps malformed TVmaze JSON to a provider response error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{not-json", { status: 200 })));

    const response = await createApp({ ...base, tmdb: { ...base.tmdb, accessToken: undefined } }).request("/api/v1/tv/1");
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.error.code).toBe("PROVIDER_INVALID_RESPONSE");
  });

  it("caches repeated TVmaze detail requests", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return new Response(JSON.stringify(show), { status: 200, headers: { "content-type": "application/json" } });
    }));
    const app = createApp({ ...base, tmdb: { ...base.tmdb, accessToken: undefined } });
    expect((await app.request("/api/v1/tv/1")).status).toBe(200);
    expect((await app.request("/api/v1/tv/1")).status).toBe(200);
    expect(calls).toBe(1);
  });

  it("serves a normalized TMDB movie", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      id: 11,
      title: "Test Movie",
      original_title: "Test Movie",
      overview: "Movie overview",
      release_date: "2026-01-01",
      poster_path: "/poster.jpg",
      backdrop_path: "/backdrop.jpg",
      vote_average: 8.1,
      genres: [{ id: 18, name: "Drama" }],
      runtime: 120,
      status: "Released",
      original_language: "en"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })));

    const response = await createApp(base).request("/api/v1/tmdb/movie/11");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.type).toBe("movie");
    expect(body.data.ids.tmdb).toBe(11);
    expect(body.data.poster).toContain("image.tmdb.org/t/p/original/poster.jpg");
  });

  it("uses TMDB for missing TVmaze fields without replacing valid TVmaze fields", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      call += 1;
      const url = String(input);

      if (url.includes("api.tvmaze.com")) {
        return new Response(JSON.stringify({
          ...show,
          summary: null,
          image: { medium: null, original: null }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }

      if (url.includes("/videos")) {
        return new Response(JSON.stringify({ id: 999, results: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }

      if (url.includes("/find/tt1234567")) {
        return new Response(JSON.stringify({
          tv_results: [{ id: 999, name: "Test Show", first_air_date: "2020-01-01" }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }

      return new Response(JSON.stringify({
        id: 999,
        name: "Test Show",
        overview: "TMDB fallback overview",
        first_air_date: "2020-01-01",
        poster_path: "/fallback.jpg",
        backdrop_path: "/fallback-backdrop.jpg",
        vote_average: 9.1,
        genres: [{ id: 18, name: "Drama" }],
        episode_run_time: [50],
        status: "Returning Series",
        original_language: "en"
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const response = await createApp(base).request("/api/v1/tv/1");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.overview).toBe("TMDB fallback overview");
    expect(body.data.poster).toContain("fallback.jpg");
    expect(body.data.rating).toBe(8.2);
    expect(body.data.ids.tmdb).toBe(999);
    expect(call).toBe(5);
  });

  it("attaches a TMDB ID to a complete TVmaze show so trailer lookup can use TMDB", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      call += 1;
      const url = String(input);

      if (url.includes("api.tvmaze.com")) {
        return new Response(JSON.stringify(show), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.includes("/videos")) {
        return new Response(JSON.stringify({ id: 999, results: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }

      if (url.includes("/find/tt1234567")) {
        return new Response(JSON.stringify({
          tv_results: [{ id: 999, name: "Test Show", first_air_date: "2020-01-01" }]
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      return new Response(JSON.stringify({
        id: 999,
        name: "Test Show",
        overview: "TMDB overview",
        first_air_date: "2020-01-01",
        poster_path: "/poster.jpg",
        backdrop_path: "/backdrop.jpg",
        vote_average: 9.1,
        genres: [{ id: 18, name: "Drama" }],
        episode_run_time: [50],
        status: "Returning Series",
        original_language: "en"
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }));

    const response = await createApp(base).request("/api/v1/tv/1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.ids.tmdb).toBe(999);
    expect(body.data.overview).toBe("TMDB overview");
    expect(call).toBe(5);
  });

  it("keeps movie and TV search results as distinct media identities", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/search/tv")) {
        return new Response(JSON.stringify({
          page: 1,
          results: [{
            id: 95350,
            name: "The Last of Us",
            original_name: "The Last of Us",
            overview: "TV overview",
            first_air_date: "2023-01-15",
            poster_path: "/tv.jpg",
            backdrop_path: "/tv-backdrop.jpg"
          }],
          total_pages: 1,
          total_results: 1
        }), { status: 200, headers: { "content-type": "application/json" } });
      }

      if (url.includes("/search/movie")) {
        return new Response(JSON.stringify({
          page: 1,
          results: [{
            id: 95350,
            title: "The Last of Us",
            original_title: "The Last of Us",
            overview: "Movie overview",
            release_date: "2024-01-01",
            poster_path: "/movie.jpg",
            backdrop_path: "/movie-backdrop.jpg"
          }],
          total_pages: 1,
          total_results: 1
        }), { status: 200, headers: { "content-type": "application/json" } });
      }

      throw new Error("Unexpected upstream request: " + url);
    }));

    const app = createApp(base);
    const tvResponse = await app.request("/api/v1/tmdb/search/tv?q=the%20last%20of%20us&page=1");
    const movieResponse = await app.request("/api/v1/tmdb/search/movie?q=the%20last%20of%20us&page=1");
    const tv = await tvResponse.json();
    const movie = await movieResponse.json();

    expect(tvResponse.status).toBe(200);
    expect(movieResponse.status).toBe(200);
    expect(tv.data.results[0].type).toBe("tv");
    expect(tv.data.results[0].tmdbId).toBe(95350);
    expect(tv.data.results[0].canonicalId).toBe("tmdb:tv:95350");
    expect(movie.data.results[0].type).toBe("movie");
    expect(movie.data.results[0].tmdbId).toBe(95350);
    expect(movie.data.results[0].canonicalId).toBe("tmdb:movie:95350");
    expect(tv.data.results[0].canonicalId).not.toBe(movie.data.results[0].canonicalId);
  });

  it("fetches movie and TV details through an explicit media type", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/movie/27205/videos")) {
        return new Response(JSON.stringify({ id: 27205, results: [] }), { status: 200 });
      }
      if (url.includes("/movie/27205")) {
        return new Response(JSON.stringify({
          id: 27205,
          title: "Inception",
          original_title: "Inception",
          overview: "Movie details",
          release_date: "2010-07-16",
          poster_path: "/movie.jpg",
          backdrop_path: "/movie-backdrop.jpg",
          vote_average: 8.8,
          genres: [{ id: 878, name: "Science Fiction" }],
          runtime: 148,
          status: "Released",
          original_language: "en"
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
          overview: "TV details",
          first_air_date: "2026-08-16",
          poster_path: "/tv.jpg",
          backdrop_path: "/tv-backdrop.jpg",
          vote_average: 8.4,
          genres: [{ id: 18, name: "Drama" }],
          episode_run_time: [55],
          status: "Returning Series",
          original_language: "en"
        }), { status: 200 });
      }

      throw new Error("Unexpected upstream request: " + url);
    }));

    const app = createApp(base);
    const movieResponse = await app.request("/api/v1/details/movie/27205");
    const tvResponse = await app.request("/api/v1/details/tv/95350");
    const invalidResponse = await app.request("/api/v1/details/series/95350");

    const movie = await movieResponse.json();
    const tv = await tvResponse.json();
    const invalid = await invalidResponse.json();

    expect(movieResponse.status).toBe(200);
    expect(movie.data.mediaType).toBe("movie");
    expect(movie.data.tmdbId).toBe(27205);
    expect(movie.data.type).toBe("movie");
    expect(movie.data.title).toBe("Inception");

    expect(tvResponse.status).toBe(200);
    expect(tv.data.mediaType).toBe("tv");
    expect(tv.data.tmdbId).toBe(95350);
    expect(tv.data.type).toBe("tv");
    expect(tv.data.title).toBe("Lanterns");

    expect(invalidResponse.status).toBe(400);
    expect(invalid.error.code).toBe("INVALID_MEDIA_TYPE");
  });

  it("reports TMDB as unavailable when it is not configured", async () => {
    const response = await createApp({
      ...base,
      tmdb: { baseUrl: "https://api.themoviedb.org/3", timeoutMs: 1_000 }
    }).request("/api/v1/tmdb/movie/11");
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.error.code).toBe("PROVIDER_UNAVAILABLE");
  });
});
