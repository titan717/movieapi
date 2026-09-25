import { z } from "zod";

export const tmdbVideoSchema = z.object({
  id: z.string(), iso_639_1: z.string().nullable().optional(), iso_3166_1: z.string().nullable().optional(),
  key: z.string(), name: z.string(), site: z.string(), size: z.number().int().optional(), type: z.string(),
  official: z.boolean().optional(), published_at: z.string().optional()
}).passthrough();

export const tmdbVideosResponseSchema = z.object({
  id: z.number().int().optional(), results: z.array(tmdbVideoSchema)
}).passthrough();

export type TmdbVideo = z.infer<typeof tmdbVideoSchema>;
