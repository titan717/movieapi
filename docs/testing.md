# Testing Strategy

Every phase must add tests with the implementation.

## Provider tests

- Valid response
- Missing fields
- Malformed response
- Timeout
- 429
- 5xx
- Not found

## Service tests

- Normalization
- Field-level fallback
- Whole-provider fallback
- Deduplication
- Cache behavior
- Circuit breaker behavior

## Route tests

- Valid request
- Invalid request
- Authentication
- Rate limiting
- Error envelopes
- Pagination

## Contract tests

OpenAPI and implementation must remain synchronized.

## Phase gate

A phase is not complete until its tests and documentation pass review.
