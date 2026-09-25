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
  "id": "kinoma_8f92a1",
  "ids": {
    "tvmaze": 12345,
    "tmdb": 99966,
    "imdb": "tt1234567"
  }
}
```

## No cast or crew

Cast and crew are outside the MovieApi data contract.

## Phase discipline

New functionality must include its tests and documentation in the same phase.
