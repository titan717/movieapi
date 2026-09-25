import { createMiddleware } from "hono/factory";

export const requestId = createMiddleware(async (c, next) => {
  const incoming = c.req.header("x-request-id")?.trim();
  const id = incoming || crypto.randomUUID();
  c.set("requestId", id);
  c.header("x-request-id", id);
  await next();
});
