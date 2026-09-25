# MovieApi — Getting Started

MovieApi is the backend service layer for Kinoma. It normalizes media metadata and playback-provider integrations behind a stable, versioned API.

## Current status

Phase 4 — Caching, bounded retries, circuit breaking, provider health, and stale-while-revalidate are implemented in the provider clients.

Phase 5 — discovery/aggregation layer implemented; Phase 6 will add videos/trailers.

## Planned stack

- Node.js
- TypeScript
- Vercel-compatible HTTP runtime
- Schema validation
- OpenAPI
- Automated tests

The concrete runtime is Node.js + TypeScript + Hono, with a Vercel-compatible Hono entrypoint.

## Development rule

Each phase must be implemented, tested, documented, and verified before the next phase begins.

## Provider order

1. TVmaze — primary metadata provider
2. TMDB — fallback/enrichment provider
3. VidSrc — playback provider

Provider-specific behavior is isolated behind adapters.

## API version

Public endpoints use:

`/api/v1`

## Documentation

The `docs/` directory describes architecture, provider behavior, data contracts, reliability, and operational rules. The OpenAPI specification in `openapi/openapi.yaml` is the public API contract.
