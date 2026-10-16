# Search

## Unified search

`GET /api/v1/search?q={query}&page=1&limit=20` searches TMDB movies and TV shows together. Every result is normalized with explicit media type, TMDB identity, and TMDB CDN artwork. The response includes `source: "tmdb"` and pagination metadata.

## Type-specific search

- `GET /api/v1/tmdb/search/movie?q={query}`
- `GET /api/v1/tmdb/search/tv?q={query}`

Use type-specific search when the UI already knows which media type it needs.

## Artwork contract

Search posters and backdrops must be either TMDB image CDN URLs or `null`. Responses must never contain `static.tvmaze.com` URLs. If TMDB is not configured or unavailable, search returns a provider error rather than falling back to TVmaze.
