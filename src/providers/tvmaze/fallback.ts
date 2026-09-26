import type { TmdbClient } from "../tmdb/client.js";
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

const fallbackFields = [
  "overview",
  "poster",
  "backdrop",
  "rating",
  "runtime",
  "releaseDate",
  "status",
  "language",
  "genres"
] as const;

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

export function missingFallbackFields(show: ReturnType<typeof normalizeShow>) {
  return fallbackFields.filter((field) => {
    const value = show[field];
    return !hasValue(value) || (Array.isArray(value) && value.length === 0);
  });
}

function titleKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function yearOf(value: string | null | undefined) {
  return value ? Number(value.slice(0, 4)) || null : null;
}

export async function findMatchingTmdbTv(show: TvmazeShow, client: TmdbClient): Promise<TmdbTvDetails | null> {
  if (!client.enabled) return null;

  // IMDb is the strongest cross-provider identifier, but a failed /find lookup
  // must not prevent the title-based fallback. Some TVMaze shows have an IMDb
  // ID that TMDB does not know about.
  if (show.externals?.imdb) {
    try {
      const found = await client.findByExternalId(show.externals.imdb);
      if (found.tv_results?.[0]) return await client.getTv(found.tv_results[0].id);
    } catch {
      // Continue with TMDB title search below.
    }
  }

  const search = await client.searchTv(show.name, 1);
  const tvmazeYear = yearOf(show.premiered);
  const exact = search.results.find((candidate) => {
    const sameTitle = titleKey(candidate.name) === titleKey(show.name) ||
      titleKey(candidate.original_name ?? "") === titleKey(show.name);
    const candidateYear = yearOf(candidate.first_air_date);
    return sameTitle && (!tvmazeYear || !candidateYear || tvmazeYear === candidateYear);
  });

  if (!exact) return null;
  return client.getTv(exact.id);
}

export function mergeTvmazeWithTmdb(show: TvmazeShow, tmdb: TmdbTvDetails) {
  const primary = normalizeShow(show);
  const fallback = normalizeTmdbTv(tmdb);
  const data = { ...primary, ids: { ...primary.ids, tmdb: tmdb.id } };

  for (const field of fallbackFields) {
    const primaryValue = data[field];
    const fallbackValue = fallback[field];
    if ((!hasValue(primaryValue) || (Array.isArray(primaryValue) && primaryValue.length === 0)) && hasValue(fallbackValue)) {
      (data as Record<string, unknown>)[field] = fallbackValue;
    }
  }

  return data;
}
