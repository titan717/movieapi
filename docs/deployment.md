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

## Vercel

The repository uses the Hono Vercel pattern with a root `index.ts` that default-exports the Hono application.

The current Hono guidance documents this default-export pattern for Vercel deployments:
https://hono.dev/docs/getting-started/vercel

Production secrets must be configured through the deployment platform's environment variables.

The Vercel deployment path is intentionally checked separately from the Node server path because the two runtimes have different packaging requirements.
