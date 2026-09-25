import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadConfig, type Config } from "./config.js";
import { errorResponse } from "./errors.js";
import { requestId } from "./middleware/request-id.js";
import { authMiddleware } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { log } from "./logger.js";
import { TvmazeClient, createTvmazeRoutes, createTvmazeScheduleRoutes } from "./providers/tvmaze/index.js";

type AppEnv = { Variables: { requestId: string } };

const OPENAPI_YAML = [
  "openapi: 3.1.0",
  "info:",
  "  title: MovieApi",
  "  version: 0.2.0",
  "  description: Phase 2 TVmaze metadata provider for Kinoma.",
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
  "          description: Airing episodes for the date"
].join("\n") + "\n";

export function createApp(config: Config = loadConfig()) {
  const app = new Hono<AppEnv>();
  const tvmaze = new TvmazeClient(config.tvmaze);

  app.use("*", requestId);
  app.use("*", cors({
    origin: "*",
    allowHeaders: ["Content-Type", "X-API-Key", "X-Request-ID"],
    exposeHeaders: ["X-Request-ID", "Retry-After"]
  }));
  app.use("*", rateLimitMiddleware(config));
  app.use("/api/v1/*", authMiddleware(config));

  app.get("/", (c) => c.json({
    success: true,
    data: { name: "MovieApi", version: "0.2.0", status: "tvmaze-provider" }
  }));

  app.get("/api/v1/health", (c) => c.json({
    success: true,
    data: {
      status: "healthy",
      service: "movieapi",
      version: "0.2.0",
      timestamp: new Date().toISOString(),
      providers: { tvmaze: "configured" }
    }
  }));

  app.get("/api/v1/version", (c) => c.json({
    success: true,
    data: { version: "0.2.0", apiVersion: "v1", phase: 2 }
  }));

  app.route("/api/v1/tv", createTvmazeRoutes(tvmaze));
  app.route("/api/v1/airing", createTvmazeScheduleRoutes(tvmaze));

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
            id: `kinoma_tvmaze_${match.show.id}`,
            type: "tv",
            title: match.show.name,
            source: "tvmaze"
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
      if (error instanceof Error && "kind" in error) {
        const kind = (error as { kind: string }).kind;
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
<title>MovieApi Docs</title>
<style>body{font-family:system-ui,sans-serif;max-width:960px;margin:40px auto;padding:0 20px;line-height:1.6;color:#18202a}code,pre{background:#f4f5f7;border-radius:8px}code{padding:2px 5px}pre{padding:16px;overflow:auto}.route{border:1px solid #dfe3e8;border-radius:12px;padding:16px;margin:12px 0}a{color:#135cc8}</style>
</head><body><h1>MovieApi</h1><p>Phase 2 TVmaze provider · v0.2.0</p>
<p><a href="/openapi.yaml">OpenAPI specification</a></p>
<div class="route"><strong>GET /api/v1/search?q=...</strong><br>Search normalized TV results.</div>
<div class="route"><strong>GET /api/v1/tv/:id</strong><br>Show metadata.</div>
<div class="route"><strong>GET /api/v1/tv/:id/seasons</strong><br>Season list.</div>
<div class="route"><strong>GET /api/v1/tv/:id/episodes</strong><br>Paginated episode list.</div>
<div class="route"><strong>GET /api/v1/tv/:id/season/:season</strong><br>Season episodes.</div>
<div class="route"><strong>GET /api/v1/tv/:id/season/:season/episode/:episode</strong><br>Episode lookup.</div>
<div class="route"><strong>GET /api/v1/airing?country=US&amp;date=YYYY-MM-DD</strong><br>Country/date schedule.</div>
<div class="route"><strong>GET /api/v1/airing/today</strong><br>Today's schedule.</div>
<h2>Authentication</h2><p>When enabled, send <code>X-API-Key</code>.</p>
<h2>Attribution</h2><p>TVmaze data is licensed under CC BY-SA. Kinoma must provide TVmaze attribution/link-back when using the public TVmaze API.</p>
<h2>Success</h2><pre>{"success":true,"data":{}}</pre>
<h2>Error</h2><pre>{"success":false,"error":{"code":"INVALID_REQUEST","message":"...","requestId":"..."}}</pre>
</body></html>`));

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
