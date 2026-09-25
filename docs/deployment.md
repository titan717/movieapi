# Deployment

Phase 1 provides a Node-compatible Hono server and a Vercel-compatible Hono application entrypoint.

## Local

    npm install
    npm run dev

Then open:

- /api/v1/health
- /api/v1/version
- /docs
- /openapi.yaml

Verification:

    npm run check

Vercel's current Hono guidance supports exporting the Hono application as the default export for a Vercel deployment. The repository therefore exposes api/index.ts as the Vercel entrypoint.

Production secrets must be configured through the deployment platform's environment variables.
