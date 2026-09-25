import { Hono } from "hono";
import { z } from "zod";
import { TmdbVideoClient } from "./videos.js";
import { errorResponse } from "../../errors.js";

export function createTmdbVideoRoutes(client: TmdbVideoClient) {
  const app=new Hono();
  const error=(c:any,e:unknown)=>{const kind=e instanceof Error&&"kind" in e?(e as {kind:string}).kind:"";const status=kind==="UNCONFIGURED"||kind==="CIRCUIT_OPEN"?503:kind==="NOT_FOUND"?404:kind==="UNAUTHORIZED"?502:502;const code=kind==="UNCONFIGURED"||kind==="CIRCUIT_OPEN"?"PROVIDER_UNAVAILABLE":kind==="NOT_FOUND"?"NOT_FOUND":"PROVIDER_ERROR";return errorResponse(c,code,e instanceof Error?e.message:"Video provider request failed.",status,c.get("requestId")??"unknown");};
  app.get("/movie/:id/videos",async c=>{const id=z.coerce.number().int().positive().safeParse(c.req.param("id"));if(!id.success)return errorResponse(c,"INVALID_REQUEST","Invalid movie id.",400,c.get("requestId")??"unknown");try{return c.json({success:true,data:{id:id.data,mediaType:"movie",videos:await client.getMovieVideos(id.data)}});}catch(e){return error(c,e);}});
  app.get("/tv/:id/videos",async c=>{const id=z.coerce.number().int().positive().safeParse(c.req.param("id"));if(!id.success)return errorResponse(c,"INVALID_REQUEST","Invalid TV id.",400,c.get("requestId")??"unknown");try{return c.json({success:true,data:{id:id.data,mediaType:"tv",videos:await client.getTvVideos(id.data)}});}catch(e){return c.json(error(e),502);}});
  app.get("/tv/:id/season/:season/episode/:episode/videos",async c=>{const p=z.object({id:z.coerce.number().int().positive(),season:z.coerce.number().int().nonnegative(),episode:z.coerce.number().int().positive()}).safeParse(c.req.param());if(!p.success)return errorResponse(c,"INVALID_REQUEST","Invalid TV episode identifiers.",400,c.get("requestId")??"unknown");try{const {id,season,episode}=p.data;return c.json({success:true,data:{id,mediaType:"tv_episode",season,episode,videos:await client.getTvEpisodeVideos(id,season,episode)}});}catch(e){return c.json(error(e),502);}});
  return app;
}
