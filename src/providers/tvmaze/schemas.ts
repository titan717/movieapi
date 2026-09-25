import { z } from "zod";

const imageSchema = z.object({
  medium: z.string().url().nullable().optional(),
  original: z.string().url().nullable().optional()
}).passthrough();

const countrySchema = z.object({
  name: z.string().nullable().optional(),
  code: z.string().nullable().optional(),
  timezone: z.string().nullable().optional()
}).passthrough();

const channelSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  country: countrySchema.nullable().optional(),
  officialSite: z.string().url().nullable().optional()
}).passthrough();

export const showSchema = z.object({
  id: z.number().int(),
  url: z.string().url().optional(),
  name: z.string(),
  type: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  genres: z.array(z.string()).optional(),
  status: z.string().nullable().optional(),
  runtime: z.number().int().nullable().optional(),
  averageRuntime: z.number().int().nullable().optional(),
  premiered: z.string().nullable().optional(),
  ended: z.string().nullable().optional(),
  officialSite: z.string().url().nullable().optional(),
  schedule: z.object({
    time: z.string().nullable().optional(),
    days: z.array(z.string()).optional(),
    timezone: z.string().nullable().optional()
  }).nullable().optional(),
  rating: z.object({ average: z.number().nullable().optional() }).optional(),
  weight: z.number().nullable().optional(),
  network: channelSchema.nullable().optional(),
  webChannel: channelSchema.nullable().optional(),
  dvdCountry: countrySchema.nullable().optional(),
  externals: z.object({
    tvrage: z.number().int().nullable().optional(),
    thetvdb: z.number().int().nullable().optional(),
    imdb: z.string().nullable().optional()
  }).optional(),
  image: imageSchema.nullable().optional(),
  summary: z.string().nullable().optional(),
  updated: z.number().int().nullable().optional(),
  _links: z.record(z.string(), z.unknown()).optional()
}).passthrough();

export const searchResultSchema = z.object({
  score: z.number(),
  show: showSchema
}).passthrough();

export const episodeSchema = z.object({
  id: z.number().int(),
  url: z.string().url().optional(),
  name: z.string(),
  season: z.number().int().nullable().optional(),
  number: z.number().int().nullable().optional(),
  type: z.string().nullable().optional(),
  airdate: z.string().nullable().optional(),
  airtime: z.string().nullable().optional(),
  airstamp: z.string().nullable().optional(),
  runtime: z.number().int().nullable().optional(),
  averageRuntime: z.number().int().nullable().optional(),
  image: imageSchema.nullable().optional(),
  summary: z.string().nullable().optional(),
  rating: z.object({ average: z.number().nullable().optional() }).optional(),
  _links: z.record(z.string(), z.unknown()).optional(),
  _embedded: z.record(z.string(), z.unknown()).optional()
}).passthrough();

export const seasonSchema = z.object({
  id: z.number().int(),
  url: z.string().url().optional(),
  number: z.number().int(),
  name: z.string().nullable().optional(),
  episodeOrder: z.number().int().nullable().optional(),
  premiereDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  network: channelSchema.nullable().optional(),
  webChannel: channelSchema.nullable().optional(),
  image: imageSchema.nullable().optional(),
  summary: z.string().nullable().optional()
}).passthrough();

export const scheduleEpisodeSchema = episodeSchema.extend({
  show: showSchema.optional()
}).passthrough();

export type TvmazeShow = z.infer<typeof showSchema>;
export type TvmazeEpisode = z.infer<typeof episodeSchema>;
export type TvmazeSeason = z.infer<typeof seasonSchema>;
