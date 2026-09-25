import { createMiddleware } from "hono/factory";

type Variables = { requestId: string };

export const requestId = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const incoming = c.req.header("x-request-id")?.trim();
  const id = incoming || crypto.randomUUID();
  c.set("requestId", id);
  c.header("x-request-id", id);
  await next();
});
