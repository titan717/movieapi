# MovieApi

MovieApi is the backend service layer for Panda.fun, providing a stable, normalized API for movie and TV metadata, discovery, trailers, and playback-provider integration.


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

    Panda.fun
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
      +-- Playback
      |
      v
    Cache / Reliability / Health / Monitoring





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


- TMDB: primary metadata provider.

Provider adapters remain replaceable so additional authorized providers can be added later.

## Playback sources

Playback uses a small source registry (`src/panda/service.ts`): CineSrc (`cinesrc.st`) and Vidy (`www.vidy.st`), both documented TMDB-id embed players. `GET /api/v1/panda/play/:type/:id` builds the embed URLs (no network) and `GET /api/v1/panda/sources/health` probes each provider (cached 5 minutes).

`GET /api/v1/panda/wall` returns up to 120 unique trending posters (TMDB `w185`, cached 1 hour) for the Panda "Who's watching" poster wall.

## Deployment

MovieAPI runs on Vercel (`vercel.json`, `index.ts`); the production deployment is `https://apikinoma.vercel.app/api/v1`. CORS defaults to `*` (`MOVIEAPI_CORS_ORIGIN`), which covers the Panda.fun web app and the Android WebView origin `https://appassets.androidplatform.net`.

## Safety boundary

MovieApi will use documented or authorized provider interfaces where available. It will not bypass DRM, authentication, CAPTCHA, access controls, protected keys, or other technical restrictions.
