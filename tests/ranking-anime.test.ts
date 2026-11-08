import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { decay, rank, recordOutcome, resetRanking, wilson } from "../src/panda/ranking.js";
import { baseTitle, currentSeason, isAnime, pickCandidate } from "../src/panda/anilist.js";
import { playbackSources } from "../src/panda/service.js";

const base: Config = {
  apiKeys: new Set(), authRequired: false, rateLimit: 1000, rateWindowMs: 60_000,
  tvmaze: { baseUrl: "https://api.tvmaze.com", userAgent: "t", timeoutMs: 1000 },
  tmdb: { accessToken: "tok", baseUrl: "https://api.themoviedb.org/3", timeoutMs: 1000 },
  vidy: { baseUrl: "https://vidy.st", moviePath: "/movie/{tmdbId}", tvPath: "/tv/{tmdbId}/{season}/{episode}" },
  corsOrigin: "*", port: 3000
};
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
beforeEach(() => resetRanking());
afterEach(() => vi.unstubAllGlobals());

describe("Wilson ranking", () => {
  it("computes the Wilson lower bound", () => {
    expect(wilson(0, 0)).toBe(0);
    expect(wilson(10, 10)).toBeCloseTo(0.722, 3);
    expect(wilson(90, 100)).toBeCloseTo(0.826, 3);
    // more evidence at the same rate ranks higher
    expect(wilson(100, 100)).toBeGreaterThan(wilson(5, 5));
  });

  it("decays with a 72 h half-life", () => {
    expect(decay(0)).toBe(1);
    expect(decay(72)).toBeCloseTo(0.5, 6);
    expect(decay(144)).toBeCloseTo(0.25, 6);
  });

  it("ranks a reported source below a healthy one and lets old reports fade", () => {
    const store = new Map();
    const now = Date.UTC(2026, 10, 9, 12);
    for (let i = 0; i < 20; i++) recordOutcome("cinesrc", "noplay", now, store);
    for (let i = 0; i < 20; i++) recordOutcome("vidy", "ok", now, store);
    const r = rank(store, [{ id: "cinesrc", state: "healthy" }, { id: "vidy", state: "healthy" }], now);
    expect(r[0]!.id).toBe("vidy");
    expect(r.find((x) => x.id === "cinesrc")!.reports24h).toBe(20);
    expect(r.find((x) => x.id === "vidy")!.reliability).toBe(1);
    // two weeks of fresh successes outweigh the old failures
    const later = now + 10 * 86_400_000;
    for (let i = 0; i < 20; i++) recordOutcome("cinesrc", "ok", later, store);
    const r2 = rank(store, [], later);
    expect(r2.find((x) => x.id === "cinesrc")!.score).toBeGreaterThan(0.5);
  });

  it("ignores unknown sources and neutral issues, keeps the registry order on ties", () => {
    const store = new Map();
    expect(recordOutcome("evil", "ok", Date.now(), store)).toBe(false);
    expect(recordOutcome("cinesrc", "other", Date.now(), store)).toBe(false);
    expect(rank(store, []).map((x) => x.id)).toEqual(["cinesrc", "vidy", "vidyanime"]);
  });

  it("a source that is down right now drops before anyone reports it", () => {
    const r = rank(new Map(), [{ id: "cinesrc", state: "down" }, { id: "vidy", state: "healthy" }, { id: "vidyanime", state: "healthy" }]);
    expect(r[r.length - 1]!.id).toBe("cinesrc");
  });

  it("serves /sources/ranking and counts reports", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html></html>", { status: 200 })));
    const app = createApp(base);
    for (let i = 0; i < 5; i++) {
      const r = await app.request("/api/v1/panda/report", { method: "POST", body: JSON.stringify({ type: "movie", tmdbId: 550, source: "cinesrc", issue: "noplay", position: 0 }), headers: { "content-type": "text/plain" } });
      expect((await r.json()).data.counted).toBe(true);
    }
    await app.request("/api/v1/panda/report", { method: "POST", body: JSON.stringify({ type: "movie", tmdbId: 550, source: "vidy", issue: "ok", position: 0 }) });
    const body = await (await app.request("/api/v1/panda/sources/ranking")).json();
    expect(body.data.halfLifeHours).toBe(72);
    expect(body.data.sources[0].id).toBe("vidy");
    expect(body.data.sources.find((s: any) => s.id === "cinesrc").reports).toBe(5);
  });
});

describe("AniList bridge", () => {
  it("detects anime and strips season suffixes", () => {
    expect(isAnime({ language: "ja", genres: ["Animation", "Action"] })).toBe(true);
    expect(isAnime({ language: "en", genres: ["Animation"] })).toBe(false);
    expect(baseTitle("Jujutsu Kaisen Season 2")).toBe("Jujutsu Kaisen");
    expect(baseTitle("Spy x Family Part 2")).toBe("Spy x Family");
    expect(baseTitle("Mushoku Tensei II")).toBe("Mushoku Tensei");
    expect(currentSeason(new Date(Date.UTC(2026, 10, 9)))).toEqual({ name: "FALL", year: 2026 });
  });

  it("picks the right format and year", () => {
    const list = [
      { id: 131573, format: "MOVIE", startDate: { year: 2021 }, title: { english: "JUJUTSU KAISEN 0" } },
      { id: 113415, format: "TV", startDate: { year: 2020 }, title: { english: "JUJUTSU KAISEN", native: "呪術廻戦" } }
    ];
    expect(pickCandidate(list, { type: "tv", year: 2020, titles: ["Jujutsu Kaisen"] })!.id).toBe(113415);
    expect(pickCandidate(list, { type: "movie", year: 2021, titles: ["Jujutsu Kaisen 0"] })!.id).toBe(131573);
    expect(pickCandidate(list, { type: "tv", year: 1999, titles: ["Something else"] })).toBeNull();
  });

  it("adds the Vidy Anime source with the AniList id", () => {
    const s = playbackSources("tv", 95479, { season: 2, episode: 3, anilistId: 145064, start: 90 });
    const a = s.find((x) => x.id === "vidyanime")!;
    expect(a.url).toBe("https://www.vidy.st/anime/145064/3?autoplay=true&color=1f80e0&progress=90");
    expect(playbackSources("tv", 1, { season: 1, episode: 1 }).some((x) => x.id === "vidyanime")).toBe(false);
  });

  it("resolves season 2 through the SEQUEL relation on /play?anime=1", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("graphql.anilist.co")) {
        const q = JSON.parse(String(init?.body));
        if (q.variables.q) return json({ data: { Page: { media: [{ id: 113415, format: "TV", startDate: { year: 2020 }, title: { english: "JUJUTSU KAISEN" }, relations: { edges: [{ relationType: "SEQUEL", node: { id: 145064, format: "TV", type: "ANIME" } }] } }] } } });
      }
      if (url.includes("/tv/95479")) return json({ id: 95479, name: "JUJUTSU KAISEN", original_name: "呪術廻戦", first_air_date: "2020-10-03", original_language: "ja", genres: [{ id: 16, name: "Animation" }], poster_path: "/p.jpg" });
      return json({});
    }));
    const body = await (await createApp(base).request("/api/v1/panda/play/tv/95479?s=2&e=1&anime=1")).json();
    expect(body.data.anilistId).toBe(145064);
    expect(body.data.sources.map((s: any) => s.id)).toEqual(["cinesrc", "vidy", "vidyanime"]);
  });

  it("builds the Anime page from AniList rows resolved to TMDB", async () => {
    const media = (id: number, t: string) => ({ id, format: "TV", episodes: 12, averageScore: 85, seasonYear: 2026, startDate: { year: 2026 }, title: { english: t, romaji: t }, coverImage: { color: "#e4a15d" }, bannerImage: null, nextAiringEpisode: { episode: 6, airingAt: 1_800_000_000 }, studios: { nodes: [{ name: "MAPPA" }] } });
    const page = { media: [1, 2, 3, 4, 5].map((i) => media(i, `Show ${i}`)) };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("graphql.anilist.co")) return json({ data: { trending: page, season: page, popular: page, movies: { media: [] }, upcoming: page } });
      if (url.includes("/search/tv")) {
        const q = new URL(url).searchParams.get("query")!;
        const n = Number(q.split(" ")[1]);
        return json({ results: [{ id: 100 + n, name: q, original_language: "ja", genre_ids: [16], poster_path: "/p.jpg", backdrop_path: "/b.jpg" }] });
      }
      return json({});
    }));
    const body = await (await createApp(base).request("/api/v1/panda/anime")).json();
    expect(body.data.rows.map((r: any) => r.id)).toEqual(["trending", "season", "popular", "upcoming"]);
    expect(body.data.rows[0].items[0]).toMatchObject({ id: "tv:101", anilistId: 1, score: 8.5, studio: "MAPPA", airing: { episode: 6 } });
    expect(body.data.hero.id).toBe("tv:101");
  });
});
