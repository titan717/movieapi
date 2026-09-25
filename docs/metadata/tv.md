# TV Metadata

Phase 2 uses TVmaze as the primary TV metadata provider.

## Endpoints

- GET /api/v1/tv/:id
- GET /api/v1/tv/:id/seasons
- GET /api/v1/tv/:id/episodes
- GET /api/v1/tv/:id/season/:season
- GET /api/v1/tv/:id/season/:season/episode/:episode
- GET /api/v1/tv/:id/images

## Normalized identity

TV content receives a stable MovieApi identifier: `kinoma_tvmaze_<tvmazeId>`.

Provider IDs remain available under `ids` so later TMDB fallback can match the same title without exposing provider response shapes.

## Normalized model

The normalized TV response contains id, type, title, year, rating, poster, backdrop, overview, genres, runtime, releaseDate, status, language, schedule, network/webChannel, ids, and source.

TVmaze's main show image is treated as poster artwork. A separate backdrop is not fabricated when the provider does not supply one.

## Scope

The public contract intentionally excludes cast and crew. Trailers/videos are handled in a later phase.

TVmaze provides show, season, episode, image, and schedule data through its public REST API. The provider client validates responses before normalization.
