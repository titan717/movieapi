import { z } from "zod";

export const discoveryTypeSchema = z.enum(["movie", "tv"]);
export type DiscoveryType = z.infer<typeof discoveryTypeSchema>;

export const discoveryPageSchema = z.object({
  page: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  totalResults: z.number().int().nonnegative(),
  results: z.array(z.unknown())
});

export type DiscoveryPage<T> = {
  page: number;
  totalPages: number;
  totalResults: number;
  results: T[];
};
