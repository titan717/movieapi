# API Overview

## Phase 1 — Implemented

### GET /api/v1/health

Returns service health, service version, timestamp, and the request ID in the response header.

### GET /api/v1/version

Returns MovieApi version, API version, and current phase.

### GET /docs

Human-readable Phase 1 documentation.

### GET /openapi.yaml

Machine-readable OpenAPI 3.1 contract.

## Middleware

- Request IDs through X-Request-ID
- CORS
- API-key authentication foundation
- Bounded per-instance rate limiting
- Standardized JSON errors
- Structured JSON logging
- Runtime environment validation

Provider and media endpoints are not available until their respective phases are implemented.
