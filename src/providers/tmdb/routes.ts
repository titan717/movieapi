import { Hono } from "hono";
import type { Context } from "hono";
import { errorResponse } from "../../errors.js";
import { TmdbClient, TmdbProviderError } from "./client.js";
import { normalizeTmdbMovie, normalizeTmdbTv } from "./normalizer.js";

type AppEnv = { Variables: { requestId: string } };

function positiveInt(value: string | undefined, fallback: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, max);
}

function providerError(c: Context<AppEnv>, error: unknown) {
  if (!(error instanceof TmdbProviderError)) return null;
  const map = {
    UNCONFIGURED: ["PROVIDER_UNAVAILABLE", "TMDB is not configured.", 503],
    TIMEOUT: ["PROVIDER_TIMEOUT", "TMDB did not respond in time.", 504],
    RATE_LIMIT: ["PROVIDER_RATE_LIMITED", "TMDB rate limited the request.", 429],
    HTTP_ERROR: ["PROVIDER_UNAVAILABLE", "TMDB is currently unavailable.", 502],
    INVALID_RESPONSE: ["PROVIDER_INVALID_RESPONSE", "TMDB returned an invalid response.", 502],
    NOT_FOUND: ["MEDIA_NOT_FOUND", "The requested TMDB content was not found.", 404],
    UNAUTHORIZED: ["PROVIDER_AUTH_FAILED", "TMDB authentication failed.", 502],
    CIRCUIT_OPEN: ["PROVIDER_UNAVAILABLE", "TMDB is temporarily unavailable.", 503]
  } as const;
  const [code, message, status] = map[error.kind];
  return errorResponse(c, code, message, status, c.get("requestId"));
}

export function createTmdbRoutes(client: TmdbClient) {
  const app = new Hono<AppEnv>();

  app.get("/movie/:id", async (c) => {
    const id = positiveInt(c.req.param("id"), 0, 2_147_483_647);
    if (!id) return errorResponse(c, "INVALID_MEDIA_ID", "TMDB movie ID must be a positive integer.", 400, c.get("requestId"));
    try {
      return c.json({ success: true, data: normalizeTmdbMovie(await client.getMovie(id)) });
    } catch (error) {
      return providerError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unexpected provider error.", 500, c.get("requestId"));
    }
  });

  app.get("/tv/:id", async (c) => {
    const id = positiveInt(c.req.param("id"), 0, 2_147_483_647);
    if (!id) return errorResponse(c, "INVALID_MEDIA_ID", "TMDB TV ID must be a positive integer.", 400, c.get("requestId"));
    try {
      return c.json({ success: true, data: normalizeTmdbTv(await client.getTv(id)) });
    } catch (error) {
      return providerError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unexpected provider error.", 500, c.get("requestId"));
    }
  });

  app.get("/search/tv", async (c) => {
    const q = c.req.query("q")?.trim();
    if (!q) return errorResponse(c, "INVALID_REQUEST", "Query parameter q is required.", 400, c.get("requestId"));
    const page = positiveInt(c.req.query("page"), 1, 500);
    if (page === null) return errorResponse(c, "INVALID_REQUEST", "page must be a positive integer.", 400, c.get("requestId"));
    try {
      const result = await client.searchTv(q, page);
      return c.json({ success: true, data: { ...result, source: "tmdb" } });
    } catch (error) {
      return providerError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unexpected provider error.", 500, c.get("requestId"));
    }
  });

  app.get("/search/movie", async (c) => {
    const q = c.req.query("q")?.trim();
    if (!q) return errorResponse(c, "INVALID_REQUEST", "Query parameter q is required.", 400, c.get("requestId"));
    const page = positiveInt(c.req.query("page"), 1, 500);
    if (page === null) return errorResponse(c, "INVALID_REQUEST", "page must be a positive integer.", 400, c.get("requestId"));
    try {
      const result = await client.searchMovie(q, page);
      return c.json({ success: true, data: { ...result, source: "tmdb" } });
    } catch (error) {
      return providerError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unexpected provider error.", 500, c.get("requestId"));
    }
  });

  return app;
}
