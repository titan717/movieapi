# MovieApi

MovieApi is the backend service layer for Kinoma, providing a stable, normalized API for movie and TV metadata, discovery, trailers, and playback-provider integration.

## Status

**Phase 1 — API Foundation implemented.**

The foundation includes request tracing, CORS, API-key authentication, rate limiting, standardized errors, health/version endpoints, tests, and live documentation.

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

Every phase is implemented, tested, documented, and verified before the next phase begins. Documentation and OpenAPI are updated alongside implementation.

## Documentation

- Architecture: docs/architecture.md
- API Overview: docs/api-overview.md
- Providers: docs/providers/overview.md
- Metadata: docs/metadata/movies.md
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
