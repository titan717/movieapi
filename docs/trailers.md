# Videos & trailers

Phase 6 provides normalized TMDB video metadata for movies, TV series, and TV episodes.

## Endpoints

- GET /api/v1/movie/:id/videos
- GET /api/v1/tv/:id/videos
- GET /api/v1/tv/:id/season/:season/episode/:episode/videos

A trailer is metadata for a promotional video, not a playback source.

## Normalization

Each video exposes its provider ID, name, type, provider site/key, URL when supported, embed URL when supported, thumbnail when available, official flag, publication timestamp, and language/country.

YouTube URLs and thumbnails are generated only when TMDB identifies the site as YouTube. Other providers remain provider-neutral.

The primary trailer prefers official trailers and then the most recently published trailer.

## Reliability

Video requests use the same bounded cache, retry, circuit-breaker and provider-health mechanisms as metadata providers.

## Scope

This phase does not implement media playback, DRM handling, source scraping, or protected-player access. Playback is a later phase.
