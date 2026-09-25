# Episode Metadata

## Normalized episode model

```json
{
  "id": "kinoma_tvmaze_episode_456",
  "providerId": 456,
  "season": 1,
  "number": 3,
  "title": "Episode Title",
  "overview": "Episode description.",
  "airdate": "2026-09-25",
  "runtime": 48,
  "image": "https://...",
  "rating": 8.4
}
```

Episode IDs should remain stable inside MovieApi.

Episode image/still URLs are provider-normalized assets; provider response structures are never exposed directly.
