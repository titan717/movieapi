import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadConfig, type Config } from "./config.js";
import { errorResponse } from "./errors.js";
import { requestId } from "./middleware/request-id.js";
import { authMiddleware } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { log } from "./logger.js";

type AppEnv = { Variables: { requestId: string } };

const OPENAPI_YAML = [
  "openapi: 3.1.0",
  "info:",
  "  title: MovieApi",
  "  version: 0.1.0",
  "  description: Phase 1 API Foundation for Kinoma.",
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
  "          description: Version information"
].join("\n") + "\n";

export function createApp(config: Config = loadConfig()) {
  const app = new Hono<AppEnv>();

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
    data: { name: "MovieApi", version: "0.1.0", status: "foundation" }
  }));

  app.get("/api/v1/health", (c) => c.json({
    success: true,
    data: {
      status: "healthy",
      service: "movieapi",
      version: "0.1.0",
      timestamp: new Date().toISOString()
    }
  }));

  app.get("/api/v1/version", (c) => c.json({
    success: true,
    data: { version: "0.1.0", apiVersion: "v1", phase: 1 }
  }));

  app.get("/docs", (c) => c.html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MovieApi Docs</title>
<style>body{font-family:system-ui,sans-serif;max-width:960px;margin:40px auto;padding:0 20px;line-height:1.6;color:#18202a}code,pre{background:#f4f5f7;border-radius:8px}code{padding:2px 5px}pre{padding:16px;overflow:auto}.route{border:1px solid #dfe3e8;border-radius:12px;padding:16px;margin:12px 0}</style>
</head><body><h1>MovieApi</h1><p>Phase 1 API Foundation · v0.1.0</p>
<p><a href="/openapi.yaml">OpenAPI specification</a></p>
<div class="route"><strong>GET /api/v1/health</strong><br>Service health.</div>
<div class="route"><strong>GET /api/v1/version</strong><br>API and service version.</div>
<h2>Authentication</h2><p>When enabled, send <code>X-API-Key</code>.</p>
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
