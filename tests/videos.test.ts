import { describe, expect, it, vi, afterEach } from "vitest";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";

const base: Config = {
  apiKeys:new Set(["test-key"]), authRequired:false, rateLimit:100, rateWindowMs:60000,
  tvmaze:{baseUrl:"https://api.tvmaze.com",userAgent:"MovieApi-test",timeoutMs:1000},
  tmdb:{accessToken:"tmdb-test-token",baseUrl:"https://api.themoviedb.org/3",timeoutMs:1000}, port:3000
};
afterEach(()=>vi.unstubAllGlobals());

describe("MovieApi Phase 6 videos",()=>{
  it("normalizes and caches movie trailers",async()=>{
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({id:11,results:[
      {id:"a",iso_639_1:"en",iso_3166_1:"US",key:"abc",name:"Official Trailer",site:"YouTube",size:1080,type:"Trailer",official:true,published_at:"2026-01-01T00:00:00Z"}
    ]}),{status:200}));
    vi.stubGlobal("fetch",fetchMock);
    const app=createApp(base);
    const a=await app.request("/api/v1/movie/11/videos");
    const b=await app.request("/api/v1/movie/11/videos");
    const body=await a.json();
    expect(a.status).toBe(200); expect(body.data.videos[0].embedUrl).toContain("/embed/abc"); expect(body.data.videos[0].thumbnail).toContain("/abc/");
    expect(fetchMock).toHaveBeenCalledTimes(1); expect((await b.json()).data.videos).toHaveLength(1);
  });
  it("supports TV episode videos",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({results:[]}),{status:200})));
    const response=await createApp(base).request("/api/v1/tv/22/season/1/episode/2/videos");
    const body=await response.json();
    expect(response.status).toBe(200); expect(body.data.mediaType).toBe("tv_episode"); expect(body.data.season).toBe(1); expect(body.data.episode).toBe(2);
  });
  it("rejects invalid video identifiers",async()=>{
    const response=await createApp(base).request("/api/v1/movie/nope/videos");
    expect(response.status).toBe(400);
  });
});
