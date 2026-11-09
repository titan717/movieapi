/**
 * Account-free cross-device sync (Panda.fun v1.2.3, master mission §6).
 *
 * The app derives two values from the 12-character sync code on the device: an AES-GCM key that never
 * leaves it, and a 32-hex lookup id. Only the lookup id and the encrypted backup reach this backend, so
 * the stored blob is ciphertext the server cannot read.
 *
 * Storage: a Redis REST store when UPSTASH_REDIS_REST_URL/TOKEN (or Vercel KV's KV_REST_API_URL/TOKEN)
 * are set, otherwise TextDB (textdb.dev, keyless text storage) under a name derived from the lookup id.
 * Lookups are rate-limited per client and lock out after repeated misses.
 */

export const SYNC_ID = /^[a-f0-9]{32}$/;
/** Largest accepted backup (base64 ciphertext envelope). */
export const SYNC_MAX_BYTES = 512 * 1024;
/** Misses (unknown codes) allowed per client in the window before lockout. */
export const SYNC_MISS_LIMIT = 5;
export const SYNC_MISS_WINDOW_MS = 15 * 60_000;
export const SYNC_LOCK_MS = 15 * 60_000;
/** All sync requests per client per minute. */
export const SYNC_RATE = 30;

export interface SyncRecord { version: number; blob: string; updatedAt: number }

/* ---------------- client guard: rate limit and lockout ---------------- */

interface Guard { minute: number; count: number; misses: number[]; lockedUntil: number }
const guards = new Map<string, Guard>();

function guardFor(client: string, now: number): Guard {
  let g = guards.get(client);
  if (!g) { g = { minute: Math.floor(now / 60_000), count: 0, misses: [], lockedUntil: 0 }; guards.set(client, g); }
  if (guards.size > 20_000) {
    for (const [k, v] of guards) if (v.lockedUntil < now && v.misses.every((t) => now - t > SYNC_MISS_WINDOW_MS)) guards.delete(k);
  }
  return g;
}

/** Null when the request may go ahead, else the seconds to wait and why. */
export function checkClient(client: string, now = Date.now()): { retryAfter: number; reason: "locked" | "rate" } | null {
  const g = guardFor(client, now);
  if (g.lockedUntil > now) return { retryAfter: Math.ceil((g.lockedUntil - now) / 1000), reason: "locked" };
  const minute = Math.floor(now / 60_000);
  if (minute !== g.minute) { g.minute = minute; g.count = 0; }
  g.count += 1;
  if (g.count > SYNC_RATE) return { retryAfter: 60 - Math.floor((now % 60_000) / 1000), reason: "rate" };
  return null;
}

/** Counts a lookup of a code that has no backup; returns the remaining tries before lockout. */
export function recordMiss(client: string, now = Date.now()): number {
  const g = guardFor(client, now);
  g.misses = g.misses.filter((t) => now - t < SYNC_MISS_WINDOW_MS);
  g.misses.push(now);
  if (g.misses.length >= SYNC_MISS_LIMIT) { g.lockedUntil = now + SYNC_LOCK_MS; g.misses = []; return 0; }
  return SYNC_MISS_LIMIT - g.misses.length;
}

export function clearMisses(client: string) { const g = guards.get(client); if (g) g.misses = []; }
export function resetSyncGuards() { guards.clear(); }

/* ---------------- storage ---------------- */

function kv() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export const syncStore = () => (kv() ? "redis" : "textdb");

const TEXTDB = "https://textdb.dev/api/data/";

async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Storage name for a lookup id; one more hash so the stored name never equals what clients send. */
export async function storageName(id: string) { return `panda-sync-v1-${(await sha256Hex(`panda.fun/sync/v1/${id}`)).slice(0, 40)}`; }

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
/** Tests swap the network for an in-memory store. */
export function setSyncFetch(f: Fetch | null) { fetchImpl = f ?? ((...a) => fetch(...a)); }

function parseRecord(raw: string | null | undefined): SyncRecord | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<SyncRecord> & { revoked?: boolean };
    if (r.revoked || typeof r.blob !== "string" || !Number.isInteger(r.version)) return null;
    return { version: r.version!, blob: r.blob, updatedAt: Number(r.updatedAt) || 0 };
  } catch { return null; }
}

export async function readRecord(id: string): Promise<SyncRecord | null> {
  const name = await storageName(id);
  const c = kv();
  if (c) {
    const res = await fetchImpl(`${c.url}/get/${name}`, { headers: { authorization: `Bearer ${c.token}` }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`store ${res.status}`);
    return parseRecord(((await res.json()) as { result: string | null }).result);
  }
  const res = await fetchImpl(TEXTDB + name, { headers: { accept: "text/plain" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`store ${res.status}`);
  return parseRecord(await res.text());
}

async function writeRaw(id: string, value: string) {
  const name = await storageName(id);
  const c = kv();
  if (c) {
    const res = await fetchImpl(`${c.url}/pipeline`, { method: "POST", headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" }, body: JSON.stringify([["SET", name, value, "EX", 400 * 86400]]), signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`store ${res.status}`);
    return;
  }
  const res = await fetchImpl(TEXTDB + name, { method: "POST", headers: { "content-type": "text/plain" }, body: value, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`store ${res.status}`);
}

/**
 * Saves a new backup. `base` is the version the device merged with; a different stored version means
 * another device wrote in between, so the caller gets 409 and the current record to merge again.
 */
export async function writeRecord(id: string, blob: string, base: number | null, now = Date.now()): Promise<{ ok: true; record: SyncRecord } | { ok: false; current: SyncRecord }> {
  const current = await readRecord(id);
  if (current && base !== null && base !== current.version) return { ok: false, current };
  const record: SyncRecord = { version: (current?.version ?? 0) + 1, blob, updatedAt: now };
  await writeRaw(id, JSON.stringify(record));
  return { ok: true, record };
}

/** Revoke: the stored backup is replaced by a tombstone, so the code finds nothing any more. */
export async function revokeRecord(id: string, now = Date.now()) {
  await writeRaw(id, JSON.stringify({ revoked: true, at: now }));
}

/** The encrypted envelope the app sends: { v: 1, iv, ct, z? }, base64 fields only. */
export function validBlob(blob: unknown): blob is string {
  if (typeof blob !== "string" || blob.length < 20 || blob.length > SYNC_MAX_BYTES) return false;
  try {
    const e = JSON.parse(blob) as Record<string, unknown>;
    const b64 = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9+/=]+$/.test(v);
    return e.v === 1 && b64(e.iv) && b64(e.ct) && (e.z === undefined || e.z === "gzip" || e.z === "none") && Object.keys(e).length <= 4;
  } catch { return false; }
}
