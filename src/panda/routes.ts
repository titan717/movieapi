import { Hono } from "hono";
import type { Context } from "hono";
import { errorResponse } from "../errors.js";
import { log } from "../logger.js";
import { TmdbProviderError } from "../providers/tmdb/client.js";
import { mirrorRelease, isReleaseTag } from "./releases.js";
import { searchSubtitles, subtitleFile, parseLangs } from "./subtitles.js";
import { buckets, rank, recordOutcome, kvConfigured } from "./ranking.js";
import { PandaService, playbackSources, sourceHealth, skipSegments, isImdbId, parseCalendarIds, CALENDAR_MAX, PANDA_PAGE_KINDS, type MediaType, type PandaPageKind } from "./service.js";

type AppEnv = { Variables: { requestId: string } };

const int = (v: string | undefined) => { if (v === undefined || v === "") return undefined; const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const isType = (v: string): v is MediaType => v === "movie" || v === "tv";

function fail(c: Context<AppEnv>, error: unknown) {
  if (error instanceof TmdbProviderError) {
    const status = error.kind === "NOT_FOUND" ? 404 : error.kind === "RATE_LIMIT" ? 429 : error.kind === "TIMEOUT" ? 504 : error.kind === "UNCONFIGURED" || error.kind === "CIRCUIT_OPEN" ? 503 : 502;
    return errorResponse(c, error.kind === "NOT_FOUND" ? "MEDIA_NOT_FOUND" : "PROVIDER_UNAVAILABLE", error.message, status, c.get("requestId"));
  }
  return errorResponse(c, "INTERNAL_ERROR", "Unexpected Panda aggregation error.", 500, c.get("requestId"));
}

/** Short CDN cache so the Vercel edge + browsers can serve stale-while-revalidate. */
function cache(c: Context<AppEnv>, seconds: number) { c.header("cache-control", `public, max-age=${seconds}, stale-while-revalidate=${seconds * 10}`); }

export function createPandaRoutes(service: PandaService) {
  const app = new Hono<AppEnv>();
  const guard = (c: Context<AppEnv>) => service.enabled ? null : errorResponse(c, "PROVIDER_UNAVAILABLE", "TMDB is not configured.", 503, c.get("requestId"));

  app.get("/page/:kind", async (c) => {
    const kind = c.req.param("kind");
    if (!PANDA_PAGE_KINDS.includes(kind as PandaPageKind)) return errorResponse(c, "INVALID_REQUEST", "kind must be home, movies, tv, kids or new.", 400, c.get("requestId"));
    const g = guard(c); if (g) return g;
    try { cache(c, 300); return c.json({ success: true, data: await service.page(kind as PandaPageKind) }); } catch (e) { return fail(c, e); }
  });

  app.get("/title/:type/:id", async (c) => {
    const type = c.req.param("type"); const id = int(c.req.param("id"));
    if (!isType(type) || !id) return errorResponse(c, "INVALID_MEDIA_ID", "type must be movie|tv and id a positive TMDB id.", 400, c.get("requestId"));
    const g = guard(c); if (g) return g;
    try { cache(c, 600); return c.json({ success: true, data: await service.title(type, id) }); } catch (e) { return fail(c, e); }
  });

  app.get("/person/:id", async (c) => {
    const id = int(c.req.param("id"));
    if (!id) return errorResponse(c, "INVALID_REQUEST", "id must be a positive TMDB person id.", 400, c.get("requestId"));
    const g = guard(c); if (g) return g;
    try { cache(c, 3600); return c.json({ success: true, data: await service.person(id) }); } catch (e) { return fail(c, e); }
  });

  app.get("/title/tv/:id/season/:season", async (c) => {
    const id = int(c.req.param("id")); const season = int(c.req.param("season"));
    if (!id || !season) return errorResponse(c, "INVALID_EPISODE_ID", "id and season must be positive integers.", 400, c.get("requestId"));
    const g = guard(c); if (g) return g;
    try { cache(c, 600); return c.json({ success: true, data: await service.season(id, season) }); } catch (e) { return fail(c, e); }
  });

  app.get("/search", async (c) => {
    const q = (c.req.query("q") ?? "").trim().slice(0, 100); const page = int(c.req.query("page")) ?? 1;
    if (!q) return errorResponse(c, "INVALID_REQUEST", "Query parameter q is required.", 400, c.get("requestId"));
    if (page === null) return errorResponse(c, "INVALID_REQUEST", "page must be a positive integer.", 400, c.get("requestId"));
    const g = guard(c); if (g) return g;
    try { cache(c, 120); return c.json({ success: true, data: await service.search(q, page) }); } catch (e) { return fail(c, e); }
  });

  app.get("/discover/:type", async (c) => {
    const type = c.req.param("type"); const page = int(c.req.query("page")) ?? 1;
    if (!isType(type) || page === null) return errorResponse(c, "INVALID_REQUEST", "type must be movie|tv and page positive.", 400, c.get("requestId"));
    const clean = (v: string | undefined, re: RegExp) => (v && re.test(v) ? v : undefined);
    const sortRaw = c.req.query("sort");
    const opts = {
      page: Math.min(page, 500),
      genre: clean(c.req.query("genre"), /^[0-9,|]{1,40}$/),
      lang: clean(c.req.query("lang"), /^[a-z]{2}$/),
      country: clean(c.req.query("country"), /^[A-Z]{2}$/),
      provider: clean(c.req.query("provider"), /^[0-9|]{1,20}$/),
      sort: sortRaw === "new" ? (type === "movie" ? "primary_release_date.desc" : "first_air_date.desc") : clean(sortRaw, /^(popularity|vote_average|primary_release_date|first_air_date|revenue)\.(asc|desc)$/),
      minVotes: sortRaw === "new" ? 20 : sortRaw === "airing" ? 10 : undefined,
      airing: type === "tv" && sortRaw === "airing"
    };
    const g = guard(c); if (g) return g;
    try { cache(c, 600); return c.json({ success: true, data: await service.discover(type, opts) }); } catch (e) { return fail(c, e); }
  });

  app.get("/trending", async (c) => {
    const t = c.req.query("type") ?? "all"; const page = int(c.req.query("page")) ?? 1;
    if ((t !== "all" && !isType(t)) || page === null) return errorResponse(c, "INVALID_REQUEST", "type must be all|movie|tv.", 400, c.get("requestId"));
    const g = guard(c); if (g) return g;
    try { cache(c, 600); return c.json({ success: true, data: await service.trending(t as "all" | MediaType, c.req.query("window") === "week" ? "week" : "day", Math.min(page, 50)) }); } catch (e) { return fail(c, e); }
  });

  /**
   * "Report an Issue" from the Panda player, automatic "popups" signals from the ad shield, and
   * `ok` when a source started playback. Validated, logged, and counted for /sources/ranking.
   */
  const ISSUES = new Set(["noplay", "wrong", "sync", "subs", "popups", "ok"]);
  app.post("/report", async (c) => {
    let body: Record<string, unknown>;
    try {
      const raw = await c.req.text();
      if (raw.length > 2000) throw new Error("too large");
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch { return errorResponse(c, "INVALID_REQUEST", "Body must be a small JSON object.", 400, c.get("requestId")); }
    const type = String(body.type ?? ""), tmdbId = Number(body.tmdbId), issue = String(body.issue ?? "");
    if (!isType(type) || !Number.isInteger(tmdbId) || tmdbId <= 0 || !ISSUES.has(issue)) {
      return errorResponse(c, "INVALID_REQUEST", "type, tmdbId and a known issue are required.", 400, c.get("requestId"));
    }
    const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : null);
    const source = typeof body.source === "string" && /^[a-z]{2,20}$/.test(body.source) ? body.source : null;
    const counted = source ? recordOutcome(source, issue) : false;
    if (issue !== "ok") log("warn", "panda.playback_report", { requestId: c.get("requestId"), type, tmdbId, season: num(body.season), episode: num(body.episode), source, issue, position: num(body.position), counted });
    return c.json({ success: true, data: { received: true, counted } }, 202);
  });

  app.get("/wall", async (c) => {
    const g = guard(c); if (g) return g;
    try { cache(c, 3600); return c.json({ success: true, data: await service.wall() }); } catch (e) { return fail(c, e); }
  });

  app.get("/top10/:lang", async (c) => {
    const lang = c.req.param("lang");
    if (!/^[a-z]{2}$/.test(lang)) return errorResponse(c, "INVALID_REQUEST", "lang must be an ISO 639-1 code.", 400, c.get("requestId"));
    const g = guard(c); if (g) return g;
    try { cache(c, 900); return c.json({ success: true, data: await service.top10(lang) }); } catch (e) { return fail(c, e); }
  });

  app.get("/genres", async (c) => {
    const g = guard(c); if (g) return g;
    try { cache(c, 86400); return c.json({ success: true, data: await service.genres() }); } catch (e) { return fail(c, e); }
  });

  app.get("/categories", async (c) => {
    const g = guard(c); if (g) return g;
    try { cache(c, 86400); return c.json({ success: true, data: await service.categoryArt() }); } catch (e) { return fail(c, e); }
  });

  app.get("/play/:type/:id", async (c) => {
    const type = c.req.param("type"); const id = int(c.req.param("id"));
    const season = int(c.req.query("s")); const episode = int(c.req.query("e")); const start = Number(c.req.query("t") ?? 0);
    if (!isType(type) || !id || season === null || episode === null) return errorResponse(c, "INVALID_MEDIA_ID", "Invalid playback identifiers.", 400, c.get("requestId"));
    if (type === "tv" && (!season || !episode)) return errorResponse(c, "INVALID_EPISODE_ID", "TV playback requires s and e.", 400, c.get("requestId"));
    const color = c.req.query("color")?.replace(/^#/, "");
    const quality = c.req.query("quality");
    // anime=1: the client saw Japanese animation; resolve the AniList id for Vidy's anime player (≤ 4 s)
    let anilistId: number | null = null;
    if (c.req.query("anime") === "1" && service.enabled) {
      anilistId = await Promise.race([
        service.anilistFor(type, id, season ?? 1).catch((e) => { log("warn", "panda.anilist_failed", { type, id, error: String(e) }); return null; }),
        new Promise<null>((r) => setTimeout(() => r(null), 4000))
      ]);
    }
    cache(c, 3600);
    return c.json({ success: true, data: { type, tmdbId: id, season: season ?? null, episode: episode ?? null, anilistId, sources: playbackSources(type, id, { season, episode, start: Number.isFinite(start) ? start : 0, quality, anilistId, color: color && /^[0-9a-fA-F]{6}$/.test(color) ? color : undefined }) } });
  });

  app.get("/segments/:imdb", async (c) => {
    const imdb = c.req.param("imdb"); const season = int(c.req.query("s")); const episode = int(c.req.query("e"));
    if (!isImdbId(imdb) || season === null || episode === null) return errorResponse(c, "INVALID_MEDIA_ID", "segments needs an IMDb id (tt…) and optional s/e.", 400, c.get("requestId"));
    const data = await skipSegments(imdb, season ?? null, episode ?? null);
    cache(c, data.intro || data.recap || data.credits ? 86400 : 3600);
    return c.json({ success: true, data });
  });

  /** One subtitle as cleaned WebVTT (ads removed). */
  app.get("/subtitles/file", async (c) => {
    const f = c.req.query("f") ?? ""; const enc = (c.req.query("enc") ?? "utf-8").toLowerCase();
    try {
      const vtt = await subtitleFile(f, enc);
      if (vtt === null) return errorResponse(c, "INVALID_REQUEST", "Unknown subtitle file.", 400, c.get("requestId"));
      c.header("cache-control", "public, max-age=604800, immutable");
      c.header("content-type", "text/vtt; charset=utf-8");
      return c.body(vtt);
    } catch (e) { log("warn", "panda.subtitle_file_failed", { error: String(e) }); return errorResponse(c, "PROVIDER_UNAVAILABLE", "This subtitle could not be downloaded.", 502, c.get("requestId")); }
  });

  /** External subtitles by IMDb id (+ s/e for episodes) in up to 3 languages (langs=en,es). */
  app.get("/subtitles/:imdb", async (c) => {
    const imdb = c.req.param("imdb"); const season = int(c.req.query("s")); const episode = int(c.req.query("e"));
    const langs = parseLangs(c.req.query("langs"));
    if (!isImdbId(imdb) || season === null || episode === null || !langs) return errorResponse(c, "INVALID_MEDIA_ID", "subtitles needs an IMDb id (tt…), optional s/e and langs=en,es (max 3).", 400, c.get("requestId"));
    try {
      const tracks = await searchSubtitles(imdb, season ?? null, episode ?? null, langs);
      cache(c, tracks.length ? 21600 : 1800);
      return c.json({ success: true, data: { imdbId: imdb, season: season ?? null, episode: episode ?? null, tracks } });
    } catch (e) { log("warn", "panda.subtitles_failed", { imdb, error: String(e) }); return errorResponse(c, "PROVIDER_UNAVAILABLE", `Subtitles are unavailable right now (${String((e as Error)?.message ?? e).slice(0, 80)}).`, 503, c.get("requestId")); }
  });

  app.get("/calendar", async (c) => {
    const refs = parseCalendarIds(c.req.query("ids"));
    if (!refs) return errorResponse(c, "INVALID_REQUEST", `ids must be 1–${CALENDAR_MAX} comma-separated type:id pairs (movie:550,tv:1396).`, 400, c.get("requestId"));
    const g = guard(c); if (g) return g;
    try { cache(c, 1800); return c.json({ success: true, data: { entries: await service.calendar(refs) } }); } catch (e) { return fail(c, e); }
  });

  app.get("/collection/:id", async (c) => {
    const id = int(c.req.param("id"));
    if (!id) return errorResponse(c, "INVALID_MEDIA_ID", "id must be a positive TMDB collection id.", 400, c.get("requestId"));
    const g = guard(c); if (g) return g;
    try {
      const data = await service.collection(id);
      if (!data) return errorResponse(c, "MEDIA_NOT_FOUND", "Collection not found or has fewer than two titles.", 404, c.get("requestId"));
      cache(c, 3600);
      return c.json({ success: true, data });
    } catch (e) { return fail(c, e); }
  });

  app.get("/release/:tag", async (c) => {
    const tag = c.req.param("tag");
    if (tag !== "latest" && !isReleaseTag(tag)) return errorResponse(c, "INVALID_REQUEST", "tag must be latest or vX.Y.Z.", 400, c.get("requestId"));
    try {
      const data = await mirrorRelease(tag);
      if (!data) return errorResponse(c, "MEDIA_NOT_FOUND", "No such release.", 404, c.get("requestId"));
      cache(c, 300);
      return c.json({ success: true, data });
    } catch (e) { log("warn", "panda.release_mirror_failed", { error: String(e) }); return errorResponse(c, "PROVIDER_UNAVAILABLE", "Release information is unavailable right now.", 503, c.get("requestId")); }
  });

  /** Community ranking: Wilson lower bound over time-decayed play outcomes + live health prior. */
  app.get("/sources/ranking", async (c) => {
    const [health, b] = await Promise.all([sourceHealth().catch(() => []), buckets()]);
    c.header("cache-control", "public, max-age=60, stale-while-revalidate=600");
    return c.json({ success: true, data: { sources: rank(b, health), halfLifeHours: 72, shared: kvConfigured(), updatedAt: new Date().toISOString() } });
  });

  app.get("/anime", async (c) => {
    const g = guard(c); if (g) return g;
    try { cache(c, 1800); return c.json({ success: true, data: await service.anime() }); }
    catch (e) { log("warn", "panda.anime_failed", { error: String(e) }); return errorResponse(c, "PROVIDER_UNAVAILABLE", "Anime is unavailable right now.", 503, c.get("requestId")); }
  });

  app.get("/sources/health", async (c) => {
    cache(c, 300);
    return c.json({ success: true, data: { sources: await sourceHealth() } });
  });

  return app;
}
