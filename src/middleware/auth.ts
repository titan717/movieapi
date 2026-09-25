import { createMiddleware } from "hono/factory";
import { errorResponse } from "../errors.js";
import type { Config } from "../config.js";

export function authMiddleware(config: Config) {
  return createMiddleware(async (c, next) => {
    if (!config.authRequired) return next();
    const key = c.req.header("x-api-key");
    if (!key || !config.apiKeys.has(key)) {
      return errorResponse(c, "UNAUTHORIZED", "A valid API key is required.", 401, c.get("requestId"));
    }
    await next();
  });
}
