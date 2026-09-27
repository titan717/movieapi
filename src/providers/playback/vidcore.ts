import { playbackSourceSchema, type PlaybackSource } from "./schemas.js";

export type VidCoreResolverOptions = {
  baseUrl?: string;
  servers?: string[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export class VidCoreResolverError extends Error {
  constructor(
    message: string,
    public readonly kind: "UNCONFIGURED" | "TIMEOUT" | "UNAVAILABLE" | "RESOLUTION_FAILED"
  ) {
    super(message);
    this.name = "VidCoreResolverError";
  }
}

type ResolveRequest =
  | { type: "movie"; id: number }
  | { type: "tv"; id: number; season: number; episode: number };

type ResolveServerEvent = {
  event?: string;
  server?: {
    name?: string;
    status?: string;
    url?: string;
    play?: string | null;
    proxy?: boolean;
  };
};

export class VidCoreResolver {
  readonly name = "vidcore";
  private readonly baseUrl?: string;
  private readonly servers: string[];
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: VidCoreResolverOptions = {}) {
    const configured = options.baseUrl?.trim();
    this.baseUrl = configured ? configured.replace(/\/$/, "") : undefined;
    this.servers = (options.servers ?? ["Orbit", "Supreme", "Prime", "Premiere 4K", "Horizon"])
      .map((server) => server.trim())
      .filter(Boolean);
    this.timeoutMs = Math.max(1_000, options.timeoutMs ?? 15_000);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get enabled() {
    return Boolean(this.baseUrl);
  }

  getHealth() {
    return {
      provider: this.name,
      configured: this.enabled,
      mode: this.enabled ? "direct" : "embed"
    } as const;
  }

  async resolveMovie(tmdbId: number): Promise<PlaybackSource | null> {
    return this.resolve({ type: "movie", id: tmdbId });
  }

  async resolveTvEpisode(tmdbId: number, season: number, episode: number): Promise<PlaybackSource | null> {
    return this.resolve({ type: "tv", id: tmdbId, season, episode });
  }

  private async resolve(request: ResolveRequest): Promise<PlaybackSource | null> {
    if (!this.baseUrl) throw new VidCoreResolverError("VidCore resolver is not configured.", "UNCONFIGURED");
    if (this.servers.length === 0) return null;

    let lastError: Error | null = null;

    for (const server of this.servers) {
      try {
        const source = await this.resolveServer(request, server);
        if (source) return source;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    return lastError ? null : null;
  }

  private async resolveServer(request: ResolveRequest, server: string): Promise<PlaybackSource | null> {
    const params = new URLSearchParams({
      type: request.type,
      id: String(request.id),
      server
    });

    if (request.type === "tv") {
      params.set("season", String(request.season));
      params.set("episode", String(request.episode));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/resolve?${params.toString()}`, {
        method: "GET",
        headers: { Accept: "application/x-ndjson, application/json" },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new VidCoreResolverError(`VidCore returned HTTP ${response.status}.`, "UNAVAILABLE");
      }

      const body = await response.text();
      const events = body
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as ResolveServerEvent);

      const success = events.find(
        (event) =>
          event.event === "server" &&
          event.server?.status === "ok" &&
          event.server.play
      );

      if (!success?.server?.play) return null;

      return playbackSourceSchema.parse({
        id: this.sourceId(request, server),
        provider: this.name,
        type: "hls",
        url: success.server.play,
        title: `VidCore ${server}`,
        quality: null,
        language: null,
        subtitles: [],
        expiresAt: null,
        requiresClientPlayback: false
      });
    } catch (error) {
      if (error instanceof VidCoreResolverError) throw error;
      if (error instanceof SyntaxError) {
        throw new VidCoreResolverError("VidCore returned invalid NDJSON.", "RESOLUTION_FAILED");
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new VidCoreResolverError("VidCore resolver timed out.", "TIMEOUT");
      }
      throw new VidCoreResolverError(
        error instanceof Error ? error.message : "VidCore resolver request failed.",
        "RESOLUTION_FAILED"
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private sourceId(request: ResolveRequest, server: string) {
    const suffix = request.type === "tv"
      ? `tv-${request.id}-s${request.season}-e${request.episode}`
      : `movie-${request.id}`;
    return `vidcore-${server.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${suffix}`;
  }
}
