# Movie Metadata

Phase 3 introduces TMDB as the movie metadata provider.

## Endpoint

- GET /api/v1/tmdb/movie/:id

The normalized movie model contains a stable MovieApi ID, title, original title, year, rating, poster, backdrop, overview, genres, runtime, release date, status, language, and TMDB provider ID.

TVmaze is not used as a movie metadata source.

## Future service layer

A later metadata service will expose provider-independent movie routes and can select TMDB as the current movie provider without exposing provider-specific URLs to Kinoma.
