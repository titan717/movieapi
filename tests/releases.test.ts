import { beforeEach, describe, expect, it } from "vitest";
import { clearReleaseMemo, isReleaseTag, mirrorRelease } from "../src/panda/releases.js";

const rel = { tag_name: "v1.1.7", name: "Panda.fun v1.1.7", body: "## What's new in 1.1.7", published_at: "2026-11-08T00:00:00Z", html_url: "https://github.com/x", assets: [{ name: "panda.apk", browser_download_url: "https://github.com/a.apk", size: 10, extra: 1 }] };
const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("release mirror", () => {
  beforeEach(() => clearReleaseMemo());
  it("validates tags", () => {
    expect(isReleaseTag("v1.1.7")).toBe(true);
    expect(isReleaseTag("1.1.7")).toBe(false);
    expect(isReleaseTag("v1.1.7/../x")).toBe(false);
  });
  it("returns a trimmed release and caches it", async () => {
    const a = await mirrorRelease("latest", reply(200, rel), 1000);
    expect(a?.tag_name).toBe("v1.1.7");
    expect(a?.assets[0]).toEqual({ name: "panda.apk", browser_download_url: "https://github.com/a.apk", size: 10 });
    const b = await mirrorRelease("latest", reply(500, {}), 2000);
    expect(b?.tag_name).toBe("v1.1.7");
  });
  it("serves the stale copy when GitHub rate-limits, and null for unknown tags", async () => {
    await mirrorRelease("latest", reply(200, rel), 0);
    expect((await mirrorRelease("latest", reply(403, {}), 11 * 60_000))?.tag_name).toBe("v1.1.7");
    expect(await mirrorRelease("v9.9.9", reply(404, {}), 0)).toBeNull();
    await expect(mirrorRelease("v9.9.8", reply(403, {}), 0)).rejects.toThrow();
  });
});
