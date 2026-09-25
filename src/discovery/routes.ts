import { Hono } from "hono";
import type { Context } from "hono";
import { errorResponse } from "../errors.js";
import { TmdbProviderError } from "../providers/tmdb/client.js";
import { TvmazeProviderError } from "../providers/tvmaze/client.js";
import { DiscoveryService } from "./service.js";

type AppEnv = { Variables: { requestId: string } };

function positiveInt(value: string | undefined, fallback: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, max);
}

function providerError(c: Context<AppEnv>, error: unknown) {
  const tmdb = error instanceof TmdbProviderError;
  const tvmaze = error instanceof TvmazeProviderError;
  if (!tmdb && !tvmaze) return null;
  const kind = error.kind;
  const provider = tmdb ? "TMDB" : "TVmaze";
  const map: Record<string, [string, string, 400 | 404 | 429 | 502 | 503 | 504]> = {
    UNCONFIGURED: ["PROVIDER_UNAVAILABLE", "TMDB is not configured.", 503],
    TIMEOUT: ["PROVIDER_TIMEOUT", `${provider} did not respond in time.`, 504],
    RATE_LIMIT: ["PROVIDER_RATE_LIMITED", `${provider} rate limited the request.`, 429],
    HTTP_ERROR: ["PROVIDER_UNAVAILABLE", `${provider} is currently unavailable.`, 502],
    INVALID_RESPONSE: ["PROVIDER_INVALID_RESPONSE", `${provider} returned an invalid response.`, 502],
    NOT_FOUND: ["MEDIA_NOT_FOUND", `The requested ${provider} content was not found.`, 404],
    UNAUTHORIZED: ["PROVIDER_AUTH_FAILED", "TMDB authentication failed.", 502],
    CIRCUIT_OPEN: ["PROVIDER_UNAVAILABLE", `${provider} is temporarily unavailable.`, 503]
  };
  const mapped = map[kind];
  return mapped ? errorResponse(c, mapped[0], mapped[1], mapped[2], c.get("requestId")) : null;
}

function parseType(value: string | undefined) {
  return value === "movie" || value === "tv" ? value : null;
}

function parseRegion(value: string | undefined) {
  if (!value) return undefined;
  const region = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(region) ? region : null;
}

export function createDiscoveryRoutes(service: DiscoveryService) {
  const app = new Hono<AppEnv>();

  const pageRoute = (handler: (page: number) => Promise<unknown>) => async (c: Context<AppEnv>) => {
    const page = positiveInt(c.req.query("page"), 1, 500);
    if (page === null) return errorResponse(c, "INVALID_REQUEST", "page must be a positive integer.", 400, c.get("requestId"));
    try { return c.json({ success: true, data: await handler(page) }); }
    catch (error) { return providerError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unexpected discovery error.", 500, c.get("requestId")); }
  };

  app.get("/popular/movies", pageRoute((page) => service.popularMovies(page)));
  app.get("/popular/tv", pageRoute((page) => service.popularTv(page)));
  app.get("/latest/movies", pageRoute((page) => service.latestMovies(page)));
  app.get("/latest/tv", pageRoute((page) => service.latestTv(page)));

  app.get("/upcoming/movies", async (c) => {
    const page = positiveInt(c.req.query("page"), 1, 500);
    const region = parseRegion(c.req.query("region"));
    if (page === null || region === null) return errorResponse(c, "INVALID_REQUEST", "page must be positive and region must be a two-letter ISO code.", 400, c.get("requestId"));
    try { return c.json({ success: true, data: await service.upcomingMovies(page, region) }); }
    catch (error) { return providerError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unexpected discovery error.", 500, c.get("requestId")); }
  });

  app.get("/upcoming/tv", pageRoute((page) => service.upcomingTv(page)));
  app.get("/airing/upcoming", pageRoute((page) => service.upcomingAiring(page)));

  app.get("/airing/today", async (c) => {
    const country = (c.req.query("country") ?? "US").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) return errorResponse(c, "INVALID_REQUEST", "country must be a two-letter ISO country code.", 400, c.get("requestId"));
    try { return c.json({ success: true, data: await service.airingToday(country) }); }
    catch (error) { return providerError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unexpected discovery error.", 500, c.get("requestId")); }
  });

  app.get("/trending", async (c) => {
    const window = c.req.query("window") === "week" ? "week" : "day";
    try { return c.json({ success: true, data: await service.trending(window) }); }
    catch (error) { return providerError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unexpected discovery error.", 500, c.get("requestId")); }
  });

  app.get("/featured", async (c) => {
    try { return c.json({ success: true, data: await service.featured() }); }
    catch (error) { return providerError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unexpected discovery error.", 500, c.get("requestId")); }
  });

  app.get("/genres", async (c) => {
    const type = parseType(c.req.query("type")) ?? "movie";
    try { return c.json({ success: true, data: await service.genres(type) }); }
    catch (error) { return providerError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unexpected discovery error.", 500, c.get("requestId")); }
  });

  app.get("/genres/:genre", async (c) => {
    const type = parseType(c.req.query("type")) ?? "movie";
    const page = positiveInt(c.req.query("page"), 1, 500);
    if (page === null) return errorResponse(c, "INVALID_REQUEST", "page must be a positive integer.", 400, c.get("requestId"));
    try {
      const data = await service.genre(type, c.req.param("genre"), page);
      if (!data) return errorResponse(c, "MEDIA_NOT_FOUND", "The requested genre was not found.", 404, c.get("requestId"));
      return c.json({ success: true, data });
    } catch (error) { return providerError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unexpected discovery error.", 500, c.get("requestId")); }
  });

  app.get("/recommendations/:id", async (c) => {
    const type = parseType(c.req.query("type"));
    const id = positiveInt(c.req.param("id"), 0, 2_147_483_647);
    const page = positiveInt(c.req.query("page"), 1, 500);
    if (!type) return errorResponse(c, "INVALID_REQUEST", "type must be movie or tv.", 400, c.get("requestId"));
    if (!id || page === null) return errorResponse(c, "INVALID_MEDIA_ID", "id and page must be positive integers.", 400, c.get("requestId"));
    try { return c.json({ success: true, data: await service.recommendations(type, id, page) }); }
    catch (error) { return providerError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unexpected discovery error.", 500, c.get("requestId")); }
  });

  app.get("/home", async (c) => {
    try { return c.json({ success: true, data: await service.home() }); }
    catch (error) { return providerError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unable to build discovery home.", 500, c.get("requestId")); }
  });

  return app;
}
