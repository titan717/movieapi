import type { TmdbTvDetails } from "../tmdb/schemas.js";
import { normalizeTmdbTv } from "../tmdb/normalizer.js";
import type { TvmazeShow } from "./schemas.js";
import { normalizeShow } from "./normalizer.js";

export type FallbackReason =
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "RATE_LIMIT"
  | "INVALID_RESPONSE"
  | "MISSING_FIELD"
  | "NOT_FOUND"
  | "PROVIDER_UNAVAILABLE";

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

export function mergeTvmazeWithTmdb(show: TvmazeShow, tmdb: TmdbTvDetails) {
  const primary = normalizeShow(show);
  const fallback = normalizeTmdbTv(tmdb);
  const fields = ["overview", "poster", "backdrop", "rating", "runtime", "releaseDate", "status", "language", "genres"] as const;
  const data = { ...primary };

  for (const field of fields) {
    if (!hasValue(data[field]) || (Array.isArray(data[field]) && data[field].length === 0)) {
      data[field] = fallback[field];
    }
  }

  data.ids = {
    ...data.ids,
    tmdb: tmdb.id
  };

  return data;
}
