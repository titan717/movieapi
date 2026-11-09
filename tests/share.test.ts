import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { intentLink, renderSync } from "../src/panda/share.js";

const base: Config = {
  apiKeys: new Set(), authRequired: false, rateLimit: 1000, rateWindowMs: 60_000,
  tvmaze: { baseUrl: "https://api.tvmaze.com", userAgent: "t", timeoutMs: 1000 },
  tmdb: { accessToken: "tok", baseUrl: "https://api.themoviedb.org/3", timeoutMs: 1000 },
  vidy: { baseUrl: "https://vidy.st", moviePath: "/movie/{tmdbId}", tvPath: "/tv/{tmdbId}/{season}/{episode}" },
  corsOrigin: "*", port: 3000
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

describe("share pages", () => {
  it("renders a title card with Open Graph tags and an app intent", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/movie/550?")) return json({ id: 550, title: "Fight <Club>", release_date: "1999-10-15", poster_path: "/p.jpg", backdrop_path: "/b.jpg", vote_average: 8.4, genres: [{ id: 18, name: "Drama" }], overview: "An insomniac office worker…" });
      return json({});
    }));
    const res = await createApp(base).request("/p/movie/550");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("script-src 'none'");
    const html = await res.text();
    expect(html).toContain("<h1>Fight &lt;Club&gt;</h1>");
    expect(html).toContain('property="og:title" content="Fight &lt;Club&gt; (1999)"');
    expect(html).toContain('property="og:image" content="https://image.tmdb.org/t/p/');
    expect(html).toContain('og:url" content="https://apikinoma.vercel.app/p/movie/550"');
    expect(html).toContain("intent://title/movie/550#Intent;scheme=pandafun;package=com.kinoma.tv;");
    expect(html).not.toMatch(/<script/);
  });

  it("answers bad or unknown titles with a 404 page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ status_message: "not found" }, 404)));
    expect((await createApp(base).request("/p/person/1")).status).toBe(404);
    expect((await createApp(base).request("/p/movie/abc")).status).toBe(404);
    const r = await createApp(base).request("/p/tv/999999");
    expect(r.status).toBe(404);
    expect(await r.text()).toContain("isn't available");
  });

  it("serves the sync page with only its own hashed script", async () => {
    const res = await createApp(base).request("/p/sync");
    expect(res.status).toBe(200);
    const html = await res.text();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]!;
    const hash = createHash("sha256").update(script).digest("base64");
    expect(res.headers.get("content-security-policy")).toContain(`'sha256-${hash}'`);
    expect(html).toBe(renderSync());
    expect(script).toContain("location.hash");
  });

  it("builds intent links with a download fallback", () => {
    expect(intentLink("sync/ABCDEFGHJKMN")).toBe("intent://sync/ABCDEFGHJKMN#Intent;scheme=pandafun;package=com.kinoma.tv;S.browser_fallback_url=https%3A%2F%2Fgithub.com%2Ftitan717%2FPanda.fun%2Freleases%2Flatest;end");
  });
});
