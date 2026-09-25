import { Hono } from "hono";
import { z } from "zod";
import { TmdbVideoClient } from "./videos.js";
import { errorResponse } from "../../errors.js";

type AppEnv = { Variables: { requestId: string } };

function providerError(c: any, error: unknown) {
  const kind = error instanceof Error && "kind" in error ? (error as { kind: string }).kind : "";
  const status = kind === "UNCONFIGURED" || kind === "CIRCUIT_OPEN" ? 503 : kind === "NOT_FOUND" ? 404 : kind === "RATE_LIMIT" ? 429 : kind === "TIMEOUT" ? 504 : 502;
  const code = kind === "UNCONFIGURED" || kind === "CIRCUIT_OPEN" ? "PROVIDER_UNAVAILABLE" : kind === "NOT_FOUND" ? "MEDIA_NOT_FOUND" : kind === "RATE_LIMIT" ? "PROVIDER_RATE_LIMITED" : kind === "TIMEOUT" ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR";
  return errorResponse(c, code, error instanceof Error ? error.message : "Video provider request failed.", status, c.get("requestId"));
}

export function createTmdbVideoRoutes(client: TmdbVideoClient) {
  const app = new Hono<AppEnv>();
  app.get("/movie/:id/videos", async c => {
    const id = z.coerce.number().int().positive().safeParse(c.req.param("id"));
    if (!id.success) return errorResponse(c, "INVALID_MEDIA_ID", "Movie ID must be a positive integer.", 400, c.get("requestId"));
    try { return c.json({ success:true, data:{ id:id.data, mediaType:"movie", videos:await client.getMovieVideos(id.data) } }); }
    catch (e) { return providerError(c,e); }
  });
  app.get("/tv/:id/videos", async c => {
    const id = z.coerce.number().int().positive().safeParse(c.req.param("id"));
    if (!id.success) return errorResponse(c, "INVALID_MEDIA_ID", "TV ID must be a positive integer.", 400, c.get("requestId"));
    try { return c.json({ success:true, data:{ id:id.data, mediaType:"tv", videos:await client.getTvVideos(id.data) } }); }
    catch (e) { return providerError(c,e); }
  });
  app.get("/tv/:id/season/:season/episode/:episode/videos", async c => {
    const p = z.object({ id:z.coerce.number().int().positive(), season:z.coerce.number().int().nonnegative(), episode:z.coerce.number().int().positive() }).safeParse(c.req.param());
    if (!p.success) return errorResponse(c, "INVALID_EPISODE_ID", "Invalid TV episode identifiers.", 400, c.get("requestId"));
    try { const {id,season,episode}=p.data; return c.json({success:true,data:{id,mediaType:"tv_episode",season,episode,videos:await client.getTvEpisodeVideos(id,season,episode)}}); }
    catch (e) { return providerError(c,e); }
  });
  return app;
}
