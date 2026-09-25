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
    expect(body.data.version).toBe("0.4.0");
    expect(body.data.phase).toBe(5);
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
    expect(call).toBe(3);
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
