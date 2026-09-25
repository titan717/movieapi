import { z } from "zod";

const imagePath = z.string().nullable().optional();

export const tmdbSearchTvSchema = z.object({
  page: z.number().int().optional(),
  results: z.array(z.object({
    id: z.number().int(),
    name: z.string(),
    original_name: z.string().optional(),
    overview: z.string().optional(),
    first_air_date: z.string().optional(),
    poster_path: imagePath,
    backdrop_path: imagePath,
    vote_average: z.number().optional(),
    popularity: z.number().optional(),
    genre_ids: z.array(z.number().int()).optional(),
    original_language: z.string().optional(),
    origin_country: z.array(z.string()).optional()
  }).passthrough()),
  total_pages: z.number().int().optional(),
  total_results: z.number().int().optional()
}).passthrough();

export const tmdbSearchMovieSchema = z.object({
  page: z.number().int().optional(),
  results: z.array(z.object({
    id: z.number().int(),
    title: z.string(),
    original_title: z.string().optional(),
    overview: z.string().optional(),
    release_date: z.string().optional(),
    poster_path: imagePath,
    backdrop_path: imagePath,
    vote_average: z.number().optional(),
    popularity: z.number().optional(),
    genre_ids: z.array(z.number().int()).optional(),
    original_language: z.string().optional()
  }).passthrough()),
  total_pages: z.number().int().optional(),
  total_results: z.number().int().optional()
}).passthrough();

export const tmdbTvDetailsSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  original_name: z.string().optional(),
  overview: z.string().optional(),
  first_air_date: z.string().optional(),
  last_air_date: z.string().optional(),
  poster_path: imagePath,
  backdrop_path: imagePath,
  vote_average: z.number().optional(),
  popularity: z.number().optional(),
  genres: z.array(z.object({ id: z.number().int(), name: z.string() }).passthrough()).optional(),
  episode_run_time: z.array(z.number().int()).optional(),
  status: z.string().optional(),
  original_language: z.string().optional(),
  origin_country: z.array(z.string()).optional(),
  number_of_episodes: z.number().int().optional(),
  number_of_seasons: z.number().int().optional()
}).passthrough();

export const tmdbMovieDetailsSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  original_title: z.string().optional(),
  overview: z.string().optional(),
  release_date: z.string().optional(),
  poster_path: imagePath,
  backdrop_path: imagePath,
  vote_average: z.number().optional(),
  popularity: z.number().optional(),
  genres: z.array(z.object({ id: z.number().int(), name: z.string() }).passthrough()).optional(),
  runtime: z.number().int().nullable().optional(),
  status: z.string().optional(),
  original_language: z.string().optional()
}).passthrough();

export const tmdbFindSchema = z.object({
  movie_results: z.array(z.object({ id: z.number().int(), title: z.string(), release_date: z.string().optional() }).passthrough()).optional(),
  tv_results: z.array(z.object({ id: z.number().int(), name: z.string(), first_air_date: z.string().optional() }).passthrough()).optional()
}).passthrough();

export type TmdbTvDetails = z.infer<typeof tmdbTvDetailsSchema>;
export type TmdbMovieDetails = z.infer<typeof tmdbMovieDetailsSchema>;
