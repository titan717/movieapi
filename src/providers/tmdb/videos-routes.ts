import { Hono } from "hono";
import { z } from "zod";
import { TmdbVideoClient } from "./videos.js";
import { toPublicError } from "../../errors.js";

export function createTmdbVideoRoutes(client: TmdbVideoClient) {
  const app=new Hono();
  const error=(e:unknown)=>{const kind=e instanceof Error&&"kind" in e?(e as {kind:string}).kind:"";const status=kind==="UNCONFIGURED"||kind==="CIRCUIT_OPEN"?503:kind==="NOT_FOUND"?404:kind==="UNAUTHORIZED"?502:502;return toPublicError(e,status);};
  app.get("/movie/:id/videos",async c=>{const id=z.coerce.number().int().positive().safeParse(c.req.param("id"));if(!id.success)return c.json(toPublicError(new Error("Invalid movie id."),400),400);try{return c.json({success:true,data:{id:id.data,mediaType:"movie",videos:await client.getMovieVideos(id.data)}});}catch(e){return c.json(error(e),502);}});
  app.get("/tv/:id/videos",async c=>{const id=z.coerce.number().int().positive().safeParse(c.req.param("id"));if(!id.success)return c.json(toPublicError(new Error("Invalid TV id."),400),400);try{return c.json({success:true,data:{id:id.data,mediaType:"tv",videos:await client.getTvVideos(id.data)}});}catch(e){return c.json(error(e),502);}});
  app.get("/tv/:id/season/:season/episode/:episode/videos",async c=>{const p=z.object({id:z.coerce.number().int().positive(),season:z.coerce.number().int().nonnegative(),episode:z.coerce.number().int().positive()}).safeParse(c.req.param());if(!p.success)return c.json(toPublicError(new Error("Invalid TV episode identifiers."),400),400);try{const {id,season,episode}=p.data;return c.json({success:true,data:{id,mediaType:"tv_episode",season,episode,videos:await client.getTvEpisodeVideos(id,season,episode)}});}catch(e){return c.json(error(e),502);}});
  return app;
}
