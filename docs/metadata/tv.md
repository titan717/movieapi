# TV Metadata

## Normalized TV model

```json
{
  "id": "kinoma_tv_...",
  "type": "tv",
  "title": "Example Series",
  "year": 2026,
  "rating": 8.4,
  "poster": "https://...",
  "backdrop": "https://...",
  "overview": "Example overview.",
  "genres": [],
  "ids": {
    "tvmaze": 123,
    "tmdb": 456,
    "imdb": "tt1234567"
  }
}
```

Seasons and episodes are represented through dedicated normalized endpoints rather than leaking provider payloads.
