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

## Phase 4 — Reliability

- Provider response caching with stale-while-revalidate
- Bounded retries with exponential backoff and jitter
- Provider circuit breakers and health snapshots

## Phase 5 — Discovery

- Popular/latest/upcoming movies and TV
- Trending and featured media
- Genre lists and genre discovery
- Recommendations
- Airing today and upcoming airing
- Kinoma homepage aggregation

## Middleware

- Request IDs through X-Request-ID
- CORS
- API-key authentication foundation
- Bounded per-instance rate limiting
- Standardized JSON errors
- Structured JSON logging
- Runtime environment validation

## Phase 6 — Videos and trailers

- GET /api/v1/movie/:id/videos
- GET /api/v1/tv/:id/videos
- GET /api/v1/tv/:id/season/:season/episode/:episode/videos

Video metadata is separate from playback. TMDB video responses are normalized without exposing provider-specific internals.

## Phase 7 — Playback

- GET /api/v1/movie/:id/sources
- GET /api/v1/movie/:id/play
- GET /api/v1/tv/:id/season/:season/episode/:episode/sources
- GET /api/v1/tv/:id/season/:season/episode/:episode/play

Playback uses a provider-neutral source contract. The initial VidSrc adapter returns documented client-side embed URLs; MovieApi does not scrape player HTML or proxy protected media streams. Source URLs are intentionally not cached as long-lived media objects.

## Middleware

- Request IDs through X-Request-ID
- CORS
- API-key authentication foundation
- Bounded per-instance rate limiting
- Standardized JSON errors
- Structured JSON logging
- Runtime environment validation

Phase 7 establishes the playback adapter boundary. Direct media proxying, DRM handling, protected-key extraction, and access-control bypasses are intentionally outside the API.