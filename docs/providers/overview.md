# Providers

Providers are adapters behind a common interface.

## Public metadata and artwork: TMDB

TMDB is the sole source of public movie and TV metadata and artwork. Search, details, discovery, trailers, posters, backdrops, season posters, and episode stills must be normalized from TMDB. Public image URLs use the TMDB image CDN: `https://image.tmdb.org/t/p/{size}{path}`.

The unified `/api/v1/search` endpoint searches movies and TV shows through TMDB. TMDB-specific search endpoints remain available for callers that need a single media type.

## Legacy TVmaze compatibility

TVmaze remains only for legacy schedule/episode compatibility and mapping older TVmaze IDs to TMDB IDs. It is not a public artwork source. Normalized legacy responses must set image fields to `null` unless the artwork has been resolved from TMDB. Legacy TVmaze metadata and image endpoints are not mounted publicly; callers should use the TMDB-specific or canonical details routes.

Do not silently fall back to TVmaze posters, stills, or backdrops when TMDB is unavailable. Return a normalized provider error or a missing-record response instead.

## Playback: Vidy

Vidy remains the playback integration. Metadata-source changes must not alter Vidy embed paths or playback behavior.

## Provider rules

A provider adapter must:

1. Validate configuration.
2. Make bounded requests.
3. Normalize provider errors.
4. Validate external responses.
5. Return typed internal data.
6. Never expose secrets in logs.
7. Remain replaceable without changing the public API.
