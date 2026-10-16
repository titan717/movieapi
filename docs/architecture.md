# Architecture

## High-level flow

```
Panda.fun
  |
  v
MovieApi API
  |
  +--> Search / Metadata / Discovery / Trailers ----> TMDB
  |
  +--> Legacy TVmaze IDs ----------------------------> Internal playback resolution only
  |
  +--> Playback -------------------------------------> Vidy
  |
  +--> Cache / Reliability / Health
```

## Metadata authority

TMDB is the sole authority for public movie and TV metadata, including titles, synopses, ratings, release information, posters, backdrops, and episode stills. Public artwork URLs must use `https://image.tmdb.org/t/p/`.

Legacy TVmaze metadata and schedule routes are not mounted publicly. TVmaze remains available only inside playback resolution to translate historical TV IDs to TMDB IDs. Unified `/api/v1/search` searches TMDB movies and TV shows.

## Boundaries

Provider response formats must never leak into the public contract. Provider adapters own HTTP calls and parsing; the service layer owns normalization, identity mapping, caching, and response composition.

## Playback

Vidy remains the playback integration. Metadata-provider changes must not change playback URLs, IDs, or source-selection behavior.

## Phase discipline

Every externally observable behavior change must include regression tests and documentation in the same phase.
