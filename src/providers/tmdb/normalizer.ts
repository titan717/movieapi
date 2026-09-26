import type { TmdbMovieDetails, TmdbMovieListItem, TmdbTrendingItem, TmdbTvDetails, TmdbTvListItem } from "./schemas.js";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export function tmdbImage(path: string | null | undefined, size = "original") {
  return path ? `${TMDB_IMAGE_BASE}/${size}${path}` : null;
}

export function normalizeTmdbTv(show: TmdbTvDetails) {
  return { id: `kinoma_tmdb_tv_${show.id}`, type: "tv", title: show.name, originalTitle: show.original_name ?? show.name,
    year: show.first_air_date ? Number(show.first_air_date.slice(0, 4)) || null : null, rating: show.vote_average ?? null,
    poster: tmdbImage(show.poster_path), backdrop: tmdbImage(show.backdrop_path), overview: show.overview || null,
    genres: show.genres?.map((genre) => genre.name) ?? [], runtime: show.episode_run_time?.[0] ?? null,
    releaseDate: show.first_air_date || null, status: show.status ?? null, language: show.original_language ?? null, numberOfEpisodes: show.number_of_episodes ?? null, numberOfSeasons: show.number_of_seasons ?? null,
    ids: { tvmaze: null, tmdb: show.id, imdb: null }, source: "tmdb" };
}

export function normalizeTmdbMovie(movie: TmdbMovieDetails) {
  return { id: `kinoma_tmdb_movie_${movie.id}`, type: "movie", title: movie.title, originalTitle: movie.original_title ?? movie.title,
    year: movie.release_date ? Number(movie.release_date.slice(0, 4)) || null : null, rating: movie.vote_average ?? null,
    poster: tmdbImage(movie.poster_path), backdrop: tmdbImage(movie.backdrop_path), overview: movie.overview || null,
    genres: movie.genres?.map((genre) => genre.name) ?? [], runtime: movie.runtime ?? null,
    releaseDate: movie.release_date || null, status: movie.status ?? null, language: movie.original_language ?? null,
    ids: { tmdb: movie.id }, source: "tmdb" };
}

export function normalizeTmdbTvResult(show: TmdbTvListItem) {
  return { id: `kinoma_tmdb_tv_${show.id}`, type: "tv", title: show.name, originalTitle: show.original_name ?? show.name,
    year: show.first_air_date ? Number(show.first_air_date.slice(0, 4)) || null : null, rating: show.vote_average ?? null,
    poster: tmdbImage(show.poster_path), backdrop: tmdbImage(show.backdrop_path), overview: show.overview || null, genres: [],
    runtime: null, releaseDate: show.first_air_date || null, status: null, language: show.original_language ?? null,
    ids: { tvmaze: null, tmdb: show.id, imdb: null }, source: "tmdb" };
}

export function normalizeTmdbMovieResult(movie: TmdbMovieListItem) {
  return { id: `kinoma_tmdb_movie_${movie.id}`, type: "movie", title: movie.title, originalTitle: movie.original_title ?? movie.title,
    year: movie.release_date ? Number(movie.release_date.slice(0, 4)) || null : null, rating: movie.vote_average ?? null,
    poster: tmdbImage(movie.poster_path), backdrop: tmdbImage(movie.backdrop_path), overview: movie.overview || null, genres: [],
    runtime: null, releaseDate: movie.release_date || null, status: null, language: movie.original_language ?? null,
    ids: { tmdb: movie.id }, source: "tmdb" };
}

export function normalizeTmdbTrendingResult(item: TmdbTrendingItem) {
  return item.media_type === "movie"
    ? normalizeTmdbMovieResult({ id: item.id, title: item.title ?? item.original_title ?? "Untitled", original_title: item.original_title,
      overview: item.overview, release_date: item.release_date, poster_path: item.poster_path, backdrop_path: item.backdrop_path,
      vote_average: item.vote_average, popularity: item.popularity, genre_ids: item.genre_ids, original_language: item.original_language })
    : normalizeTmdbTvResult({ id: item.id, name: item.name ?? item.original_name ?? "Untitled", original_name: item.original_name,
      overview: item.overview, first_air_date: item.first_air_date, poster_path: item.poster_path, backdrop_path: item.backdrop_path,
      vote_average: item.vote_average, popularity: item.popularity, genre_ids: item.genre_ids, original_language: item.original_language, origin_country: [] });
}
