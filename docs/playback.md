# Playback

Playback is separate from trailer/video previews.

## Architecture

```
Panda.fun
  |
  v
MovieApi Playback Service
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

## VidCore integration

MovieAPI can call a separately hosted, authorized VidCore resolver through its `/api/resolve` HTTP interface. The resolver returns newline-delimited events; MovieAPI selects a successful server event and uses its `play` field as the browser-facing HLS URL. MovieAPI does not need to reproduce the resolver's internal implementation.

Mirror order is configurable with `MOVIEAPI_VIDCORE_SERVERS`. The default order is `Orbit, Supreme, Prime, Premiere 4K, Horizon`. If no usable VidCore source is returned, the existing VidSrc embed remains available as fallback.

## Response contract

Playback responses expose a normalized `mode`:

- `direct` — a validated direct HLS, DASH, or file source is available.
- `embed` — only the provider embed is available.
- `hybrid` — a validated direct source is available and an embed fallback is also returned.

Example:

```json
{
  "mediaType": "movie",
  "mode": "hybrid",
  "source": {
    "type": "hls",
    "url": "https://authorized.example/media.m3u8",
    "requiresClientPlayback": false
  }
}
```

Only values actually supplied and validated by the provider may be returned.

## Playback sessions

Dynamic playback resolution should use short-lived sessions. Volatile playback URLs must not receive long metadata cache TTLs.

## Continue Watching

Continue Watching belongs to Panda.fun. MovieApi provides media/episode identity and playback information; it does not own the user's watch-progress state.

## Auto-next

MovieApi can expose normalized previous/current/next episode relationships for TV playback.
