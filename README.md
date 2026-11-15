<!-- MovieAPI · Panda.fun backend and media metadata API -->

<div align="center">
  <h1>🎬 MovieAPI</h1>
  <p><strong>The backend layer powering Panda.fun.</strong></p>
  <p>A normalized REST API for movie and TV metadata, search, discovery, trailers, and playback integration.</p>
  <p>
    <a href="https://apikinoma.vercel.app/docs"><img src="https://img.shields.io/badge/API%20DOCS-Explore%20the%20API-6c63ff?style=for-the-badge&logo=swagger&logoColor=white" alt="Explore MovieAPI documentation" /></a>
    &nbsp;
    <a href="https://apikinoma.vercel.app/api/v1/health"><img src="https://img.shields.io/badge/API-Health%20check-16a36a?style=for-the-badge" alt="MovieAPI health check" /></a>
  </p>
  <p>
    <img src="https://img.shields.io/badge/TypeScript-API-3178c6?style=flat-square&logo=typescript" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Hono-HTTP%20framework-e36002?style=flat-square" alt="Hono" />
    <img src="https://img.shields.io/badge/Vercel-Deployed-111111?style=flat-square&logo=vercel" alt="Vercel" />
    <img src="https://img.shields.io/github/license/titan717/movieapi?style=flat-square" alt="Project license" />
  </p>
</div>

---

## 🧩 Overview

**MovieAPI** is the backend service layer for [Panda.fun](https://pandatv2.vercel.app/). It provides a stable, normalized API for movie and television metadata, search, discovery, trailers, and playback-provider integration.

The goal is to keep the client application independent from individual provider response formats while centralising caching, reliability, health checks, and service logic.

<div align="center">
  <a href="https://apikinoma.vercel.app/docs"><strong>Read the API documentation ↗</strong></a>
  &nbsp;·&nbsp;
  <a href="https://apikinoma.vercel.app/openapi.yaml"><strong>OpenAPI specification ↗</strong></a>
</div>

## ⚙️ Capabilities

| Area | What it provides |
|---|---|
| **Movie & TV metadata** | Normalized metadata responses for entertainment clients |
| **Search** | Search endpoints for titles |
| **Discovery** | Discovery and trending content |
| **Trailers** | Trailer lookup and integration |
| **Playback integration** | Provider URL construction through a source registry |
| **Poster wall** | Up to 120 unique trending posters for the Panda profile-selection experience |
| **Player issue reports** | Validated player issue reports written to structured logs |
| **Operations** | Caching, health checks, version endpoint, reliability and monitoring |

## 🏗️ Architecture

```text
Panda.fun (web / Android)
        |
        v
MovieAPI REST API (/api/v1)
        |
        v
Service layer
  ├── Metadata
  ├── Search & discovery
  ├── Trailers
  ├── Playback integration
  └── Player reports
        |
        v
Provider adapters · Cache · Health · Monitoring
```

Provider adapters keep integrations replaceable. The documented metadata provider strategy uses TMDB, with provider-specific logic isolated behind service adapters.

## 🔌 API routes & documentation

- **Interactive API docs:** https://apikinoma.vercel.app/docs
- **OpenAPI document:** https://apikinoma.vercel.app/openapi.yaml
- **Health:** https://apikinoma.vercel.app/api/v1/health
- **Version:** https://apikinoma.vercel.app/api/v1/version

Useful documented endpoints include:

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/health` | Service health |
| `GET /api/v1/version` | API version |
| `GET /api/v1/panda/play/:type/:id` | Build playback embed URLs |
| `GET /api/v1/panda/sources/health` | Check playback provider availability |
| `GET /api/v1/panda/wall` | Retrieve trending poster wall |
| `POST /api/v1/panda/report` | Submit a validated player issue report |

See the [API overview](docs/api-overview.md) for the complete route documentation.

## 🚀 Run locally

**Requirements:** Node.js and npm.

```bash
git clone https://github.com/titan717/movieapi.git
cd movieapi
npm install
npm run dev
```

The local service listens on port 3000. Explore:

- http://localhost:3000/api/v1/health
- http://localhost:3000/api/v1/version
- http://localhost:3000/docs
- http://localhost:3000/openapi.yaml

Run the project checks:

```bash
npm run check
```

## 🧰 Technology

- **TypeScript** — typed service implementation
- **Hono** — HTTP framework
- **Zod** — request and data validation
- **Vitest** — automated tests
- **Vercel** — production deployment

## 🛡️ Responsible provider integration

MovieAPI is designed to use documented or authorized provider interfaces where available. It does not bypass DRM, authentication, CAPTCHA, access controls, protected keys, or other technical restrictions.

## 📚 Developer documentation

- [Architecture](docs/architecture.md)
- [API overview](docs/api-overview.md)
- [Provider strategy](docs/providers/overview.md)
- [Metadata: movies](docs/metadata/movies.md)
- [Metadata: TV](docs/metadata/tv.md)
- [Search](docs/search.md)
- [Discovery](docs/discovery.md)
- [Trailers](docs/trailers.md)
- [Playback](docs/playback.md)
- [Caching](docs/caching.md)
- [Reliability](docs/reliability.md)
- [Errors](docs/errors.md)
- [Authentication](docs/authentication.md)
- [Rate limiting](docs/rate-limiting.md)
- [Monitoring](docs/monitoring.md)
- [Testing](docs/testing.md)
- [Deployment](docs/deployment.md)
- [OpenAPI specification](openapi/openapi.yaml)
- [Changelog](docs/changelog.md)

---

<div align="center">
  <p><strong>Built as the service layer behind Panda.fun 🐼</strong></p>
  <a href="https://github.com/titan717/Panda.fun">Panda.fun</a>
  &nbsp;·&nbsp;
  <a href="https://apikinoma.vercel.app/docs">Live API docs</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/titan717">TITAN717</a>
</div>
