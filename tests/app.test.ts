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

describe("MovieApi Phase 2", () => {
  it("returns health with request id", async () => {
    const response = await createApp(base).request("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("healthy");
    expect(body.data.providers.tvmaze).toBe("configured");
  });

  it("returns version", async () => {
    const response = await createApp(base).request("/api/v1/version");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.apiVersion).toBe("v1");
    expect(body.data.phase).toBe(2);
  });

  it("serves docs and OpenAPI", async () => {
    const app = createApp(base);
    expect((await app.request("/docs")).status).toBe(200);
    const openapi = await app.request("/openapi.yaml");
    expect(openapi.status).toBe(200);
    expect(await openapi.text()).toContain("openapi: 3.1.0");
    expect(await openapi.text()).toContain("/tv/{id}");
  });

  it("returns standardized 404", async () => {
    const response = await createApp(base).request("/api/v1/missing");
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.requestId).toBeTruthy();
  });

  it("enforces API keys when enabled", async () => {
    const app = createApp({ ...base, authRequired: true });
    expect((await app.request("/api/v1/health")).status).toBe(401);
    expect((await app.request("/api/v1/health", { headers: { "x-api-key": "test-key" } })).status).toBe(200);
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

    const response = await createApp(base).request("/api/v1/tv/1");
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.id).toBe("kinoma_tvmaze_1");
    expect(body.data.title).toBe("Test Show");
    expect(body.data.overview).toBe("A test show.");
    expect(body.data.ids.imdb).toBe("tt1234567");
    expect(body.data).not.toHaveProperty("cast");
    expect(body.data).not.toHaveProperty("crew");
  });

  it("maps TVmaze not found to a public media error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));

    const response = await createApp(base).request("/api/v1/tv/999999");
    expect(response.status).toBe(404);
    const body = await response.json();
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

    const response = await createApp(base).request("/api/v1/search?q=test&limit=1");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.results).toHaveLength(1);
    expect(body.data.pagination.total).toBe(2);
    expect(body.data.pagination.hasNext).toBe(true);
  });
});
