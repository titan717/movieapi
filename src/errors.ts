import type { Context } from "hono";

export function errorResponse(c: Context, code: string, message: string, status: number, requestId: string) {
  return c.json({ success: false, error: { code, message, requestId } },
    status as 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 500 | 502 | 503 | 504);
}
