import type { TmdbClient } from "../providers/tmdb/client.js";
import type { TmdbVideoClient } from "../providers/tmdb/videos.js";
import { normalizeTmdbMovie, normalizeTmdbTv } from "../providers/tmdb/normalizer.js";
import type { TvmazeShow } from "../providers/tvmaze/schemas.js";
import { findMatchingTmdbTv, mergeTvmazeWithTmdb } from "../providers/tvmaze/fallback.js";

export class CanonicalDetailsService {
  constructor(
    private readonly tmdb: TmdbClient,
    private readonly videos: TmdbVideoClient
  ) {}

  async forTvmazeShow(show: TvmazeShow) {
    const match = await findMatchingTmdbTv(show, this.tmdb);
    if (!match) return null;

    const data = mergeTvmazeWithTmdb(show, match);
    const trailer = await this.videos.getPrimaryTrailer("tv", match.id);

    return {
      ...data,
      ids: {
        ...data.ids,
        tvmaze: show.id,
        imdb: show.externals?.imdb ?? null,
        thetvdb: show.externals?.thetvdb ?? null,
        tvrage: show.externals?.tvrage ?? null
      },
      trailer
    };
  }

  async forMovie(tmdbId: number) {
    const movie = await this.tmdb.getMovie(tmdbId);
    return {
      ...normalizeTmdbMovie(movie),
      trailer: await this.videos.getPrimaryTrailer("movie", tmdbId)
    };
  }

  async forTv(tmdbId: number, tvmazeId: number | null = null) {
    const show = await this.tmdb.getTv(tmdbId);
    return {
      ...normalizeTmdbTv(show, tvmazeId),
      trailer: await this.videos.getPrimaryTrailer("tv", tmdbId)
    };
  }
}
