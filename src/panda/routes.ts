import { Hono } from "hono";
import type { Context } from "hono";
import { errorResponse } from "../errors.js";
import { TmdbProviderError } from "../providers/tmdb/client.js";
import { PandaService, playbackSources, type MediaType } from "./service.js";

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

/** Short CDN cache so Render + browsers can serve stale-while-revalidate. */
function cache(c: Context<AppEnv>, seconds: number) { c.header("cache-control", `public, max-age=${seconds}, stale-while-revalidate=${seconds * 10}`); }

export function createPandaRoutes(service: PandaService) {
  const app = new Hono<AppEnv>();
  const guard = (c: Context<AppEnv>) => service.enabled ? null : errorResponse(c, "PROVIDER_UNAVAILABLE", "TMDB is not configured.", 503, c.get("requestId"));

  app.get("/page/:kind", async (c) => {
    const kind = c.req.param("kind");
    if (kind !== "home" && kind !== "movies" && kind !== "tv") return errorResponse(c, "INVALID_REQUEST", "kind must be home, movies or tv.", 400, c.get("requestId"));
    const g = guard(c); if (g) return g;
    try { cache(c, 300); return c.json({ success: true, data: await service.page(kind) }); } catch (e) { return fail(c, e); }
  });

  app.get("/title/:type/:id", async (c) => {
    const type = c.req.param("type"); const id = int(c.req.param("id"));
    if (!isType(type) || !id) return errorResponse(c, "INVALID_MEDIA_ID", "type must be movie|tv and id a positive TMDB id.", 400, c.get("requestId"));
    const g = guard(c); if (g) return g;
    try { cache(c, 600); return c.json({ success: true, data: await service.title(type, id) }); } catch (e) { return fail(c, e); }
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
      minVotes: sortRaw === "new" ? 20 : undefined
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

  app.get("/play/:type/:id", (c) => {
    const type = c.req.param("type"); const id = int(c.req.param("id"));
    const season = int(c.req.query("s")); const episode = int(c.req.query("e")); const start = Number(c.req.query("t") ?? 0);
    if (!isType(type) || !id || season === null || episode === null) return errorResponse(c, "INVALID_MEDIA_ID", "Invalid playback identifiers.", 400, c.get("requestId"));
    if (type === "tv" && (!season || !episode)) return errorResponse(c, "INVALID_EPISODE_ID", "TV playback requires s and e.", 400, c.get("requestId"));
    const color = c.req.query("color");
    cache(c, 3600);
    return c.json({ success: true, data: { type, tmdbId: id, season: season ?? null, episode: episode ?? null, sources: playbackSources(type, id, { season, episode, start: Number.isFinite(start) ? start : 0, color: color && /^[0-9a-fA-F]{6}$/.test(color) ? color : undefined }) } });
  });

  return app;
}
