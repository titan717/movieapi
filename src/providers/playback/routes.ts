import { Hono } from "hono";
import { z } from "zod";
import { errorResponse } from "../../errors.js";
import type { PlaybackProvider } from "./provider.js";

type AppEnv = { Variables: { requestId: string } };

const idSchema = z.coerce.number().int().positive();

function providerError(c: any, error: unknown) {
  if (error instanceof Error && "kind" in error && (error as { kind?: string }).kind === "UNCONFIGURED") {
    return errorResponse(c, "PROVIDER_UNAVAILABLE", "Playback provider is not configured.", 503, c.get("requestId"));
  }
  return errorResponse(c, "PROVIDER_ERROR", error instanceof Error ? error.message : "Playback provider request failed.", 502, c.get("requestId"));
}

function getPlaybackMode(sources: Array<{ type: "embed" | "hls" | "dash" | "file" }>): "direct" | "embed" | "hybrid" {
  const hasDirect = sources.some((source) => source.type !== "embed");
  const hasEmbed = sources.some((source) => source.type === "embed");
  if (hasDirect && hasEmbed) return "hybrid";
  if (hasDirect) return "direct";
  return "embed";
}

function sourcesResponse(c: any, mediaType: "movie" | "tv_episode", sources: unknown, extra: Record<string, unknown> = {}) {
  const normalizedSources = Array.isArray(sources) ? sources : [];
  const mode = getPlaybackMode(normalizedSources);
  return c.json({ success: true, data: { mediaType, mode, sources: normalizedSources, ...extra } });
}

export type TvPlaybackIdResolver = (tvmazeId: number) => Promise<number | null>;

export function createPlaybackRoutes(provider: PlaybackProvider, resolveTvPlaybackId?: TvPlaybackIdResolver) {
  const app = new Hono<AppEnv>();

  app.get("/movie/:id/sources", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) return errorResponse(c, "INVALID_MEDIA_ID", "Movie TMDB ID must be a positive integer.", 400, c.get("requestId"));
    try {
      return sourcesResponse(c, "movie", await provider.getMovieSources(id.data), { tmdbId: id.data });
    } catch (error) {
      return providerError(c, error);
    }
  });

  app.get("/movie/:id/play", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) return errorResponse(c, "INVALID_MEDIA_ID", "Movie TMDB ID must be a positive integer.", 400, c.get("requestId"));
    try {
      const sources = await provider.getMovieSources(id.data);
      return c.json({ success: true, data: { mediaType: "movie", mode: getPlaybackMode(sources), source: sources[0] ?? null, tmdbId: id.data } });
    } catch (error) {
      return providerError(c, error);
    }
  });

  app.get("/tv/:id/season/:season/episode/:episode/sources", async (c) => {
    const params = z.object({
      id: idSchema,
      season: z.coerce.number().int().positive(),
      episode: z.coerce.number().int().positive()
    }).safeParse(c.req.param());
    if (!params.success) return errorResponse(c, "INVALID_EPISODE_ID", "Invalid TV episode identifiers.", 400, c.get("requestId"));
    try {
      const { id, season, episode } = params.data;
      const explicitTmdbId = Number(c.req.query("tmdbId") || 0);
      const tmdbId = explicitTmdbId > 0 ? explicitTmdbId : (resolveTvPlaybackId ? await resolveTvPlaybackId(id) : id);
      if (!tmdbId) return errorResponse(c, "MEDIA_NOT_FOUND", "Unable to resolve the TV show to a TMDB ID for playback.", 404, c.get("requestId"));
      return sourcesResponse(c, "tv_episode", await provider.getTvEpisodeSources(tmdbId, season, episode), {
        tmdbId,
        season,
        episode
      });
    } catch (error) {
      return providerError(c, error);
    }
  });

  app.get("/tv/:id/season/:season/episode/:episode/play", async (c) => {
    const params = z.object({
      id: idSchema,
      season: z.coerce.number().int().nonnegative(),
      episode: z.coerce.number().int().positive()
    }).safeParse(c.req.param());
    if (!params.success) return errorResponse(c, "INVALID_EPISODE_ID", "Invalid TV episode identifiers.", 400, c.get("requestId"));
    try {
      const { id, season, episode } = params.data;
      const explicitTmdbId = Number(c.req.query("tmdbId") || 0);
      const tmdbId = explicitTmdbId > 0 ? explicitTmdbId : (resolveTvPlaybackId ? await resolveTvPlaybackId(id) : id);
      if (!tmdbId) return errorResponse(c, "MEDIA_NOT_FOUND", "Unable to resolve the TV show to a TMDB ID for playback.", 404, c.get("requestId"));
      const sources = await provider.getTvEpisodeSources(tmdbId, season, episode);
      return c.json({ success: true, data: { mediaType: "tv_episode", mode: getPlaybackMode(sources), source: sources[0] ?? null, tmdbId, season, episode } });
    } catch (error) {
      return providerError(c, error);
    }
  });

  return app;
}
