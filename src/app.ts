import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadConfig, type Config } from "./config.js";
import { errorResponse } from "./errors.js";
import { requestId } from "./middleware/request-id.js";
import { authMiddleware } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { log } from "./logger.js";
import { TvmazeClient, TvmazeProviderError, createTvmazeRoutes, createTvmazeScheduleRoutes } from "./providers/tvmaze/index.js";
import { TmdbClient, createTmdbRoutes } from "./providers/tmdb/index.js";
import { normalizeShow } from "./providers/tvmaze/normalizer.js";
import { findMatchingTmdbTv } from "./providers/tvmaze/fallback.js";
import { DiscoveryService, createDiscoveryRoutes } from "./discovery/index.js";
import { TmdbVideoClient, createTmdbVideoRoutes } from "./providers/tmdb/index.js";
import { VidSrcProvider, createPlaybackRoutes } from "./providers/playback/index.js";

type AppEnv = { Variables: { requestId: string } };

const OPENAPI_YAML = [
  "openapi: 3.1.0",
  "info:",
  "  title: MovieApi",
  "  version: 0.7.0",
  "  description: Kinoma media API with discovery, videos, and playback.",
  "servers:",
  "  - url: /api/v1",
  "paths:",
  "  /health:",
  "    get:",
  "      summary: API health",
  "      operationId: getHealth",
  "      responses:",
  '        "200":',
  "          description: Healthy API",
  "  /version:",
  "    get:",
  "      summary: API version",
  "      operationId: getVersion",
  "      responses:",
  '        "200":',
  "          description: Version information",
  "  /popular/movies:",
  "    get:",
  "      summary: Popular movies",
  "  /popular/tv:",
  "    get:",
  "      summary: Popular TV",
  "  /latest/movies:",
  "    get:",
  "      summary: Latest movies",
  "  /latest/tv:",
  "    get:",
  "      summary: Latest TV",
  "  /upcoming/movies:",
  "    get:",
  "      summary: Upcoming movies",
  "  /upcoming/tv:",
  "    get:",
  "      summary: Upcoming TV",
  "  /airing/upcoming:",
  "    get:",
  "      summary: Upcoming airing",
  "  /trending:",
  "    get:",
  "      summary: Trending movies and TV",
  "  /featured:",
  "    get:",
  "      summary: Featured media",
  "  /genres:",
  "    get:",
  "      summary: List genres",
  "  /genres/{genre}:",
  "    get:",
  "      summary: Discover by genre",
  "  /recommendations/{id}:",
  "    get:",
  "      summary: Recommendations",
  "  /home:",
  "    get:",
  "      summary: Kinoma homepage discovery aggregation",
  "  /search:",
  "    get:",
  "      summary: Search TV shows",
  "      parameters:",
  "        - name: q",
  "          in: query",
  "          required: true",
  "          schema: { type: string }",
  "      responses:",
  '        "200":',
  "          description: Normalized TV search results",
  "  /tv/search:",
  "    get:",
  "      summary: Search TV shows through the TV route",
  "      responses:",
  '        "200":',
  "          description: Normalized TV search results",
  "  /tv/{id}:",
  "    get:",
  "      summary: Get normalized TV show",
  "      parameters:",
  "        - name: id",
  "          in: path",
  "          required: true",
  "          schema: { type: integer, minimum: 1 }",
  "      responses:",
  '        "200":',
  "          description: Normalized TV show",
  '        "404":',
  "          description: TV show not found",
  "  /tv/{id}/seasons:",
  "    get:",
  "      summary: List seasons",
  "      responses:",
  '        "200":',
  "          description: Normalized seasons",
  "  /tv/{id}/episodes:",
  "    get:",
  "      summary: List episodes",
  "      responses:",
  '        "200":',
  "          description: Paginated normalized episodes",
  "  /tv/{id}/season/{season}:",
  "    get:",
  "      summary: Get a season and its episodes",
  "      responses:",
  '        "200":',
  "          description: Season and episodes",
  "  /tv/{id}/season/{season}/episode/{episode}:",
  "    get:",
  "      summary: Get an episode by season and number",
  "      responses:",
  '        "200":',
  "          description: Normalized episode",
  "  /tv/{id}/images:",
  "    get:",
  "      summary: Get TVmaze show images",
  "      responses:",
  '        "200":',
  "          description: Show images",
  "  /tmdb/movie/{id}:",
  "    get:",
  "      summary: Get a normalized TMDB movie",
  "      responses:",
  '        "200":',
  "          description: TMDB movie",
  "  /tmdb/tv/{id}:",
  "    get:",
  "      summary: Get a normalized TMDB TV show",
  "      responses:",
  '        "200":',
  "          description: TMDB TV show",
  "  /tmdb/search/tv:",
  "    get:",
  "      summary: Search TMDB TV shows",
  "      responses:",
  '        "200":',
  "          description: TMDB TV results",
  "  /tmdb/search/movie:",
  "    get:",
  "      summary: Search TMDB movies",
  "      responses:",
  '        "200":',
  "          description: TMDB movie results",
  "  /airing:",
  "    get:",
  "      summary: Get schedule for a country/date",
  "      responses:",
  '        "200":',
  "          description: Airing episodes",
  "  /airing/today:",
  "    get:",
  "      summary: Get today's schedule",
  "      responses:",
  '        "200":',
  "          description: Today's airing episodes",
  "  /airing/date/{date}:",
  "    get:",
  "      summary: Get schedule for a date",
  "      responses:",
  '        "200":',
  "          description: Airing episodes for the date",
  "  /movie/{id}/sources:",
  "    get:",
  "      summary: Get movie playback sources",
  "  /movie/{id}/play:",
  "    get:",
  "      summary: Get primary movie playback source",
  "  /tv/{id}/season/{season}/episode/{episode}/sources:",
  "    get:",
  "      summary: Get TV episode playback sources",
  "  /tv/{id}/season/{season}/episode/{episode}/play:",
  "    get:",
  "      summary: Get primary TV episode playback source"
].join("\n") + "\n";

export function createApp(config: Config = loadConfig()) {
  const app = new Hono<AppEnv>();
  const tvmaze = new TvmazeClient(config.tvmaze);
  const tmdb = new TmdbClient(config.tmdb);
  const discovery = new DiscoveryService(tmdb, tvmaze);
  const tmdbVideos = new TmdbVideoClient(config.tmdb);
  const playback = new VidSrcProvider(config.vidsrc);

  app.use("*", requestId);
  app.use("*", cors({
    origin: config.corsOrigin,
    allowHeaders: ["Content-Type", "X-API-Key", "X-Request-ID"],
    exposeHeaders: ["X-Request-ID", "Retry-After"]
  }));
  app.use("*", rateLimitMiddleware(config));
  app.use("/api/v1/*", authMiddleware(config));

  app.use("*", async (c, next) => {
    await next();
    c.header("x-content-type-options", "nosniff");
    c.header("referrer-policy", "strict-origin-when-cross-origin");
    c.header("x-frame-options", "DENY");
  });

  app.get("/", (c) => c.json({
    success: true,
    data: { name: "MovieApi", version: "0.7.0", status: "playback" }
  }));

  app.get("/api/v1/health", (c) => c.json({
    success: true,
    data: {
      status: "healthy",
      service: "movieapi",
      version: "0.7.0",
      timestamp: new Date().toISOString(),
      providers: { tvmaze: tvmaze.getHealth(), tmdb: tmdb.getHealth(), vidsrc: playback.getHealth() }
    }
  }));

  app.get("/api/v1/version", (c) => c.json({
    success: true,
    data: { version: "0.7.0", apiVersion: "v1", phase: 7 }
  }));

  app.route("/api/v1/tv", createTvmazeRoutes(tvmaze, tmdb));
  app.route("/api/v1/tmdb", createTmdbRoutes(tmdb));
  app.route("/api/v1/airing", createTvmazeScheduleRoutes(tvmaze));
  app.route("/api/v1", createDiscoveryRoutes(discovery));
  app.route("/api/v1", createTmdbVideoRoutes(tmdbVideos));
  app.route("/api/v1", createPlaybackRoutes(playback, async (tvmazeId) => {
    if (!tmdb.enabled) return null;
    try {
      const show = await tvmaze.getShow(tvmazeId);
      const match = await findMatchingTmdbTv(show, tmdb);
      return match?.id ?? null;
    } catch (error) {
      log("warn", "playback_id_resolution_failed", {
        tvmazeId,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }));

  app.get("/api/v1/search", async (c) => {
    const q = c.req.query("q")?.trim();
    if (!q) return errorResponse(c, "INVALID_REQUEST", "Query parameter q is required.", 400, c.get("requestId"));

    try {
      const matches = await tvmaze.searchShows(q);
      const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 20) || 20, 1), 50);
      const page = Math.min(Math.max(Number(c.req.query("page") ?? 1) || 1, 1), 1000);
      const start = (page - 1) * limit;
      return c.json({
        success: true,
        data: {
          query: q,
          results: matches.slice(start, start + limit).map((match) => ({
            score: match.score,
            ...normalizeShow(match.show)
          })),
          pagination: {
            page,
            limit,
            total: matches.length,
            hasNext: start + limit < matches.length
          }
        }
      });
    } catch (error) {
      if (error instanceof TvmazeProviderError) {
        const kind = error.kind;
        const map: Record<string, [string, string, 400 | 429 | 502 | 504]> = {
          TIMEOUT: ["PROVIDER_TIMEOUT", "TVmaze did not respond in time.", 504],
          RATE_LIMIT: ["PROVIDER_RATE_LIMITED", "TVmaze rate limited the request.", 429],
          HTTP_ERROR: ["PROVIDER_UNAVAILABLE", "TVmaze is currently unavailable.", 502],
          INVALID_RESPONSE: ["PROVIDER_INVALID_RESPONSE", "TVmaze returned an invalid response.", 502]
        };
        const mapped = map[kind];
        if (mapped) return errorResponse(c, mapped[0], mapped[1], mapped[2], c.get("requestId"));
      }
      return errorResponse(c, "INTERNAL_ERROR", "Unexpected provider error.", 500, c.get("requestId"));
    }
  });

  app.get("/docs", (c) => c.html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Panda.fun API Docs</title>
<style>
:root{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#e8e8ec;background:#0b0c10}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0%,#171925,transparent 40%),#0b0c10}
header{position:sticky;top:0;z-index:5;border-bottom:1px solid #242631;background:rgba(11,12,16,.88);backdrop-filter:blur(18px)}
.wrap{max-width:1180px;margin:auto;padding:0 22px}.top{display:flex;align-items:center;justify-content:space-between;gap:18px;min-height:72px}
.brand{font-weight:800;font-size:22px;letter-spacing:-.04em}.brand span{opacity:.5;font-weight:600}.links a{color:#b9bac5;text-decoration:none;margin-left:18px;font-size:14px}
main{padding:44px 0 80px}.hero{padding:12px 0 28px}.eyebrow{font-size:12px;letter-spacing:.14em;color:#8f92a2;font-weight:700}.hero h1{font-size:46px;line-height:1.02;margin:10px 0}.hero p{color:#a8aab5;max-width:720px;line-height:1.7}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 30px}button,.method{border:1px solid #30323e;background:#151720;color:#eee;border-radius:9px;padding:9px 12px;cursor:pointer}button:hover{border-color:#55596b}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.route{border:1px solid #272936;border-radius:16px;background:rgba(20,21,29,.75);overflow:hidden}
.route-head{display:flex;align-items:center;gap:10px;padding:16px;border-bottom:1px solid #272936}.method{font:700 12px ui-monospace,SFMono-Regular,Menlo,monospace;padding:5px 8px}.get{color:#9ec5ff}.path{font:600 14px ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-word}.summary{padding:12px 16px;color:#a8aab5;font-size:14px}
.try{padding:0 16px 16px}.row{display:flex;gap:8px;align-items:center}.row input{flex:1;min-width:0;background:#0e0f15;border:1px solid #30323e;border-radius:9px;color:#fff;padding:9px 10px}.result{margin-top:10px;background:#08090d;border:1px solid #242631;border-radius:10px;padding:12px;max-height:300px;overflow:auto;white-space:pre-wrap;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;color:#cfd1da}
section{margin-top:38px}h2{font-size:22px}pre{background:#08090d;border:1px solid #242631;border-radius:12px;padding:16px;overflow:auto;color:#cfd1da}
@media(max-width:760px){.grid{grid-template-columns:1fr}.hero h1{font-size:36px}.links{display:none}}
</style></head><body>
<header><div class="wrap top"><div class="brand">panda.fun <span>API</span></div><div class="links"><a href="/openapi.yaml">OpenAPI</a><a href="/api/v1/health">Health</a></div></div></header>
<main class="wrap"><div class="hero"><div class="eyebrow">DEVELOPER DOCUMENTATION · V0.7.0</div><h1>Panda.fun API</h1><p>Interactive documentation for Panda.fun's media API. Every endpoint below can be tested directly from this page. Responses are shown exactly as returned by the API.</p></div>
<div class="toolbar"><button onclick="document.querySelectorAll('.result').forEach(x=>x.textContent='')">Clear responses</button><button onclick="window.open('/openapi.yaml','_blank')">View OpenAPI</button></div>
<div id="routes" class="grid"></div>
<section><h2>Response format</h2><pre>{"success":true,"data":{}}</pre><pre>{"success":false,"error":{"code":"INVALID_REQUEST","message":"...","requestId":"..."}}</pre></section>
<section><h2>Authentication</h2><p style="color:#a8aab5">If API authentication is enabled, add your X-API-Key in the request headers from your application. This browser documentation page does not persist or store keys.</p></section>
<section><h2>Attribution</h2><p style="color:#a8aab5">TVmaze data is licensed under CC BY-SA. Applications using TVmaze data should provide the required attribution and link-back.</p></section>
</main>
<script>
const routes=[
["GET","/api/v1/health","API health"],
["GET","/api/v1/version","API version"],
["GET","/api/v1/search?q=Breaking%20Bad","Search TV shows"],
["GET","/api/v1/tv/169","TV show details"],
["GET","/api/v1/tv/169/seasons","TV seasons"],
["GET","/api/v1/tv/169/season/1","Season episodes"],
["GET","/api/v1/tv/169/season/1/episode/1","Episode lookup"],
["GET","/api/v1/tmdb/search/movie?q=Inception","Search movies"],
["GET","/api/v1/tmdb/search/tv?q=Breaking%20Bad","Search TV"],
["GET","/api/v1/tmdb/movie/27205","Movie details"],
["GET","/api/v1/tmdb/tv/1396","TMDB TV details"],
["GET","/api/v1/trending","Trending"],
["GET","/api/v1/popular/movies","Popular movies"],
["GET","/api/v1/popular/tv","Popular TV"],
["GET","/api/v1/home","Panda.fun homepage aggregation"],
["GET","/api/v1/movie/27205/sources","Movie playback sources"],
["GET","/api/v1/movie/27205/play","Movie playback"],
["GET","/api/v1/tv/47199/season/1/episode/1/sources","TV episode playback sources"],
["GET","/api/v1/tv/47199/season/1/episode/1/play","TV episode playback"]
];
const root=document.getElementById("routes");
for(const [method,path,summary] of routes){
 const card=document.createElement("article"); card.className="route";
 const head=document.createElement("div"); head.className="route-head";
 const badge=document.createElement("span"); badge.className="method get"; badge.textContent=method;
 const p=document.createElement("code"); p.className="path"; p.textContent=path;
 head.append(badge,p); card.append(head);
 const desc=document.createElement("div"); desc.className="summary"; desc.textContent=summary; card.append(desc);
 const area=document.createElement("div"); area.className="try";
 const row=document.createElement("div"); row.className="row";
 const input=document.createElement("input"); input.value=path; input.setAttribute("aria-label","Endpoint");
 const btn=document.createElement("button"); btn.textContent="Try it";
 const result=document.createElement("pre"); result.className="result";
 btn.onclick=async()=>{result.textContent="Loading…";try{const r=await fetch(input.value);const t=await r.text();let body;try{body=JSON.stringify(JSON.parse(t),null,2)}catch{body=t}result.textContent=r.status+" "+r.statusText+"\n\n"+body}catch(e){result.textContent="Request failed: "+e}};
 row.append(input,btn); area.append(row,result); card.append(area); root.append(card);
}
</script></body></html>`));

  app.get("/openapi.yaml", (c) => {
    c.header("content-type", "application/yaml; charset=utf-8");
    return c.body(OPENAPI_YAML);
  });

  app.notFound((c) => errorResponse(c, "NOT_FOUND", "The requested route does not exist.", 404, c.get("requestId")));

  app.onError((error, c) => {
    log("error", "unhandled_error", {
      requestId: c.get("requestId"),
      error: error instanceof Error ? error.message : String(error)
    });
    return errorResponse(c, "INTERNAL_ERROR", "An unexpected error occurred.", 500, c.get("requestId"));
  });

  return app;
}
