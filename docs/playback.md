# Playback

Playback is separate from trailer/video previews.

## Architecture

```
Kinoma
  |
  v
MovieApi PlaybackService
  |
  v
ProviderResolver
  |
  v
VidSrcProvider
  |
  v
Normalized playback response
```

## Planned response

```json
{
  "available": true,
  "type": "hls",
  "url": "https://...",
  "expiresAt": "...",
  "qualities": [],
  "subtitles": []
}
```

Only values actually supplied and validated by the provider may be returned.

## Playback sessions

Dynamic playback resolution should use short-lived sessions. Volatile playback URLs must not receive long metadata cache TTLs.

## Continue Watching

Continue Watching belongs to Kinoma. MovieApi provides media/episode identity and playback information; it does not own the user's watch-progress state.

## Auto-next

MovieApi can expose normalized previous/current/next episode relationships for TV playback.
