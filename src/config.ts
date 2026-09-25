import { z } from "zod";

const envSchema = z.object({
  MOVIEAPI_API_KEYS: z.string().optional().default(""),
  MOVIEAPI_AUTH_REQUIRED: z.string().optional().default("false").transform((v) => v.toLowerCase() === "true"),
  MOVIEAPI_RATE_LIMIT: z.coerce.number().int().positive().default(120),
  MOVIEAPI_RATE_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  PORT: z.coerce.number().int().positive().default(3000)
});

export type Config = {
  apiKeys: Set<string>;
  authRequired: boolean;
  rateLimit: number;
  rateWindowMs: number;
  port: number;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.parse(env);
  const apiKeys = new Set(parsed.MOVIEAPI_API_KEYS.split(",").map((v) => v.trim()).filter(Boolean));

  if (parsed.MOVIEAPI_AUTH_REQUIRED && apiKeys.size === 0) {
    throw new Error("MOVIEAPI_AUTH_REQUIRED=true requires at least one API key");
  }

  return {
    apiKeys,
    authRequired: parsed.MOVIEAPI_AUTH_REQUIRED,
    rateLimit: parsed.MOVIEAPI_RATE_LIMIT,
    rateWindowMs: parsed.MOVIEAPI_RATE_WINDOW_MS,
    port: parsed.PORT
  };
}
