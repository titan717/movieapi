# Providers

Providers are adapters behind a common interface.

## Metadata

### TVmaze

TVmaze is the Phase 2 primary metadata provider for TV content. The public API provides show search, show details, seasons, episodes, images, and schedules. The provider uses a descriptive User-Agent and validates every JSON response before normalization.

The public TVmaze API is rate limited and asks clients to handle HTTP 429 responses with backoff. MovieApi deliberately does not add retry logic in Phase 2; bounded retry/backoff belongs to the Phase 4 reliability layer.

TVmaze's public API is licensed under CC BY-SA and requires attribution. Panda.fun must include an appropriate TVmaze credit/link when using this provider.

### TMDB

TMDB is the Phase 3 fallback and enrichment provider. TVmaze remains primary for TV metadata; TMDB provides movie metadata and fills missing TV fields when a safe identity match is available.

## Playback

### CineSrc

CineSrc (`https://cinesrc.st/docs`) is the primary playback provider. Its embed exposes postMessage events and commands (play, pause, seek, volume), so Panda draws its own player chrome on top of it.

### Vidy

Vidy (`https://vidy.st`) is the fallback playback provider. It posts `PLAYER_EVENT` progress messages to the parent page.
