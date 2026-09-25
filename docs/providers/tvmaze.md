# TVmaze Provider

TVmaze is the primary metadata provider for MovieApi.

## Intended responsibilities

- Search
- Show metadata
- Seasons
- Episodes
- Episode images
- Show images
- Ratings
- Schedules
- Airing information
- Provider update synchronization

## Fallback rule

If TVmaze cannot provide an entire record, TMDB may provide the record.

If TVmaze provides the record but a specific field is missing or invalid, MovieApi should attempt field-level enrichment from TMDB rather than replacing the entire record.

## Reliability

The provider client will use bounded retries, backoff, response validation, caching, and circuit breaking.

TVmaze's documented rate-limit behavior must be respected; 429 responses are not treated as permission to retry aggressively.

## Documentation source

Official API documentation: https://www.tvmaze.com/api
