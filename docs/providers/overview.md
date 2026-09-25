# Providers

Providers are adapters behind a common interface.

## Metadata

### TVmaze

TVmaze is the Phase 2 primary metadata provider for TV content. The public API provides show search, show details, seasons, episodes, images, and schedules. The provider uses a descriptive User-Agent and validates every JSON response before normalization.

The public TVmaze API is rate limited and asks clients to handle HTTP 429 responses with backoff. MovieApi deliberately does not add retry logic in Phase 2; bounded retry/backoff belongs to the Phase 4 reliability layer.

TVmaze's public API is licensed under CC BY-SA and requires attribution. Kinoma must include an appropriate TVmaze credit/link when using this provider.

### TMDB

TMDB is the planned Phase 3 fallback and field-level enrichment provider.

## Playback

### VidSrc

VidSrc is the planned playback provider. It is not treated as a metadata authority and is isolated from the TVmaze metadata adapter.

## Provider rules

A provider adapter must:

1. Validate configuration.
2. Make bounded requests.
3. Normalize provider errors.
4. Validate external responses.
5. Return typed internal data.
6. Never expose secrets in logs.
7. Remain replaceable without changing the public API.

## Fallback

Fallback is decided by the service/provider manager, not by Kinoma.

Fallback reasons include:

- TIMEOUT
- HTTP_ERROR
- RATE_LIMIT
- INVALID_RESPONSE
- MISSING_FIELD
- NOT_FOUND
- PROVIDER_UNAVAILABLE
