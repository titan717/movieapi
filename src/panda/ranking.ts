/**
 * Community source ranking (v1.2.0): GET /panda/sources/ranking.
 *
 * Every Panda client reports the outcome of a play: `ok` when the source started playback, or an
 * issue from "Report an Issue" / the ad shield. Outcomes are counted per source per UTC hour and
 * ranked by the Wilson score lower bound (95 %) over time-decayed counts (half-life 72 h), so one
 * bad evening fades within days and a source with few reports is not ranked on luck.
 *
 * The live health probe adds a small fresh prior (healthy = 2 successes, degraded = 1 + 1,
 * down = 3 failures) so a provider that is down right now drops even before anyone reports it.
 *
 * Storage: counts live in instance memory, and are also written to a Redis REST store when
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (or Vercel KV's KV_REST_API_URL /
 * KV_REST_API_TOKEN) are configured, so every instance shares one ranking (docs/DECISIONS.md D-115).
 */
export const HALF_LIFE_H = 72;
export const WINDOW_H = 14 * 24;
const HOUR = 3_600_000;

/** Issues that mean "this source failed"; `subs` counts half (the source's own subtitle menu). */
export const FAILURE_WEIGHT: Record<string, number> = { noplay: 1, wrong: 1, sync: 1, popups: 1, subs: 0.5 };
export const SOURCE_IDS = ["cinesrc", "vidy", "vidyanime", "vidlink"] as const;
export type RankedSourceId = (typeof SOURCE_IDS)[number];

/**
 * Ad tiers (Panda v1.2.4, Panda.fun docs/SOURCES.md): measured popups, top-level navigations and ad
 * requests per source. Ranking sorts by tier first; community scores reorder only inside a tier.
 * Updated by the weekly "Source ad score" workflow in Panda.fun.
 */
export const SOURCE_TIERS: Record<RankedSourceId, { tier: 1 | 2 | 3 | 4; popups: number; navigations: number; adRequests: number; sandbox: boolean; measuredAt: string }> = {
  cinesrc: { tier: 1, popups: 0, navigations: 0, adRequests: 3, sandbox: true, measuredAt: "2026-11-09" },
  vidy: { tier: 2, popups: 0, navigations: 0, adRequests: 1, sandbox: false, measuredAt: "2026-11-09" },
  vidyanime: { tier: 2, popups: 0, navigations: 0, adRequests: 1, sandbox: false, measuredAt: "2026-11-09" },
  vidlink: { tier: 3, popups: 1, navigations: 0, adRequests: 21, sandbox: false, measuredAt: "2026-11-09" }
};

type Bucket = { ok: number; bad: number };
/** source → hour index → counts */
const mem = new Map<string, Map<number, Bucket>>();

/** Wilson score interval lower bound for `ok` successes out of `n` trials (z = 1.96). */
export function wilson(ok: number, n: number, z = 1.96) {
  if (n <= 0) return 0;
  const p = ok / n, z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n);
}

export const decay = (ageH: number) => Math.pow(0.5, Math.max(0, ageH) / HALF_LIFE_H);

export function recordOutcome(source: string, issue: string, now = Date.now(), store = mem) {
  if (!(SOURCE_IDS as readonly string[]).includes(source)) return false;
  const ok = issue === "ok" ? 1 : 0, bad = FAILURE_WEIGHT[issue] ?? 0;
  if (!ok && !bad) return false;
  const h = Math.floor(now / HOUR);
  const per = store.get(source) ?? new Map<number, Bucket>();
  const b = per.get(h) ?? { ok: 0, bad: 0 };
  b.ok += ok; b.bad += bad;
  per.set(h, b);
  for (const k of per.keys()) if (k < h - WINDOW_H) per.delete(k);
  store.set(source, per);
  void kvWrite(source, h, ok, bad);
  return true;
}

export type Health = { id: string; state: "healthy" | "degraded" | "down" };
export type RankEntry = {
  id: RankedSourceId; rank: number;
  /** Wilson lower bound, 0–1. */
  score: number;
  /** Decayed success share, 0–1, for the "96 % reliable" label (null until there is data). */
  reliability: number | null;
  plays: number; reports: number; reports24h: number;
  state: Health["state"] | null;
  /** Ad tier (1 cleanest … 4 ad-heavy) and the measurement behind it. */
  tier: 1 | 2 | 3 | 4;
  ads: { popups: number; navigations: number; adRequests: number; sandbox: boolean; measuredAt: string };
};

const PRIOR: Record<Health["state"], Bucket> = { healthy: { ok: 2, bad: 0 }, degraded: { ok: 1, bad: 1 }, down: { ok: 0, bad: 3 } };

export function rank(buckets: Map<string, Map<number, Bucket>>, health: Health[], now = Date.now()): RankEntry[] {
  const h0 = Math.floor(now / HOUR);
  const out = SOURCE_IDS.map((id) => {
    let ok = 0, bad = 0, plays = 0, reports = 0, reports24h = 0;
    for (const [h, b] of buckets.get(id) ?? []) {
      const age = h0 - h;
      if (age > WINDOW_H) continue;
      const w = decay(age);
      ok += b.ok * w; bad += b.bad * w;
      plays += b.ok; reports += Math.ceil(b.bad);
      if (age < 24) reports24h += Math.ceil(b.bad);
    }
    const state = health.find((x) => x.id === id)?.state ?? null;
    const observed = ok + bad;
    const prior = state ? PRIOR[state] : { ok: 0, bad: 0 };
    const n = observed + prior.ok + prior.bad;
    return {
      id, rank: 0,
      score: Math.round(wilson(ok + prior.ok, n) * 1000) / 1000,
      reliability: observed >= 1 ? Math.round((ok / observed) * 100) / 100 : null,
      plays, reports, reports24h, state,
      tier: SOURCE_TIERS[id].tier,
      ads: (({ tier: _t, ...ads }) => ads)(SOURCE_TIERS[id])
    };
  });
  // a source that is down right now goes last; otherwise a cleaner ad tier always wins; the community score reorders only inside a tier, and ties keep
  // the registry order (CineSrc first, the blueprint's default)
  out.sort((a, b) => Number(a.state === "down") - Number(b.state === "down") || a.tier - b.tier || b.score - a.score || SOURCE_IDS.indexOf(a.id) - SOURCE_IDS.indexOf(b.id));
  out.forEach((x, i) => { x.rank = i + 1; });
  return out;
}

/* ---------------- shared store (Redis REST, optional) ---------------- */

function kv() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export const kvConfigured = () => Boolean(kv());

async function kvPipeline(cmds: (string | number)[][]) {
  const c = kv();
  if (!c) return null;
  const res = await fetch(`${c.url}/pipeline`, { method: "POST", headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" }, body: JSON.stringify(cmds), signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`kv ${res.status}`);
  return (await res.json()) as { result: unknown }[];
}

async function kvWrite(source: string, h: number, ok: number, bad: number) {
  if (!kv()) return;
  const key = `panda:rank:${source}`;
  const cmds: (string | number)[][] = [];
  if (ok) cmds.push(["HINCRBYFLOAT", key, `${h}:ok`, ok]);
  if (bad) cmds.push(["HINCRBYFLOAT", key, `${h}:bad`, bad]);
  cmds.push(["EXPIRE", key, WINDOW_H * 3600]);
  await kvPipeline(cmds).catch(() => undefined);
}

let shared: { at: number; value: Map<string, Map<number, Bucket>> } | null = null;

/** Buckets to rank: the shared store when configured (cached 60 s), else this instance's memory. */
export async function buckets(now = Date.now()): Promise<Map<string, Map<number, Bucket>>> {
  if (!kv()) return mem;
  if (shared && now - shared.at < 60_000) return shared.value;
  try {
    const res = await kvPipeline(SOURCE_IDS.map((id) => ["HGETALL", `panda:rank:${id}`]));
    const value = new Map<string, Map<number, Bucket>>();
    SOURCE_IDS.forEach((id, i) => {
      const flat = (res?.[i]?.result ?? []) as string[];
      const per = new Map<number, Bucket>();
      for (let j = 0; j + 1 < flat.length; j += 2) {
        const [hs, kind] = flat[j]!.split(":");
        const h = Number(hs), v = Number(flat[j + 1]);
        if (!Number.isFinite(h) || !Number.isFinite(v)) continue;
        const b = per.get(h) ?? { ok: 0, bad: 0 };
        if (kind === "ok") b.ok += v; else if (kind === "bad") b.bad += v;
        per.set(h, b);
      }
      value.set(id, per);
    });
    shared = { at: now, value };
    return value;
  } catch { return mem; }
}

/** Test hook. */
export function resetRanking() { mem.clear(); shared = null; }
