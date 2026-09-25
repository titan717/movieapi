# TMDB Provider

TMDB is the fallback/enrichment metadata provider.

## Intended responsibilities

- Whole-record fallback when TVmaze is unavailable
- Field-level enrichment when TVmaze is missing a required field
- Provider ID matching
- Metadata needed for playback ID resolution where applicable
- Additional video/trailer enrichment where the service requires it

## Rules

TVmaze remains the primary source wherever valid data is available.

TMDB must not silently replace valid TVmaze data.

Provider-specific responses are normalized before entering the MovieApi service layer.

## Secrets

TMDB credentials are server-side secrets and must never be exposed to Kinoma or logs.
