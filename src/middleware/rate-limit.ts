import { createMiddleware } from "hono/factory";
import { errorResponse } from "../errors.js";
import type { Config } from "../config.js";

type Bucket = { count: number; resetAt: number };

export function rateLimitMiddleware(config: Config) {
  const buckets = new Map<string, Bucket>();

  return createMiddleware(async (c, next) => {
    const now = Date.now();
    const key = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const current = buckets.get(key);

    if (!current || now >= current.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + config.rateWindowMs });
    } else {
      current.count += 1;
      if (current.count > config.rateLimit) {
        c.header("retry-after", String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
        return errorResponse(c, "RATE_LIMITED", "Too many requests. Please retry later.", 429, c.get("requestId"));
      }
    }
    await next();
  });
}
