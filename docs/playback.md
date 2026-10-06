# Playback

Playback is served by Vidy only. Trailer/video metadata remains a separate TMDB-backed concern.

## Vidy routes

Vidy addresses content by TMDB ID:

- Movies: `https://vidy.st/movie/{tmdbId}`
- TV: `https://vidy.st/tv/{tmdbId}/{season}/{episode}`

MovieApi adds the player controls used by Panda.fun:

- `autoplay=true`
- TV: `nextEpisode=true`
- TV: `episodeSelector=true`
- TV: `autoplayNextEpisode=true`

Vidy's documented embed contract requires the iframe permission policy:

```html
allow="encrypted-media; autoplay *; fullscreen *"
```

Vidy also supports `progress` for starting playback at a stored position. urlVidy docshttps://www.vidy.st/#docs

## Response contract

Playback responses expose a normalized `mode` and one Vidy embed source.

```json
{
  "mediaType": "movie",
  "mode": "embed",
  "source": {
    "provider": "vidy",
    "type": "embed",
    "url": "https://vidy.st/movie/315162?autoplay=true",
    "requiresClientPlayback": true
  }
}
```

Continue Watching belongs to Panda.fun. MovieApi provides media/episode identity and a deterministic Vidy URL; Panda.fun owns watch-progress state and passes `progress` back when resuming.
