import { Hono } from "hono";
import type { Context } from "hono";
import { errorResponse } from "../../errors.js";
import { TvmazeClient, TvmazeProviderError } from "./client.js";
import { normalizeEpisode, normalizeSeason, normalizeShow } from "./normalizer.js";

type AppEnv = { Variables: { requestId: string } };

function positiveInt(value: string | undefined, fallback: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, max);
}

function handleProviderError(c: Context<AppEnv>, error: unknown) {
  if (!(error instanceof TvmazeProviderError)) return null;
  const map = {
    TIMEOUT: ["PROVIDER_TIMEOUT", "TVmaze did not respond in time.", 504],
    RATE_LIMIT: ["PROVIDER_RATE_LIMITED", "TVmaze rate limited the request.", 429],
    HTTP_ERROR: ["PROVIDER_UNAVAILABLE", "TVmaze is currently unavailable.", 502],
    INVALID_RESPONSE: ["PROVIDER_INVALID_RESPONSE", "TVmaze returned an invalid response.", 502],
    NOT_FOUND: ["MEDIA_NOT_FOUND", "The requested TV content was not found.", 404]
  } as const;
  const [code, message, status] = map[error.kind];
  return errorResponse(c, code, message, status, c.get("requestId"));
}

function validateId(c: Context<AppEnv>, value: string, label = "TVmaze show ID") {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    return { id: null, response: errorResponse(c, "INVALID_MEDIA_ID", `${label} must be a positive integer.`, 400, c.get("requestId")) };
  }
  return { id, response: null };
}

export function createTvmazeRoutes(client: TvmazeClient) {
  const app = new Hono<AppEnv>();

  app.get("/search", async (c) => {
    const q = c.req.query("q")?.trim();
    if (!q) return errorResponse(c, "INVALID_REQUEST", "Query parameter q is required.", 400, c.get("requestId"));

    const page = positiveInt(c.req.query("page"), 1, 1000);
    const limit = positiveInt(c.req.query("limit"), 20, 50);
    if (page === null || limit === null) {
      return errorResponse(c, "INVALID_REQUEST", "page and limit must be positive integers.", 400, c.get("requestId"));
    }

    try {
      const matches = await client.searchShows(q);
      const start = (page - 1) * limit;
      const results = matches.slice(start, start + limit).map((match) => ({
        score: match.score,
        ...normalizeShow(match.show)
      }));
      return c.json({
        success: true,
        data: {
          query: q,
          results,
          pagination: {
            page,
            limit,
            total: matches.length,
            hasNext: start + results.length < matches.length
          }
        }
      });
    } catch (error) {
      return handleProviderError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unexpected provider error.", 500, c.get("requestId"));
    }
  });

  app.get("/:id", async (c) => {
    const checked = validateId(c, c.req.param("id"));
    if (checked.response) return checked.response;

    try {
      return c.json({ success: true, data: normalizeShow(await client.getShow(checked.id!)) });
    } catch (error) {
      return handleProviderError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unexpected provider error.", 500, c.get("requestId"));
    }
  });

  app.get("/:id/seasons", async (c) => {
    const checked = validateId(c, c.req.param("id"));
    if (checked.response) return checked.response;

    try {
      const seasons = await client.getShowSeasons(checked.id!);
      return c.json({ success: true, data: { seasons: seasons.map(normalizeSeason) } });
    } catch (error) {
      return handleProviderError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unexpected provider error.", 500, c.get("requestId"));
    }
  });

  app.get("/:id/episodes", async (c) => {
    const checked = validateId(c, c.req.param("id"));
    if (checked.response) return checked.response;

    const page = positiveInt(c.req.query("page"), 1, 1000);
    const limit = positiveInt(c.req.query("limit"), 50, 100);
    if (page === null || limit === null) {
      return errorResponse(c, "INVALID_REQUEST", "page and limit must be positive integers.", 400, c.get("requestId"));
    }
    const specials = c.req.query("specials") === "true" || c.req.query("specials") === "1";

    try {
      const episodes = await client.getShowEpisodes(checked.id!, specials);
      const start = (page - 1) * limit;
      const results = episodes.slice(start, start + limit).map(normalizeEpisode);
      return c.json({
        success: true,
        data: {
          episodes: results,
          pagination: { page, limit, total: episodes.length, hasNext: start + results.length < episodes.length }
        }
      });
    } catch (error) {
      return handleProviderError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unexpected provider error.", 500, c.get("requestId"));
    }
  });

  app.get("/:id/season/:season", async (c) => {
    const checked = validateId(c, c.req.param("id"));
    const seasonNumber = Number(c.req.param("season"));
    if (checked.response) return checked.response;
    if (!Number.isInteger(seasonNumber) || seasonNumber < 1) {
      return errorResponse(c, "INVALID_REQUEST", "Season must be a positive integer.", 400, c.get("requestId"));
    }

    try {
      const seasons = await client.getShowSeasons(checked.id!);
      const season = seasons.find((item) => item.number === seasonNumber);
      if (!season) return errorResponse(c, "MEDIA_NOT_FOUND", "The requested season was not found.", 404, c.get("requestId"));
      const episodes = await client.getSeasonEpisodes(season.id);
      return c.json({
        success: true,
        data: {
          season: normalizeSeason(season),
          episodes: episodes.map(normalizeEpisode)
        }
      });
    } catch (error) {
      return handleProviderError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unexpected provider error.", 500, c.get("requestId"));
    }
  });

  app.get("/:id/season/:season/episode/:episode", async (c) => {
    const checked = validateId(c, c.req.param("id"));
    const season = Number(c.req.param("season"));
    const episode = Number(c.req.param("episode"));
    if (checked.response) return checked.response;
    if (![season, episode].every((value) => Number.isInteger(value) && value > 0)) {
      return errorResponse(c, "INVALID_REQUEST", "Season and episode must be positive integers.", 400, c.get("requestId"));
    }

    try {
      const result = await client.getEpisodeByNumber(checked.id!, season, episode);
      return c.json({ success: true, data: normalizeEpisode(result) });
    } catch (error) {
      return handleProviderError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unexpected provider error.", 500, c.get("requestId"));
    }
  });

  app.get("/:id/images", async (c) => {
    const checked = validateId(c, c.req.param("id"));
    if (checked.response) return checked.response;

    try {
      const images = await client.getShowImages(checked.id!);
      return c.json({
        success: true,
        data: {
          images,
          source: "tvmaze"
        }
      });
    } catch (error) {
      return handleProviderError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unexpected provider error.", 500, c.get("requestId"));
    }
  });

  return app;
}

export function createTvmazeScheduleRoutes(client: TvmazeClient) {
  const app = new Hono<AppEnv>();

  const schedule = async (c: Context<AppEnv>, date?: string) => {
    const country = (c.req.query("country") ?? "US").trim().toUpperCase();
    if (country && !/^[A-Z]{2}$/.test(country)) {
      return errorResponse(c, "INVALID_REQUEST", "country must be a two-letter ISO country code.", 400, c.get("requestId"));
    }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return errorResponse(c, "INVALID_REQUEST", "date must use YYYY-MM-DD format.", 400, c.get("requestId"));
    }

    try {
      const episodes = await client.getSchedule(country, date);
      return c.json({
        success: true,
        data: {
          country: country || null,
          date: date ?? new Date().toISOString().slice(0, 10),
          episodes: episodes.map((item) => ({
            ...normalizeEpisode(item),
            show: item.show ? normalizeShow(item.show) : null
          })),
          source: "tvmaze"
        }
      });
    } catch (error) {
      return handleProviderError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unexpected provider error.", 500, c.get("requestId"));
    }
  };

  app.get("/", (c) => schedule(c, c.req.query("date")));
  app.get("/today", (c) => schedule(c));
  app.get("/date/:date", (c) => schedule(c, c.req.param("date")));

  return app;
}
