# Rate Limiting

MovieApi will enforce rate limits at its public boundary.

Provider-specific limits are separate from MovieApi limits.

The service must not amplify provider load through uncontrolled frontend retries.

429 responses from upstream providers are handled through bounded backoff, circuit-breaking, and fallback logic where appropriate.
