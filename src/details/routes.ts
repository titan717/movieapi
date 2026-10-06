import { Hono } from "hono";
import type { Context } from "hono";
import { errorResponse } from "../errors.js";
import { TmdbProviderError } from "../providers/tmdb/client.js";
import type { CanonicalDetailsService } from "../services/canonical-details.js";

type AppEnv = { Variables: { requestId: string } };
type DetailsType = "movie" | "tv";

function positiveInt(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 2_147_483_647 ? parsed : null;
}

function providerError(c: Context<AppEnv>, error: unknown) {
  if (!(error instanceof TmdbProviderError)) return null;

  const map = {
    UNCONFIGURED: ["PROVIDER_UNAVAILABLE", "TMDB is not configured.", 503],
    TIMEOUT: ["PROVIDER_TIMEOUT", "TMDB did not respond in time.", 504],
    RATE_LIMIT: ["PROVIDER_RATE_LIMITED", "TMDB rate limited the request.", 429],
    HTTP_ERROR: ["PROVIDER_UNAVAILABLE", "TMDB is currently unavailable.", 502],
    INVALID_RESPONSE: ["PROVIDER_INVALID_RESPONSE", "TMDB returned an invalid response.", 502],
    NOT_FOUND: ["MEDIA_NOT_FOUND", "The requested TMDB content was not found.", 404],
    UNAUTHORIZED: ["PROVIDER_AUTH_FAILED", "TMDB authentication failed.", 502],
    CIRCUIT_OPEN: ["PROVIDER_UNAVAILABLE", "TMDB is temporarily unavailable.", 503]
  } as const;

  const [code, message, status] = map[error.kind];
  return errorResponse(c, code, message, status, c.get("requestId"));
}

/**
 * Details is deliberately separate from search:
 * - search identifies a candidate and returns its explicit media type
 * - details receives that type + TMDB ID and fetches the authoritative record
 *
 * This prevents a movie and TV series with the same title or numeric ID
 * from being merged or resolved through title-based guessing.
 */
export function createDetailsRoutes(canonical: CanonicalDetailsService) {
  const app = new Hono<AppEnv>();

  app.get("/:type/:id", async (c) => {
    const type = c.req.param("type") as DetailsType;
    const id = positiveInt(c.req.param("id"));

    if (type !== "movie" && type !== "tv") {
      return errorResponse(c, "INVALID_MEDIA_TYPE", "type must be movie or tv.", 400, c.get("requestId"));
    }

    if (!id) {
      return errorResponse(c, "INVALID_MEDIA_ID", "TMDB media ID must be a positive integer.", 400, c.get("requestId"));
    }

    try {
      const data = type === "movie"
        ? await canonical.forMovie(id)
        : await canonical.forTv(id);

      c.header("Cache-Control", "public, s-maxage=300, stale-while-revalidate=1800");
      return c.json({
        success: true,
        data: {
          ...data,
          mediaType: type,
          tmdbId: id
        }
      });
    } catch (error) {
      return providerError(c, error) ?? errorResponse(c, "INTERNAL_ERROR", "Unable to fetch media details.", 500, c.get("requestId"));
    }
  });

  return app;
}
