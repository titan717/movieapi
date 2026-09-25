# API Overview

## Versioning

All public endpoints use `/api/v1`.

Breaking changes require a new API version.

## Response envelope

Successful responses use:

```json
{
  "success": true,
  "data": {}
}
```

Errors use:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid request parameters.",
    "requestId": "req_..."
  }
}
```

## Planned endpoint groups

### Health
- `GET /api/v1/health`
- `GET /api/v1/version`

### Search
- `GET /api/v1/search?q=`

### Movies
- `GET /api/v1/movie/:id`
- `GET /api/v1/movie/:id/videos`
- `GET /api/v1/movie/:id/recommendations`
- `GET /api/v1/movie/:id/sources`
- `GET /api/v1/movie/:id/play`

### TV
- `GET /api/v1/tv/:id`
- `GET /api/v1/tv/:id/seasons`
- `GET /api/v1/tv/:id/episodes`
- `GET /api/v1/tv/:id/season/:season`
- `GET /api/v1/tv/:id/season/:season/episode/:episode`
- `GET /api/v1/tv/:id/season/:season/episode/:episode/play`

### Discovery
- popular
- latest
- upcoming
- airing
- trending
- featured
- genres
- recommendations
- home aggregation

The endpoint list is a roadmap; an endpoint is not considered available until implemented and represented in OpenAPI.
