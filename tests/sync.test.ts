import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { SYNC_MISS_LIMIT, checkClient, recordMiss, resetSyncGuards, setSyncFetch, storageName, validBlob } from "../src/panda/sync.js";

const base: Config = {
  apiKeys: new Set(), authRequired: false, rateLimit: 1000, rateWindowMs: 60_000,
  tvmaze: { baseUrl: "https://api.tvmaze.com", userAgent: "t", timeoutMs: 1000 },
  tmdb: { accessToken: "tok", baseUrl: "https://api.themoviedb.org/3", timeoutMs: 1000 },
  vidy: { baseUrl: "https://vidy.st", moviePath: "/movie/{tmdbId}", tvPath: "/tv/{tmdbId}/{season}/{episode}" },
  corsOrigin: "*", port: 3000
};

const ID = "0123456789abcdef0123456789abcdef";
const blob = JSON.stringify({ v: 1, iv: "AAAAAAAAAAAAAAAA", ct: "c2VjcmV0IGRhdGEgaGVyZQ==", z: "gzip" });
let mem: Map<string, string>;
let calls: string[];

beforeEach(() => {
  resetSyncGuards();
  mem = new Map(); calls = [];
  setSyncFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push(`${init?.method ?? "GET"} ${url}`);
    const name = url.split("/api/data/")[1]!;
    if (init?.method === "POST") { mem.set(name, String(init.body)); return new Response("ok"); }
    return new Response(mem.get(name) ?? "");
  }) as typeof fetch);
});
afterEach(() => setSyncFetch(null));

const app = () => createApp(base);
const req = (method: string, body?: unknown, ip = "1.2.3.4", id = ID) => app().request(`/api/v1/panda/sync/${id}`, {
  method, headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: body === undefined ? undefined : JSON.stringify(body)
});

describe("sync store", () => {
  it("stores ciphertext under a derived name, never the lookup id", async () => {
    const r = await req("PUT", { blob, base: null });
    expect(r.status).toBe(200);
    expect((await r.json()).data.version).toBe(1);
    const name = await storageName(ID);
    expect(name).toMatch(/^panda-sync-v1-[a-f0-9]{40}$/);
    expect(name).not.toContain(ID);
    expect(calls.some((c) => c.includes(ID))).toBe(false);
    expect(JSON.parse(mem.get(name)!).blob).toBe(blob);
  });

  it("reads back, bumps versions and reports conflicts", async () => {
    await req("PUT", { blob, base: null });
    const g = await req("GET");
    expect(g.status).toBe(200);
    expect(g.headers.get("cache-control")).toBe("no-store");
    const rec = (await g.json()).data;
    expect(rec.version).toBe(1); expect(rec.blob).toBe(blob);
    expect((await req("PUT", { blob, base: 1 })).status).toBe(200);
    const stale = await req("PUT", { blob, base: 1 });
    expect(stale.status).toBe(409);
    expect((await stale.json()).data.version).toBe(2);
  });

  it("revokes: the code then finds nothing and old devices learn it was revoked", async () => {
    await req("PUT", { blob, base: null });
    expect((await req("DELETE")).status).toBe(200);
    expect((await req("GET")).status).toBe(404);
    const put = await req("PUT", { blob, base: 1 });
    expect(put.status).toBe(410);
  });

  it("rejects bad ids and anything that is not an encrypted envelope", async () => {
    expect((await req("GET", undefined, "1.2.3.4", "ABC")).status).toBe(400);
    expect((await req("PUT", { blob: "{\"name\":\"plain text profile\"}", base: null })).status).toBe(400);
    expect((await req("PUT", { blob, base: 0 })).status).toBe(400);
    expect(validBlob(blob)).toBe(true);
    expect(validBlob(JSON.stringify({ v: 1, iv: "a", ct: "b", extra: 1, more: 2 }))).toBe(false);
  });

  it("locks a client out after repeated wrong codes, without affecting others", async () => {
    for (let i = 0; i < SYNC_MISS_LIMIT - 1; i++) {
      const r = await req("GET", undefined, "9.9.9.9");
      expect(r.status).toBe(404);
      expect((await r.json()).error.triesLeft).toBe(SYNC_MISS_LIMIT - 1 - i);
    }
    expect((await req("GET", undefined, "9.9.9.9")).status).toBe(404);
    const locked = await req("GET", undefined, "9.9.9.9");
    expect(locked.status).toBe(429);
    expect((await locked.json()).error.code).toBe("SYNC_LOCKED");
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(800);
    expect((await req("GET", undefined, "8.8.8.8")).status).toBe(404);
  });

  it("rate limits bursts per client", () => {
    const now = 1_000_000_000_000;
    for (let i = 0; i < 30; i++) expect(checkClient("x", now)).toBeNull();
    expect(checkClient("x", now)?.reason).toBe("rate");
    expect(checkClient("x", now + 60_000)).toBeNull();
    expect(recordMiss("y", now)).toBe(SYNC_MISS_LIMIT - 1);
  });
});
