import { createHash } from "node:crypto";
import { Hono } from "hono";
import type { PandaService, MediaType } from "./service.js";

/**
 * Public share pages for Panda (v1.2.4). Panda itself has no public web address, so links shared from the
 * app point here: /p/movie/550 is a small server-rendered title card (with Open Graph tags for chat
 * previews) whose button opens the title in the Android app, and /p/sync#CODE hands a sync code to the
 * app. The sync code stays in the URL fragment, which browsers never send to the server.
 */
export const APP_PACKAGE = "com.kinoma.tv";
export const DOWNLOAD_URL = "https://github.com/titan717/Panda.fun/releases/latest";

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** An Android intent link: opens Panda when installed, otherwise the download page. */
export const intentLink = (path: string) =>
  `intent://${path}#Intent;scheme=pandafun;package=${APP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(DOWNLOAD_URL)};end`;

const STYLE = `
*{box-sizing:border-box}html,body{margin:0;background:#07080c;color:#f7f5ff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.bg{position:fixed;inset:0;background-size:cover;background-position:center top;opacity:.35;filter:blur(2px)}
.bg:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,8,12,.35),#07080c 85%)}
main{position:relative;display:flex;gap:28px;max-width:860px;width:100%;align-items:flex-start}
.poster{width:220px;flex:none;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.6)}
.brand{display:flex;align-items:center;gap:8px;font-weight:800;letter-spacing:.02em;margin-bottom:18px;color:#d9ccff}
h1{margin:0 0 8px;font-size:34px;line-height:1.15}
.meta{color:rgba(247,245,255,.7);font-size:15px;margin-bottom:14px}
p{color:rgba(247,245,255,.82);line-height:1.55;font-size:16px;margin:0 0 22px}
.btns{display:flex;flex-wrap:wrap;gap:12px}
a.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border-radius:999px;font-weight:700;text-decoration:none;font-size:16px}
.primary{background:#fff;color:#000}.secondary{background:rgba(255,255,255,.12);color:#fff}
.note{margin-top:18px;font-size:13px;color:rgba(247,245,255,.55)}
.code{font-family:ui-monospace,"SF Mono","Roboto Mono",Menlo,monospace;font-size:30px;font-weight:700;letter-spacing:.12em;margin:6px 0 20px}
@media (max-width:640px){main{flex-direction:column;align-items:center;text-align:center}.poster{width:180px}.btns{justify-content:center}h1{font-size:28px}}
`;

const BRAND = `<div class="brand"><svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true"><circle cx="16" cy="15" r="10" fill="#171820" stroke="#f7f5ff" stroke-width="2.5"/><circle cx="48" cy="15" r="10" fill="#171820" stroke="#f7f5ff" stroke-width="2.5"/><rect x="11" y="12" width="42" height="42" rx="20" fill="#f7f5ff"/><ellipse cx="22" cy="30" rx="8" ry="11" transform="rotate(28 22 30)" fill="#171820"/><ellipse cx="42" cy="30" rx="8" ry="11" transform="rotate(-28 42 30)" fill="#171820"/><circle cx="24" cy="29" r="2.4" fill="#f7f5ff"/><circle cx="40" cy="29" r="2.4" fill="#f7f5ff"/><path d="M29 39c1.8-2.2 4.2-2.2 6 0-1 3.4-5 4.1-6 0Z" fill="#171820"/></svg>Panda</div>`;

const page = (head: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#07080c">${head}<style>${STYLE}</style></head><body>${body}</body></html>`;

/** Fills the code from the fragment; allowed by its hash in the page CSP (no other script runs). */
const SYNC_SCRIPT = `(function(){var c=(location.hash.slice(1)||"").toUpperCase().replace(/[^0-9A-Z]/g,"");var ok=/^[0-9A-Z]{12}$/.test(c);var el=document.getElementById("code"),a=document.getElementById("open"),m=document.getElementById("msg");if(!ok){el.textContent="No code in this link";a.style.display="none";m.textContent="Open Settings, Sync Code, Show my code on the device you came from and scan its QR again.";return;}var f=c.slice(0,4)+"-"+c.slice(4,8)+"-"+c.slice(8);el.textContent=f;a.href="intent://sync/"+c+"#Intent;scheme=pandafun;package=${APP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(DOWNLOAD_URL)};end";})();`;
const SYNC_HASH = createHash("sha256").update(SYNC_SCRIPT).digest("base64");

const csp = (script?: string) => `default-src 'none'; img-src https://image.tmdb.org; style-src 'unsafe-inline'; script-src ${script ? `'sha256-${script}'` : "'none'"}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

export function renderTitle(d: { type: MediaType; tmdbId: number; title: string; year: number | null; rating: number | null; poster: string | null; backdrop: string | null; overview: string | null; genres: string[] }, url: string) {
  const name = esc(d.title);
  const meta = [d.year ? String(d.year) : null, d.type === "tv" ? "Series" : "Movie", d.rating ? `★ ${d.rating.toFixed(1)}` : null, d.genres.slice(0, 3).join(", ") || null].filter(Boolean).join(" · ");
  const overview = d.overview ? esc(d.overview.length > 420 ? `${d.overview.slice(0, 417).trimEnd()}…` : d.overview) : "";
  const image = d.backdrop ?? d.poster;
  const head = `<title>${name} on Panda</title><meta name="description" content="${overview || `Watch ${name} on Panda`}">`
    + `<meta property="og:type" content="${d.type === "tv" ? "video.tv_show" : "video.movie"}"><meta property="og:title" content="${name}${d.year ? ` (${d.year})` : ""}"><meta property="og:description" content="${overview || `Watch ${name} on Panda`}"><meta property="og:url" content="${esc(url)}"><meta property="og:site_name" content="Panda">`
    + (image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(image)}">` : `<meta name="twitter:card" content="summary">`);
  const body = (d.backdrop ? `<div class="bg" style="background-image:url('${esc(d.backdrop)}')"></div>` : "")
    + `<main>${d.poster ? `<img class="poster" src="${esc(d.poster)}" alt="${name} poster">` : ""}<section>${BRAND}<h1>${name}</h1><div class="meta">${esc(meta)}</div>${overview ? `<p>${overview}</p>` : ""}`
    + `<div class="btns"><a class="btn primary" id="open" href="${esc(intentLink(`title/${d.type}/${d.tmdbId}`))}">Open in Panda</a><a class="btn secondary" href="${DOWNLOAD_URL}">Get Panda for Android TV</a></div>`
    + `<div class="note">Open this link on an Android phone or TV with Panda installed to go straight to the title.</div></section></main>`;
  return page(head, body);
}

export function renderSync() {
  const head = `<title>Restore Panda from a sync code</title><meta name="robots" content="noindex">`;
  const body = `<main><section>${BRAND}<h1>Restore your Panda</h1><p>This sync code brings your profiles, lists, settings and watch progress to this device.</p><div class="code" id="code" aria-live="polite">…</div>`
    + `<div class="btns"><a class="btn primary" id="open" href="${DOWNLOAD_URL}">Restore in Panda</a><a class="btn secondary" href="${DOWNLOAD_URL}">Get Panda for Android TV</a></div>`
    + `<div class="note" id="msg">No Panda on this device? In Panda open Settings, Sync Code, Restore from code and type the code above. The code never leaves this page: it is not sent to our server.</div></section></main><script>${SYNC_SCRIPT}</script>`;
  return page(head, body);
}

export function renderMissing() {
  return page(`<title>Panda</title><meta name="robots" content="noindex">`, `<main><section>${BRAND}<h1>This title isn't available</h1><p>The link may be incomplete or the title was removed from the catalogue.</p><div class="btns"><a class="btn secondary" href="${DOWNLOAD_URL}">Get Panda for Android TV</a></div></section></main>`);
}

export function createShareRoutes(panda: PandaService) {
  const app = new Hono();
  app.get("/sync", (c) => {
    c.header("content-security-policy", csp(SYNC_HASH));
    c.header("cache-control", "public, max-age=3600");
    return c.html(renderSync());
  });
  app.get("/:type/:id", async (c) => {
    c.header("content-security-policy", csp());
    const type = c.req.param("type");
    const id = Number(c.req.param("id"));
    if ((type !== "movie" && type !== "tv") || !Number.isInteger(id) || id <= 0 || id > 99_999_999) return c.html(renderMissing(), 404);
    try {
      const d = await panda.title(type, id);
      c.header("cache-control", "public, max-age=3600, s-maxage=86400");
      return c.html(renderTitle(d, `https://apikinoma.vercel.app/p/${type}/${id}`));
    } catch {
      c.header("cache-control", "no-store");
      return c.html(renderMissing(), 404);
    }
  });
  return app;
}
