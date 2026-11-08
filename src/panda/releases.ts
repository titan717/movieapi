/**
 * Release mirror (Panda v1.1.8): GitHub allows 60 unauthenticated API calls per hour per IP, which
 * shared mobile carrier IPs exhaust quickly. The app asks GitHub first and falls back to this mirror,
 * which keeps a 10-minute in-memory copy and uses GITHUB_TOKEN (server env only) when it is set.
 */
const REPO = "titan717/Panda.fun";
const TTL = 10 * 60_000;

export type MirrorRelease = { tag_name: string; name: string | null; body: string | null; published_at: string; html_url: string; assets: { name: string; browser_download_url: string; size: number }[] };

const memo = new Map<string, { at: number; data: MirrorRelease }>();

export const isReleaseTag = (t: string) => /^v\d+\.\d+\.\d+$/.test(t);

export async function mirrorRelease(tag: "latest" | string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<MirrorRelease | null> {
  const hit = memo.get(tag);
  if (hit && now - hit.at < TTL) return hit.data;
  const path = tag === "latest" ? "releases/latest" : `releases/tags/${tag}`;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "panda-api" };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try { res = await fetcher(`https://api.github.com/repos/${REPO}/${path}`, { headers, signal: AbortSignal.timeout(8000) }); }
  catch { if (hit) return hit.data; throw new Error("GitHub unreachable"); }
  if (res.status === 404) return null;
  if (!res.ok) { if (hit) return hit.data; throw new Error(`GitHub ${res.status}`); }
  const r = (await res.json()) as MirrorRelease;
  const data: MirrorRelease = {
    tag_name: r.tag_name, name: r.name ?? null, body: r.body ?? null, published_at: r.published_at, html_url: r.html_url,
    assets: (r.assets ?? []).map((a) => ({ name: a.name, browser_download_url: a.browser_download_url, size: a.size }))
  };
  memo.set(tag, { at: now, data });
  return data;
}

export function clearReleaseMemo() { memo.clear(); }
