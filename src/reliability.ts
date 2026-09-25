export type CacheState = "fresh" | "stale";

type Entry<T> = { value: T; freshUntil: number; staleUntil: number };

export class MemoryCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly inFlight = new Map<string, Promise<T>>();

  constructor(private readonly maxEntries = 1000) {}

  get(key: string, now = Date.now()): { value: T; state: CacheState } | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (now >= entry.staleUntil) {
      this.entries.delete(key);
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return { value: entry.value, state: now < entry.freshUntil ? "fresh" : "stale" };
  }

  set(key: string, value: T, ttlMs: number, staleTtlMs: number): void {
    const now = Date.now();
    this.entries.delete(key);
    this.entries.set(key, { value, freshUntil: now + ttlMs, staleUntil: now + ttlMs + staleTtlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  async getOrSet(key: string, loader: () => Promise<T>, ttlMs: number, staleTtlMs: number): Promise<{ value: T; state: CacheState }> {
    const cached = this.get(key);
    if (cached?.state === "fresh") return cached;
    if (cached?.state === "stale") {
      void this.refresh(key, loader, ttlMs, staleTtlMs).catch(() => undefined);
      return cached;
    }
    return { value: await this.refresh(key, loader, ttlMs, staleTtlMs), state: "fresh" };
  }

  invalidate(key: string): void { this.entries.delete(key); }
  invalidatePrefix(prefix: string): void {
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
  }
  clear(): void { this.entries.clear(); }
  stats() { return { entries: this.entries.size, inFlight: this.inFlight.size, maxEntries: this.maxEntries }; }

  private async refresh(key: string, loader: () => Promise<T>, ttlMs: number, staleTtlMs: number): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const promise = loader().then((value) => {
      this.set(key, value, ttlMs, staleTtlMs);
      return value;
    }).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }
}

export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: number;
  shouldRetry?: (error: unknown) => boolean;
};

export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 150);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 1500);
  const jitter = Math.max(0, options.jitter ?? 0.2);
  const shouldRetry = options.shouldRetry ?? (() => false);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetry(error)) throw error;
      const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const spread = exponential * jitter;
      const delay = Math.max(0, exponential + (Math.random() * 2 - 1) * spread);
      await new Promise((resolve) => setTimeout(resolve, Math.round(delay)));
    }
  }
  throw lastError;
}

export class CircuitBreaker {
  private state: "closed" | "open" | "half-open" = "closed";
  private failures = 0;
  private openedAt = 0;
  private probeInFlight = false;

  constructor(private readonly failureThreshold = 5, private readonly resetTimeoutMs = 30_000) {}

  canRequest(now = Date.now()): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open" && now - this.openedAt >= this.resetTimeoutMs) {
      if (this.probeInFlight) return false;
      this.state = "half-open";
      this.probeInFlight = true;
      return true;
    }
    return this.state === "half-open" && !this.probeInFlight;
  }

  onSuccess(): void { this.state = "closed"; this.failures = 0; this.probeInFlight = false; }
  onFailure(): void {
    this.probeInFlight = false;
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.state = "open";
      this.openedAt = Date.now();
    }
  }
  snapshot() { return { state: this.state, failures: this.failures, openedAt: this.openedAt }; }
}

export class ProviderHealth {
  private state: "healthy" | "degraded" | "unavailable" = "healthy";
  private consecutiveFailures = 0;
  private successes = 0;
  private failures = 0;
  private lastSuccessAt: string | null = null;
  private lastFailureAt: string | null = null;
  private lastLatencyMs: number | null = null;

  recordSuccess(latencyMs: number): void {
    this.successes += 1;
    this.consecutiveFailures = 0;
    this.lastSuccessAt = new Date().toISOString();
    this.lastLatencyMs = latencyMs;
    this.state = "healthy";
  }

  recordFailure(latencyMs: number): void {
    this.failures += 1;
    this.consecutiveFailures += 1;
    this.lastFailureAt = new Date().toISOString();
    this.lastLatencyMs = latencyMs;
    this.state = this.consecutiveFailures >= 5 ? "unavailable" : "degraded";
  }

  snapshot() {
    return {
      state: this.state,
      successes: this.successes,
      failures: this.failures,
      consecutiveFailures: this.consecutiveFailures,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
      lastLatencyMs: this.lastLatencyMs
    };
  }
}

export function isRetryableProviderError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const kind = "kind" in error ? String((error as { kind?: unknown }).kind) : "";
  const status = "status" in error ? Number((error as { status?: unknown }).status) : 0;
  return kind === "TIMEOUT" || kind === "HTTP_ERROR" || kind === "RATE_LIMIT" || status === 429 || status >= 500;
}
