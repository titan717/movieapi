import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";

const base: Config = {
  apiKeys: new Set(["test-key"]),
  authRequired: false,
  rateLimit: 100,
  rateWindowMs: 60_000,
  port: 3000
};

describe("MovieApi Phase 1", () => {
  it("returns health with request id", async () => {
    const response = await createApp(base).request("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("healthy");
  });

  it("returns version", async () => {
    const response = await createApp(base).request("/api/v1/version");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.apiVersion).toBe("v1");
    expect(body.data.phase).toBe(1);
  });

  it("serves docs and OpenAPI", async () => {
    const app = createApp(base);
    expect((await app.request("/docs")).status).toBe(200);
    const openapi = await app.request("/openapi.yaml");
    expect(openapi.status).toBe(200);
    expect(await openapi.text()).toContain("openapi: 3.1.0");
  });

  it("returns standardized 404", async () => {
    const response = await createApp(base).request("/api/v1/missing");
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.requestId).toBeTruthy();
  });

  it("enforces API keys when enabled", async () => {
    const app = createApp({ ...base, authRequired: true });
    expect((await app.request("/api/v1/health")).status).toBe(401);
    expect((await app.request("/api/v1/health", { headers: { "x-api-key": "test-key" } })).status).toBe(200);
  });

  it("rate limits requests", async () => {
    const app = createApp({ ...base, rateLimit: 1 });
    expect((await app.request("/api/v1/health")).status).toBe(200);
    expect((await app.request("/api/v1/health")).status).toBe(429);
  });
});
