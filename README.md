# MovieApi

MovieApi is the backend service layer for Kinoma, providing a stable, normalized API for movie and TV metadata, discovery, trailers, and playback-provider integration.

## Status

**Phase 5 — discovery aggregation implemented; runtime/deployment verification pending.**

Phase 4 adds bounded provider caching, stale-cache refresh, retries with jitter, circuit breakers, and provider health telemetry. Phase 5 adds provider-independent discovery aggregation, pagination, genres, recommendations, trending, airing, and a Kinoma-oriented home response.

The foundation includes request tracing, CORS, API-key authentication, rate limiting, standardized errors, health/version endpoints, tests, and live documentation. Phase 2 adds schema-validated TVmaze TV metadata, search, seasons, episodes, images, and airing schedules. Phase 3 adds server-side TMDB fallback/enrichment, movie metadata, search, and external-ID matching.

## Quick start

    npm install
    npm run dev

Then visit:

- http://localhost:3000/api/v1/health
- http://localhost:3000/api/v1/version
- http://localhost:3000/docs
- http://localhost:3000/openapi.yaml

Run verification:

    npm run check

## Architecture

    Kinoma
      |
      v
    MovieApi API (/api/v1)
      |
      v
    Service Layer
      +-- Metadata -> TVmaze primary -> TMDB fallback
      +-- Search
      +-- Discovery
      +-- Trailers
      +-- Playback -> VidSrc provider
      |
      v
    Cache / Reliability / Health / Monitoring

Kinoma consumes MovieApi's normalized schemas and does not depend directly on provider response formats.

## Phase discipline

A phase is not considered complete until its implementation, tests, documentation, OpenAPI contract, CI, and deployment path have been checked. Documentation and OpenAPI are updated alongside implementation.

## Documentation

- Architecture: docs/architecture.md
- API Overview: docs/api-overview.md
- Providers: docs/providers/overview.md
- Metadata: docs/metadata/movies.md
- TV Metadata: docs/metadata/tv.md
- TMDB Provider: docs/providers/tmdb.md
- Search: docs/search.md
- Discovery: docs/discovery.md
- Trailers: docs/trailers.md
- Playback: docs/playback.md
- Caching: docs/caching.md
- Reliability: docs/reliability.md
- Errors: docs/errors.md
- Authentication: docs/authentication.md
- Rate Limiting: docs/rate-limiting.md
- Monitoring: docs/monitoring.md
- Testing: docs/testing.md
- Deployment: docs/deployment.md
- Changelog: docs/changelog.md
- OpenAPI: openapi/openapi.yaml

## Provider strategy

- TVmaze: primary metadata provider.
- TMDB: fallback and field-level metadata enrichment.
- VidSrc: separate playback provider.

Provider adapters remain replaceable so additional authorized providers can be added later.

## Safety boundary

MovieApi will use documented or authorized provider interfaces where available. It will not bypass DRM, authentication, CAPTCHA, access controls, protected keys, or other technical restrictions.
