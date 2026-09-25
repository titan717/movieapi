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

Provider/route tests use mocked `fetch` responses so the test suite does not depend on live TVmaze availability.

Covered:

- Show normalization
- HTML summary cleanup
- TVmaze 404 mapping
- Search pagination
- Cast/crew exclusion from the normalized public model

Additional provider-contract cases planned for the next reliability pass:

- Malformed provider JSON
- Missing optional fields
- Timeout
- 429
- 5xx
- schema drift

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

A phase is not complete until its tests and documentation pass review and the deployment path has been checked.
