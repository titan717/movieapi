# API Overview

## Phase 1

- GET /api/v1/health
- GET /api/v1/version
- GET /docs
- GET /openapi.yaml

## Phase 2 — TVmaze primary provider

- GET /api/v1/search?q=...
- GET /api/v1/tv/search?q=...
- GET /api/v1/tv/:id
- GET /api/v1/tv/:id/seasons
- GET /api/v1/tv/:id/episodes
- GET /api/v1/tv/:id/season/:season
- GET /api/v1/tv/:id/season/:season/episode/:episode
- GET /api/v1/tv/:id/images
- GET /api/v1/airing?country=US&date=YYYY-MM-DD
- GET /api/v1/airing/today
- GET /api/v1/airing/date/:date

## Phase 3 — TMDB fallback/enrichment

- GET /api/v1/tmdb/tv/:id
- GET /api/v1/tmdb/movie/:id
- GET /api/v1/tmdb/search/tv?q=...
- GET /api/v1/tmdb/search/movie?q=...

TV detail requests remain TVmaze-first. When TMDB is configured and required normalized fields are missing, MovieApi attempts an identity match and fills only missing fields. Valid TVmaze fields are retained.

TMDB also provides the movie metadata foundation because TVmaze is not the movie metadata source.

## Phase 4 — Reliability\n\n- Provider response caching with stale-while-revalidate\n- Bounded retries with exponential backoff and jitter\n- Provider circuit breakers and health snapshots\n\n## Phase 5 — Discovery\n\n- Popular/latest/upcoming movies and TV\n- Trending and featured media\n- Genre lists and genre discovery\n- Recommendations\n- Airing today and upcoming airing\n- Kinoma homepage aggregation\n\n## Middleware

- Request IDs through X-Request-ID
- CORS
- API-key authentication foundation
- Bounded per-instance rate limiting
- Standardized JSON errors
- Structured JSON logging
- Runtime environment validation

Phase 4 adds caching, retries, circuit breakers, and provider health. Phase 5 adds provider-independent discovery aggregation. Trailers and playback remain later phases.
