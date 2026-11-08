import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { playbackSources, toItem } from "../src/panda/service.js";

const base: Config = {
  apiKeys: new Set(), authRequired: false, rateLimit: 1000, rateWindowMs: 60_000,
  tvmaze: { baseUrl: "https://api.tvmaze.com", userAgent: "t", timeoutMs: 1000 },
  tmdb: { accessToken: "tok", baseUrl: "https://api.themoviedb.org/3", timeoutMs: 1000 },
  vidy: { baseUrl: "https://vidy.st", moviePath: "/movie/{tmdbId}", tvPath: "/tv/{tmdbId}/{season}/{episode}" },
  corsOrigin: "*", port: 3000
};
afterEach(() => vi.unstubAllGlobals());
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });

describe("panda aggregation", () => {
  it("normalizes list items with sized artwork and genre names", () => {
    const item = toItem({ id: 5, title: "X", release_date: "2024-02-01", poster_path: "/p.jpg", backdrop_path: "/b.jpg", genre_ids: [28, 18], vote_average: 7.26, original_language: "ml" });
    expect(item).toMatchObject({ id: "movie:5", type: "movie", year: 2024, rating: 7.3, poster: "https://image.tmdb.org/t/p/w342/p.jpg", genres: ["Action", "Drama"], language: "ml" });
  });

  it("builds a full title payload with logo, certification and recommendations", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/movie/414906?")) return json({ id: 414906, title: "The Batman", release_date: "2022-03-01", runtime: 177, poster_path: "/p.jpg", backdrop_path: "/b.jpg", genres: [{ id: 80, name: "Crime" }], original_language: "en", spoken_languages: [{ english_name: "English" }, { english_name: "Hindi" }],
        images: { logos: [{ iso_639_1: "en", file_path: "/logo.png" }] }, release_dates: { results: [{ iso_3166_1: "US", release_dates: [{ certification: "PG-13" }] }] },
        credits: { cast: [{ id: 1, name: "Robert Pattinson", character: "Bruce", profile_path: "/r.jpg" }], crew: [{ job: "Director", name: "Matt Reeves" }] },
        videos: { results: [{ site: "YouTube", key: "abc", name: "Trailer", type: "Trailer", official: true }] },
        recommendations: { results: [{ id: 155, title: "The Dark Knight", poster_path: "/dk.jpg" }] }, similar: { results: [{ id: 155, title: "The Dark Knight", poster_path: "/dk.jpg" }] } });
      return json({});
    }));
    const res = await createApp(base).request("/api/v1/panda/title/movie/414906");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.logo).toBe("https://image.tmdb.org/t/p/w500/logo.png");
    expect(body.data.certification).toBe("PG-13");
    expect(body.data.languages).toEqual(["English", "Hindi"]);
    expect(body.data.videos[0].key).toBe("abc");
    expect(body.data.moreLikeThis).toHaveLength(1);
    expect(body.data.directors).toEqual(["Matt Reeves"]);
  });

  it("returns both providers for TV playback using TMDB ids directly", async () => {
    const res = await createApp(base).request("/api/v1/panda/play/tv/1399?s=2&e=3&t=120");
    const body = await res.json();
    expect(body.data.sources.map((s: any) => s.id)).toEqual(["cinesrc", "vidy"]);
    expect(body.data.sources[0].url).toContain("cinesrc.st/embed/tv/1399?s=2&e=3");
    expect(body.data.sources[0].url).toContain("t=120");
    expect(body.data.sources[0].url).toContain("autonext=false");
    expect(body.data.sources[1].url).toContain("www.vidy.st/tv/1399/2/3");
    expect(body.data.sources[1].url).toContain("progress=120");
    expect(JSON.stringify(body)).not.toMatch(/vidsrc/);
  });

  it("passes a validated preferred quality to sources that support it", async () => {
    const res = await createApp(base).request("/api/v1/panda/play/movie/550?quality=720&color=ff0000");
    const body = await res.json();
    expect(body.data.sources[0].url).toContain("quality=720");
    expect(body.data.sources[0].url).toContain("color=%23ff0000");
    expect(body.data.sources[1].url).not.toContain("quality");
    const bad = await (await createApp(base).request("/api/v1/panda/play/movie/550?quality=9999")).json();
    expect(bad.data.sources[0].url).not.toContain("quality");
  });

  it("reports source health for every registered adapter", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => new Response("<html></html>", { status: String(u).includes("vidy") ? 503 : 200 })));
    const res = await createApp(base).request("/api/v1/panda/sources/health");
    const body = await res.json();
    expect(body.data.sources.map((s: any) => [s.id, s.state])).toEqual([["cinesrc", "healthy"], ["vidy", "down"]]);
  });

  it("rejects TV playback without season/episode", async () => {
    const res = await createApp(base).request("/api/v1/panda/play/tv/1399");
    expect(res.status).toBe(400);
  });

  it("multi search filters out people and artless results", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ page: 1, total_pages: 1, results: [
      { id: 1, media_type: "person", name: "Someone" },
      { id: 2, media_type: "tv", name: "Show", poster_path: "/s.jpg", first_air_date: "2020-01-01" },
      { id: 3, media_type: "movie", title: "No Art" }
    ] })));
    const res = await createApp(base).request("/api/v1/panda/search?q=show");
    const body = await res.json();
    expect(body.data.results.map((r: any) => r.id)).toEqual(["tv:2"]);
  });

  it("playbackSources omits start offsets under 5 seconds", () => {
    expect(playbackSources("movie", 1, { start: 2 })[0].url).not.toContain("&t=");
  });
  it("serves kids and new page kinds and rejects unknown kinds", async () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const past = "2001-01-01";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/movie/upcoming")) return json({ results: [
        { id: 1, title: "Soon", release_date: future, poster_path: "/a.jpg", backdrop_path: "/b.jpg" },
        { id: 2, title: "Old", release_date: past, poster_path: "/a.jpg", backdrop_path: "/b.jpg" }] });
      if (url.includes("/images")) return json({ logos: [] });
      return json({ results: [{ id: 9, title: "Toon", release_date: "2020-01-01", poster_path: "/p.jpg", backdrop_path: "/b.jpg", genre_ids: [16] }] });
    }));
    const app = createApp(base);
    const kids = await (await app.request("/api/v1/panda/page/kids")).json();
    expect(kids.data.kind).toBe("kids");
    expect(kids.data.rails.length).toBeGreaterThan(0);
    const fresh = await (await app.request("/api/v1/panda/page/new")).json();
    const soon = fresh.data.rails.find((r: { id: string }) => r.id === "coming-soon");
    expect(soon.items.map((i: { title: string }) => i.title)).toEqual(["Soon"]);
    expect((await app.request("/api/v1/panda/page/bogus")).status).toBe(400);
  });

  it("discover sort=airing adds an air-date window for tv", async () => {
    const fetchMock = vi.fn(async () => json({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await createApp(base).request("/api/v1/panda/discover/tv?sort=airing");
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("air_date.gte=");
  });

  it("builds a unique, small-poster wall from trending pages", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const page = Number(new URL(url).searchParams.get("page") ?? 1);
      const tv = url.includes("/trending/tv/");
      const results = Array.from({ length: 20 }, (_, k) => ({ id: page * 100 + k, [tv ? "name" : "title"]: `T${k}`, poster_path: `/p${page}${k}.jpg`, backdrop_path: "/b.jpg", media_type: tv ? "tv" : "movie" }));
      // repeat one id across pages: it must appear only once
      results[0]!.id = 7;
      return json({ page, results });
    }));
    const res = await createApp(base).request("/api/v1/panda/wall");
    const body = await res.json();
    expect(res.status).toBe(200);
    const ids = body.data.posters.map((p: any) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(100);
    expect(body.data.posters[0].poster).toContain("/w185/");
  });
});
