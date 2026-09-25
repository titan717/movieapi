import { z } from "zod";

export const playbackSourceSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  type: z.enum(["embed", "hls", "dash", "file"]),
  url: z.string().url(),
  title: z.string().min(1),
  quality: z.string().nullable(),
  language: z.string().nullable(),
  subtitles: z.array(z.object({
    label: z.string().min(1),
    language: z.string().min(1),
    url: z.string().url()
  })).default([]),
  expiresAt: z.string().datetime().nullable(),
  requiresClientPlayback: z.boolean()
}).passthrough();

export type PlaybackSource = z.infer<typeof playbackSourceSchema>;

export type PlaybackRequest =
  | { mediaType: "movie"; tmdbId: number }
  | { mediaType: "tv_episode"; tmdbId: number; season: number; episode: number };
