# Caching

Phase 4 implements an in-memory bounded cache per application instance. Cached provider responses are schema-validated before storage. Fresh entries are served normally; stale entries are returned immediately while one background refresh is deduplicated per key.


Caching is data-type specific.

| Data | Intended TTL |
|---|---|
| Search | Short |
| Airing | Short |
| Trending/popular | Short/medium |
| Movie metadata | Medium |
| TV metadata | Medium |
| Seasons | Medium |
| Old episodes | Long |
| Images | Long |
| Provider health | Short |
| Playback resolution | Very short |

## Stale-while-revalidate

Where safe, stale cached metadata may be returned immediately while a background refresh updates the cache.

## Validation before caching

External provider responses must pass schema validation before entering the cache.

## Invalidation

Cache invalidation is granular. Updating one episode must not require clearing unrelated media.
