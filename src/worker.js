/**
 * Gate of All Nations — Persepolis brick design showcase.
 * Serves the static site from ./public.
 *
 * Restricted-jurisdiction controls
 * --------------------------------
 * All requests are geolocated at Cloudflare's edge (request.cf). Visitors in
 * jurisdictions on Stripe's Restricted Businesses list receive HTTP 451 and
 * no site content:
 *   - Countries: Iran (IR), Cuba (CU), North Korea (KP), Syria (SY)
 *   - Ukraine regions: Crimea (UA-43), Sevastopol (UA-40),
 *     Donetsk (UA-14), Luhansk (UA-09)
 *
 * Verification hook: appending ?geo-demo=<code> (e.g. ?geo-demo=IR or
 * ?geo-demo=UA-14) simulates a visitor from that jurisdiction so the block
 * can be demonstrated and audited from anywhere. The hook can only FORCE the
 * block path — it can never bypass a real geolocation block.
 */

const BLOCKED_COUNTRIES = new Set(["IR", "CU", "KP", "SY"]);
const BLOCKED_UA_REGIONS = new Set(["14", "09", "40", "43"]);

function restrictedJurisdiction(request, url) {
  const cf = request.cf || {};
  // Real geolocation first — the demo hook can never override a real block.
  if (BLOCKED_COUNTRIES.has(cf.country)) return cf.country;
  if (cf.country === "UA" && BLOCKED_UA_REGIONS.has(String(cf.regionCode))) {
    return `UA-${cf.regionCode}`;
  }
  // Transparent demo/verification hook.
  const demo = (url.searchParams.get("geo-demo") || "").toUpperCase();
  if (BLOCKED_COUNTRIES.has(demo)) return demo;
  const uaDemo = demo.match(/^UA-(\d{2})$/);
  if (uaDemo && BLOCKED_UA_REGIONS.has(uaDemo[1])) return demo;
  return null;
}

function blockedResponse(code) {
  const body = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not available in your region</title>
<style>body{font-family:Georgia,serif;background:#201712;color:#efe4c9;display:grid;place-items:center;min-height:100vh;margin:0;padding:1.5rem;text-align:center}h1{font-weight:400;color:#e7d7ac}p{max-width:34rem;line-height:1.7;color:rgba(239,228,201,.75)}</style>
</head><body><div>
<h1>Not available in your region</h1>
<p>This website is not available in your jurisdiction (${code}) due to legal and
regulatory restrictions. No products or services are offered to, from, or within
this jurisdiction.</p>
</div></body></html>`;
  return new Response(body, {
    status: 451,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Geo-Block": code,
      "Cache-Control": "no-store"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const blocked = restrictedJurisdiction(request, url);
    if (blocked) return blockedResponse(blocked);
    return env.ASSETS.fetch(request);
  }
};
