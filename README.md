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

## VidCore integration

MovieAPI connects to a separately hosted VidCore resolver through its documented `/api/resolve` HTTP interface. MovieAPI consumes the resolver's browser-facing `play` HLS relay URL and does not duplicate the resolver implementation.

Configuration:



The resolver should run as a persistent Node service rather than as a MovieAPI/Vercel function. Keep its HLS proxy endpoint reachable by Panda.fun when direct browser playback requires it.

## Safety boundary

MovieApi will use documented or authorized provider interfaces where available. It will not bypass DRM, authentication, CAPTCHA, access controls, protected keys, or other technical restrictions.
