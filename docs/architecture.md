# Architecture

## High-level flow

```
Kinoma
  |
  v
MovieApi API
  |
  v
Service Layer
  |
  +--> Metadata ----> Provider Manager ----> TVmaze primary
  |                                      \-> TMDB fallback
  |
  +--> Search
  +--> Discovery
  +--> Trailers
  +--> Playback ----> Provider Manager ----> VidSrc
  |
  +--> Cache
  +--> Health / Monitoring
```

## Boundaries

Kinoma consumes only MovieApi's normalized schemas. Provider response formats must never leak into the public Kinoma contract.

The provider layer owns HTTP calls, provider-specific parsing, and provider-specific identifiers.

The service layer owns business rules, normalization, fallback decisions, caching policy, and public response composition.

## Stable identity

MovieApi prefers an internal Kinoma ID with provider mappings:

```json
{
  "id": "kinoma_tmdb_tv_99966",
  "ids": {
    "tmdb": 99966
  }
}
```

## No cast or crew

Cast and crew are outside the MovieApi data contract.

## Phase discipline

New functionality must include its tests and documentation in the same phase.

## Public metadata authority

TMDB is authoritative for all public search, discovery, details, and artwork. Public image URLs must use `https://image.tmdb.org/t/p/`. TVmaze is retained only for internal legacy playback-ID resolution and its artwork is suppressed by the normalizers.
