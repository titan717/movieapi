# Changelog

## 2026-09-25

### Phase 7 — Playback
- Added a provider-neutral playback source contract.
- Added a documented VidSrc embed adapter using TMDB IDs.
- Added movie and TV episode source/play endpoints.
- Added playback provider health information.
- Kept playback discovery separate from trailer/video metadata.
- Avoided player HTML scraping, direct media proxying, DRM handling, and protected-key extraction.

# Changelog

## 2026-09-25

### Phase 3 — TMDB fallback/enrichment
- Added authenticated TMDB client using server-side Bearer authentication.
- Added TMDB TV/movie search and details.
- Added external-ID matching for TV fallback.
- Added field-level TVmaze → TMDB fallback.
- Preserved valid TVmaze fields during fallback.
- Added normalized TMDB movie and TV models.
- Added TMDB configuration.
- Added Phase 3 tests.

### Phase 2 — TVmaze provider
- Added schema-validated TVmaze client.
- Added TV show search and normalization.
- Added show metadata, seasons, episodes, season/episode lookup, and images.
- Added country/date airing endpoints.
- Added TVmaze timeout and provider error mapping.
- Added TVmaze configuration and descriptive User-Agent support.
- Added Phase 2 route tests with mocked provider responses.
- Added TVmaze attribution/licensing documentation.
- Kept cast and crew outside the MovieApi public contract.
- Updated service/package version to 0.2.0.

### Phase 1 verification fixes
- Corrected the Vercel Hono entrypoint to the root `index.ts`.
- Removed the redundant `api/index.ts`.
- Made CI independent of a missing npm lockfile.
- Corrected deployment documentation.
