import { z } from "zod";

const envSchema = z.object({
  MOVIEAPI_API_KEYS: z.string().optional().default(""),
  MOVIEAPI_AUTH_REQUIRED: z.string().optional().default("false").transform((v) => v.toLowerCase() === "true"),
  MOVIEAPI_RATE_LIMIT: z.coerce.number().int().positive().default(120),
  MOVIEAPI_RATE_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  MOVIEAPI_TVMAZE_BASE_URL: z.string().url().default("https://api.tvmaze.com"),
  MOVIEAPI_TVMAZE_USER_AGENT: z.string().min(1).default("MovieApi/0.7.0 (Kinoma)"),
  MOVIEAPI_TVMAZE_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(8_000),
  MOVIEAPI_TMDB_ACCESS_TOKEN: z.string().optional().default(""),
  MOVIEAPI_TMDB_BASE_URL: z.string().url().default("https://api.themoviedb.org/3"),
  MOVIEAPI_TMDB_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(8_000),
  MOVIEAPI_VIDSRC_BASE_URL: z.string().url().default("https://vidsrc.sh"),
  MOVIEAPI_CORS_ORIGIN: z.string().min(1).default("*"),
  PORT: z.coerce.number().int().positive().default(3000)
});

export type Config = {
  apiKeys: Set<string>;
  authRequired: boolean;
  rateLimit: number;
  rateWindowMs: number;
  tvmaze: {
    baseUrl: string;
    userAgent: string;
    timeoutMs: number;
  };
  tmdb: {
    accessToken?: string;
    baseUrl: string;
    timeoutMs: number;
  };
  vidsrc: {
    baseUrl?: string;
  };
  corsOrigin: string;
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
    tvmaze: {
      baseUrl: parsed.MOVIEAPI_TVMAZE_BASE_URL,
      userAgent: parsed.MOVIEAPI_TVMAZE_USER_AGENT,
      timeoutMs: parsed.MOVIEAPI_TVMAZE_TIMEOUT_MS
    },
    tmdb: {
      accessToken: parsed.MOVIEAPI_TMDB_ACCESS_TOKEN || undefined,
      baseUrl: parsed.MOVIEAPI_TMDB_BASE_URL,
      timeoutMs: parsed.MOVIEAPI_TMDB_TIMEOUT_MS
    },
    vidsrc: { baseUrl: parsed.MOVIEAPI_VIDSRC_BASE_URL },
    corsOrigin: parsed.MOVIEAPI_CORS_ORIGIN,
    port: parsed.PORT
  };
}
