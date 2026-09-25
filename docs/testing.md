# Testing Strategy

Every phase must add tests with the implementation.

## Phase 1

- Health/version responses
- Request IDs
- Authentication
- Rate limiting
- 404 envelope
- Documentation/OpenAPI availability

## Phase 2 — TVmaze

- Show normalization
- HTML summary cleanup
- TVmaze 404 mapping
- Search pagination
- Cast/crew exclusion
- Airing schedule embedded-show normalization
- Malformed provider JSON mapping

## Phase 3 — TMDB

- TMDB movie normalization
- TMDB authentication/configuration boundary
- TMDB unavailable response
- TVmaze → TMDB field-level fallback
- Preservation of valid TVmaze fields
- External-ID matching

## Reliability pass

- Retry/backoff/jitter
- Cache behavior
- Circuit breaker behavior
- Provider health
- stale-while-revalidate

## Contract tests

OpenAPI and implementation must remain synchronized.

## Phase gate

A phase is not complete until its tests and documentation pass review and the deployment path has been checked.
