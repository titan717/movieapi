# Search

Search will normalize titles and alternate titles before provider queries.

Planned capabilities:

- Partial matching
- Alternate titles
- Year matching
- Movie/TV filtering
- Typo tolerance
- Deduplication
- Ranking
- Pagination

Search results use MovieApi's normalized media identity rather than raw provider IDs.

Search caching will use a shorter TTL than stable metadata.
