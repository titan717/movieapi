import { Hono } from "hono";
import { z } from "zod";
import { errorResponse } from "../../errors.js";
import { VidSrcProvider, VidSrcProviderError } from "./vidsrc.js";

type AppEnv = { Variables: { requestId: string } };

const idSchema = z.coerce.number().int().positive();

function providerError(c: any, error: unknown) {
  if (error instanceof VidSrcProviderError && error.kind === "UNCONFIGURED") {
    return errorResponse(c, "PROVIDER_UNAVAILABLE", "Playback provider is not configured.", 503, c.get("requestId"));
  }
  return errorResponse(c, "PROVIDER_ERROR", error instanceof Error ? error.message : "Playback provider request failed.", 502, c.get("requestId"));
}

function sourcesResponse(c: any, mediaType: "movie" | "tv_episode", sources: unknown, extra: Record<string, unknown> = {}) {
  return c.json({ success: true, data: { mediaType, sources, ...extra } });
}

export function createPlaybackRoutes(provider: VidSrcProvider) {
  const app = new Hono<AppEnv>();

  app.get("/movie/:id/sources", (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) return errorResponse(c, "INVALID_MEDIA_ID", "Movie TMDB ID must be a positive integer.", 400, c.get("requestId"));
    try {
      return sourcesResponse(c, "movie", provider.getMovieSources(id.data), { tmdbId: id.data });
    } catch (error) {
      return providerError(c, error);
    }
  });

  app.get("/movie/:id/play", (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) return errorResponse(c, "INVALID_MEDIA_ID", "Movie TMDB ID must be a positive integer.", 400, c.get("requestId"));
    try {
      const sources = provider.getMovieSources(id.data);
      return c.json({ success: true, data: { mediaType: "movie", source: sources[0] ?? null, tmdbId: id.data } });
    } catch (error) {
      return providerError(c, error);
    }
  });

  app.get("/tv/:id/season/:season/episode/:episode/sources", (c) => {
    const params = z.object({
      id: idSchema,
      season: z.coerce.number().int().positive(),
      episode: z.coerce.number().int().positive()
    }).safeParse(c.req.param());
    if (!params.success) return errorResponse(c, "INVALID_EPISODE_ID", "Invalid TV episode identifiers.", 400, c.get("requestId"));
    try {
      const { id, season, episode } = params.data;
      return sourcesResponse(c, "tv_episode", provider.getTvEpisodeSources(id, season, episode), {
        tmdbId: id,
        season,
        episode
      });
    } catch (error) {
      return providerError(c, error);
    }
  });

  app.get("/tv/:id/season/:season/episode/:episode/play", (c) => {
    const params = z.object({
      id: idSchema,
      season: z.coerce.number().int().nonnegative(),
      episode: z.coerce.number().int().positive()
    }).safeParse(c.req.param());
    if (!params.success) return errorResponse(c, "INVALID_EPISODE_ID", "Invalid TV episode identifiers.", 400, c.get("requestId"));
    try {
      const { id, season, episode } = params.data;
      const sources = provider.getTvEpisodeSources(id, season, episode);
      return c.json({ success: true, data: { mediaType: "tv_episode", source: sources[0] ?? null, tmdbId: id, season, episode } });
    } catch (error) {
      return providerError(c, error);
    }
  });

  return app;
}
