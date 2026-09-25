# TMDB Provider

TMDB is the Phase 3 fallback/enrichment provider.

## Authentication

MovieApi uses the server-side TMDB API Read Access Token as a Bearer token. The token is configured through `MOVIEAPI_TMDB_ACCESS_TOKEN` and is never returned to Kinoma or written to logs.

## Responsibilities

- Field-level fallback for TVmaze records
- Whole-record TV fallback when a future service layer needs it
- Movie metadata
- TV/movie search
- Provider ID matching through TMDB external-ID lookup
- Normalized TMDB metadata

## Fallback rules

1. TVmaze remains primary for TV.
2. TMDB is contacted only when TMDB is configured and a required TVmaze field is missing.
3. IMDb external ID is preferred for matching.
4. If IMDb matching is unavailable, a title/year match is attempted.
5. Valid TVmaze fields are never overwritten by TMDB.
6. Fallback failures do not make an otherwise valid TVmaze response fail.

TMDB's API supports text search and external-ID lookup, which is why the provider uses both strategies.

## Attribution

TMDB requires attribution for API use. Kinoma should include the required TMDB notice/logo in its About/Credits area before production release.
