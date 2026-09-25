# Trailers and Videos

Trailers are separate from actual playback.

## Normalized video

```json
{
  "id": "abc123",
  "name": "Official Trailer",
  "type": "Trailer",
  "official": true,
  "site": "YouTube",
  "key": "abc123",
  "url": "https://...",
  "thumbnail": "https://...",
  "publishedAt": "2026-09-25"
}
```

## Selection order

1. Official trailer
2. Official teaser
3. Suitable official clip
4. Backdrop fallback

Kinoma may autoplay previews inline where browser policy allows. Fullscreen remains user-controlled.

MovieApi should fetch metadata and videos independently so detail pages can render metadata without waiting for video enrichment.
