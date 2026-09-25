# Changelog

## 2026-09-25

### Phase 1
- Added TypeScript/Hono API foundation.
- Added /api/v1/health and /api/v1/version.
- Added root Hono Vercel entrypoint.
- Added request IDs.
- Added CORS.
- Added API-key authentication foundation.
- Added bounded per-instance rate limiting.
- Added standardized errors and 404 handling.
- Added structured JSON logging.
- Added runtime configuration validation.
- Added executable Vitest tests.
- Added /docs and /openapi.yaml endpoints.
- Synchronized OpenAPI with implemented Phase 1 routes.
- Fixed CI so it does not depend on a missing npm lockfile.
- Corrected the Vercel entrypoint after deployment verification exposed an output-directory failure.

### Verification note
The implementation has been inspected through the repository files. Local execution is unavailable in the current environment because outbound GitHub access is blocked, so local `npm run check` has not been claimed as executed.
