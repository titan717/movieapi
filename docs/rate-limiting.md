# Rate Limiting

Phase 1 implements a bounded in-memory rate limiter.

Defaults:

- 120 requests per 60 seconds
- keyed by the first X-Forwarded-For address

When exceeded, MovieApi returns HTTP 429 with Retry-After.

This limiter is intentionally a foundation. Before high-volume multi-instance production traffic, replace it with a shared distributed limiter so limits are consistent across instances.
