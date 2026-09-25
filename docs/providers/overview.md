# Providers

Providers are adapters behind a common interface.

## Metadata

### TVmaze
Primary metadata provider.

### TMDB
Fallback and field-level enrichment provider.

## Playback

### VidSrc
Playback provider. It is not treated as a metadata authority.

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
