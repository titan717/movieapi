# API Overview

## Phase 1

- GET /api/v1/health
- GET /api/v1/version
- GET /docs
- GET /openapi.yaml

## Phase 2 — TVmaze provider

### Search

- GET /api/v1/search?q=...
- GET /api/v1/tv/search?q=...

TVmaze search results are fuzzy and are paginated locally after the provider response. TVmaze documents its public search as fuzzy and relevance ordered.

### TV show

- GET /api/v1/tv/:id
- GET /api/v1/tv/:id/seasons
- GET /api/v1/tv/:id/episodes
- GET /api/v1/tv/:id/season/:season
- GET /api/v1/tv/:id/season/:season/episode/:episode
- GET /api/v1/tv/:id/images

### Airing

- GET /api/v1/airing?country=US&date=YYYY-MM-DD
- GET /api/v1/airing/today
- GET /api/v1/airing/date/:date

## Middleware

- Request IDs through X-Request-ID
- CORS
- API-key authentication foundation
- Bounded per-instance rate limiting
- Standardized JSON errors
- Structured JSON logging
- Runtime environment validation

## Provider boundary

TVmaze responses are schema-validated and normalized before reaching Kinoma. Cast and crew are intentionally excluded from the public MovieApi contract.

Caching, retries, circuit breakers, TMDB fallback, discovery aggregation, trailers, and playback are implemented in later phases.
