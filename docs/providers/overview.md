# Providers

Providers are adapters behind a common interface.

## Metadata

### TVmaze

TVmaze is the Phase 2 primary metadata provider for TV content. The public API provides show search, show details, seasons, episodes, images, and schedules. The provider uses a descriptive User-Agent and validates every JSON response before normalization.

The public TVmaze API is rate limited and asks clients to handle HTTP 429 responses with backoff. MovieApi deliberately does not add retry logic in Phase 2; bounded retry/backoff belongs to the Phase 4 reliability layer.

TVmaze's public API is licensed under CC BY-SA and requires attribution. Panda.fun must include an appropriate TVmaze credit/link when using this provider.

### TMDB

TMDB is the Phase 3 fallback and enrichment provider. TVmaze remains primary for TV metadata; TMDB provides movie metadata and fills missing TV fields when a safe identity match is available.

## Playback

### VidCore

VidCore is the primary authorized direct-playback integration for Phase 9. MovieApi connects to a separately hosted VidCore resolver through its HTTP API, consumes the successful `play` HLS relay URL, and normalizes it into the common playback source schema. MovieApi does not duplicate the resolver implementation.

### VidSrc

VidSrc is the playback fallback. MovieApi uses its documented embed interface when VidCore is unavailable or does not return a usable source. It is not treated as a metadata authority and is isolated from the TVmaze metadata adapter.

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

Fallback is decided by the service/provider manager, not by Panda.fun.

Fallback reasons include:

- TIMEOUT
- HTTP_ERROR
- RATE_LIMIT
- INVALID_RESPONSE
- MISSING_FIELD
- NOT_FOUND
- PROVIDER_UNAVAILABLE
