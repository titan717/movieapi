# Providers

Providers are adapters behind a common interface.

## Metadata

### TMDB

TMDB is the sole public metadata and artwork authority for search, discovery, movie and TV details, seasons, episodes, posters, backdrops, and episode stills. Public image URLs use TMDB's image CDN. MovieApi normalizes TMDB responses before exposing them to Panda.fun.

### TVmaze compatibility

TVmaze is retained only as an internal compatibility adapter for resolving legacy TVmaze IDs to TMDB IDs for playback. Legacy normalizers deliberately suppress TVmaze image URLs; TVmaze is not a public artwork source. New clients should use the unified `/api/v1/search`, `/api/v1/tmdb/*`, and `/api/v1/details/*` routes.

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
