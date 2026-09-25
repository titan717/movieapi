# Movie Metadata

## Normalized movie model

```json
{
  "id": "kinoma_movie_...",
  "type": "movie",
  "title": "Example Movie",
  "originalTitle": "Example Movie",
  "year": 2026,
  "rating": 7.8,
  "quality": "HD",
  "poster": "https://...",
  "backdrop": "https://...",
  "overview": "Example overview.",
  "genres": [],
  "runtime": 120,
  "releaseDate": "2026-09-25",
  "ids": {
    "tvmaze": null,
    "tmdb": 12345,
    "imdb": "tt1234567"
  }
}
```

Fields are normalized and may be nullable when no trusted provider can supply them.

No cast or crew fields are part of this contract.
