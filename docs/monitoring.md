# Monitoring

Planned metrics:

- Request count
- Error count
- Latency
- P95/P99 latency
- Cache hit/miss
- Provider success/failure
- Fallback frequency
- Search failures
- Trailer failures
- Playback failures
- Background job failures

Provider health should be visible to the future admin dashboard.

Logs use request IDs for traceability and exclude credentials, tokens, authorization headers, and private user data.
