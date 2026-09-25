# Reliability

MovieApi is designed to tolerate provider failures. Phase 4 implements bounded retries, bounded in-memory stale-while-revalidate caching per application instance, circuit breakers, and provider health snapshots.

## Retry

Retries are bounded and use exponential/backoff delays with jitter.

Retries stop after a configured maximum. Rate limits and non-retryable errors are handled explicitly.

## Circuit breaker

Repeated provider failures can open a circuit temporarily. While open, calls are avoided and fallback providers may be used. Periodic probes determine recovery.

## Provider health

Provider state:

- healthy
- degraded
- unavailable

Tracked signals include latency, success/failure counts, consecutive failures, timeouts, rate limits, and last successful request.

## Response validation

Malformed or incomplete provider responses are rejected before normalization/cache.

## Observability

Each request receives a request ID. Structured logs and metrics will support tracing API requests through service and provider calls without recording secrets.
