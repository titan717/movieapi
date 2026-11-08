import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { parseCalendarIds } from "../src/panda/service.js";

const base: Config = {
  apiKeys: new Set(), authRequired: false, rateLimit: 1000, rateWindowMs: 60_000,
  tvmaze: { baseUrl: "https://api.tvmaze.com", userAgent: "t", timeoutMs: 1000 },
  tmdb: { accessToken: "tok", baseUrl: "https://api.themoviedb.org/3", timeoutMs: 1000 },
  vidy: { baseUrl: "https://vidy.st", moviePath: "/movie/{tmdbId}", tvPath: "/tv/{tmdbId}/{season}/{episode}" },
  corsOrigin: "*", port: 3000
};
afterEach(() => vi.unstubAllGlobals());
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe("release calendar", () => {
  it("parses and validates ids", () => {
    expect(parseCalendarIds("tv:1396,movie:550,tv:1396")).toEqual([{ type: "tv", id: 1396 }, { type: "movie", id: 550 }]);
    expect(parseCalendarIds("tv:0")).toBeNull();
    expect(parseCalendarIds("person:1")).toBeNull();
    expect(parseCalendarIds("")).toBeNull();
    expect(parseCalendarIds(Array.from({ length: 41 }, (_, i) => `tv:${i + 1}`).join(","))).toBeNull();
  });

  it("returns recent and upcoming episodes for shows and the release date for movies", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/tv/90001/season/2")) return json({ episodes: [
        { season_number: 2, episode_number: 1, name: "Old", air_date: day(-60), still_path: "/a.jpg" },
        { season_number: 2, episode_number: 2, name: "Last week", air_date: day(-7), still_path: "/b.jpg", runtime: 50 },
        { season_number: 2, episode_number: 3, name: "Next week", air_date: day(7), still_path: null },
        { season_number: 2, episode_number: 4, name: "TBA", air_date: null }
      ] });
      if (url.includes("/tv/90001?")) return json({ id: 90001, name: "Show", poster_path: "/p.jpg", backdrop_path: "/b.jpg", first_air_date: "2024-01-01", status: "Returning Series",
        last_episode_to_air: { season_number: 2, episode_number: 2, name: "Last week", air_date: day(-7) }, next_episode_to_air: { season_number: 2, episode_number: 3, name: "Next week", air_date: day(7) } });
      if (url.includes("/movie/90002?")) return json({ id: 90002, title: "Film", poster_path: "/p.jpg", backdrop_path: "/b.jpg", release_date: day(20), status: "Post Production" });
      return new Response("{}", { status: 404 });
    }));
    const res = await createApp(base).request("/api/v1/panda/calendar?ids=tv:90001,movie:90002");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const [show, film] = body.data.entries;
    expect(show.item.id).toBe("tv:90001");
    expect(show.episodes.map((e: any) => e.episode)).toEqual([2, 3]);
    expect(show.episodes[0]).toMatchObject({ name: "Last week", still: "https://image.tmdb.org/t/p/w300/b.jpg", runtime: 50 });
    expect(show.nextEpisode).toMatchObject({ season: 2, episode: 3 });
    expect(film.item.releaseDate).toBe(day(20));
    expect(film.episodes).toEqual([]);
    expect(res.headers.get("cache-control")).toContain("max-age=1800");
  });

  it("rejects malformed ids and skips titles that fail", async () => {
    expect((await createApp(base).request("/api/v1/panda/calendar?ids=nope")).status).toBe(400);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    const res = await createApp(base).request("/api/v1/panda/calendar?ids=tv:90009");
    expect(((await res.json()) as any).data.entries).toEqual([]);
  });
});
