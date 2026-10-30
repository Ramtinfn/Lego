/**
 * Shahyad — Azadi Tower brick models storefront (persiainbricks.com.au).
 *
 * Serves the static site from ./public and handles checkout by creating a
 * Stripe Checkout session (hosted payment page). Prices are parts cost + 15%;
 * shipping is calculated per destination zone and added as a separate line.
 *
 * Secrets: STRIPE_SECRET_KEY (set in the Worker's Settings → Variables and
 * Secrets — the same Stripe account as persiainbricks.com).
 */

/**
 * Restricted-jurisdiction controls (Stripe Restricted Businesses list).
 * Identical to persiainbricks.com: every request is geolocated at the edge;
 * visitors in restricted jurisdictions receive HTTP 451 — no site content and
 * no checkout. Countries: Iran (IR), Cuba (CU), North Korea (KP), Syria (SY).
 * Ukraine regions: Crimea (UA-43), Sevastopol (UA-40), Donetsk (UA-14),
 * Luhansk (UA-09). The ?geo-demo hook can only FORCE the block, never bypass
 * a real geolocation block. The shipping-country allowlist below contains no
 * restricted jurisdiction, so checkout cannot collect an address in one.
 */
const BLOCKED_COUNTRIES = new Set(["IR", "CU", "KP", "SY"]);
const BLOCKED_UA_REGIONS = new Set(["14", "09", "40", "43"]);

function restrictedJurisdiction(request, url) {
  const cf = request.cf || {};
  if (BLOCKED_COUNTRIES.has(cf.country)) return cf.country;
  if (cf.country === "UA" && BLOCKED_UA_REGIONS.has(String(cf.regionCode))) {
    return `UA-${cf.regionCode}`;
  }
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
<style>body{font-family:Georgia,serif;background:#20252e;color:#f1eee6;display:grid;place-items:center;min-height:100vh;margin:0;padding:1.5rem;text-align:center}h1{font-weight:400}p{max-width:34rem;line-height:1.7;opacity:.8}</style>
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

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

// Shipping & handling zones. Rates in AUD cents PER SET: Australia Post
// up-to-5kg parcel bands (Oct 2026) plus packaging, transit cover and
// payment-processing costs (card surcharging is banned in AU from 1 Oct 2026,
// so processing cost is part of handling).
const ZONES = {
  AU:    { label: "Australia" },
  NZ:    { label: "New Zealand" },
  ASIA:  { label: "Asia" },
  WORLD: { label: "Rest of the world" }
};

const COUNTRY_ZONE = {
  AU: "AU",
  NZ: "NZ",
  JP: "ASIA", KR: "ASIA", SG: "ASIA", MY: "ASIA", TH: "ASIA", VN: "ASIA",
  PH: "ASIA", ID: "ASIA", IN: "ASIA", HK: "ASIA", TW: "ASIA",
  US: "WORLD", CA: "WORLD", GB: "WORLD", IE: "WORLD",
  DE: "WORLD", FR: "WORLD", NL: "WORLD", BE: "WORLD", LU: "WORLD",
  SE: "WORLD", NO: "WORLD", DK: "WORLD", FI: "WORLD",
  IT: "WORLD", ES: "WORLD", PT: "WORLD", AT: "WORLD", CH: "WORLD",
  PL: "WORLD", CZ: "WORLD", GR: "WORLD", RO: "WORLD", HU: "WORLD",
  TR: "WORLD", AE: "WORLD", SA: "WORLD", QA: "WORLD", KW: "WORLD",
  BH: "WORLD", OM: "WORLD", JO: "WORLD", IL: "WORLD",
  ZA: "WORLD", EG: "WORLD", MA: "WORLD", KE: "WORLD", NG: "WORLD",
  BR: "WORLD", MX: "WORLD", AR: "WORLD", CL: "WORLD", CO: "WORLD", PE: "WORLD"
};

const COUNTRY_NAMES = {
  AU:"Australia", NZ:"New Zealand", JP:"Japan", KR:"South Korea", SG:"Singapore",
  MY:"Malaysia", TH:"Thailand", VN:"Vietnam", PH:"Philippines", ID:"Indonesia",
  IN:"India", HK:"Hong Kong", TW:"Taiwan", US:"United States", CA:"Canada",
  GB:"United Kingdom", IE:"Ireland", DE:"Germany", FR:"France", NL:"Netherlands",
  BE:"Belgium", LU:"Luxembourg", SE:"Sweden", NO:"Norway", DK:"Denmark",
  FI:"Finland", IT:"Italy", ES:"Spain", PT:"Portugal", AT:"Austria",
  CH:"Switzerland", PL:"Poland", CZ:"Czechia", GR:"Greece", RO:"Romania",
  HU:"Hungary", TR:"Türkiye", AE:"United Arab Emirates", SA:"Saudi Arabia",
  QA:"Qatar", KW:"Kuwait", BH:"Bahrain", OM:"Oman", JO:"Jordan", IL:"Israel",
  ZA:"South Africa", EG:"Egypt", MA:"Morocco", KE:"Kenya", NG:"Nigeria",
  BR:"Brazil", MX:"Mexico", AR:"Argentina", CL:"Chile", CO:"Colombia", PE:"Peru"
};

// Prices in AUD cents: parts cost / 0.85 (15% margin), rounded to whole dollars.
// Tower: 45000/0.85≈52900; 79000/0.85≈92900.
// Square: 72000/0.85≈84700; 140000/0.85≈164700.
const PRODUCTS = {
  tower: {
    name: "Shahyad Tower — Compact Model",
    pieces: 2660,
    size: "25.6 × 44.8 × 30.4 cm (32 × 56 studs)",
    editions: {
      compat:  { name: "Compatible bricks edition", unitAmount: 52900 },
      genuine: { name: "Genuine LEGO® elements edition", unitAmount: 92900 }
    },
    shipping: { AU: 3900, NZ: 11500, ASIA: 15500, WORLD: 20500 },
    description:
      "2,660-piece brick model of the Shahyad (Azadi) Tower on its display footing. " +
      "Step-by-step building instructions included. Delivery within 35 calendar days in Australia; " +
      "international orders take longer (transfer and customs)."
  },
  square: {
    name: "Shahyad Square — Full Landscaped Model",
    pieces: 3262,
    size: "76.8 × 64.0 × 30.4 cm (96 × 80 studs)",
    editions: {
      compat:  { name: "Compatible bricks edition", unitAmount: 84700 },
      genuine: { name: "Genuine LEGO® elements edition", unitAmount: 164700 }
    },
    shipping: { AU: 5500, NZ: 13500, ASIA: 18500, WORLD: 23900 },
    description:
      "3,262-piece brick model of the Shahyad (Azadi) Tower on its full square with " +
      "lamp posts. This edition ships without the decorative trees shown in renders. " +
      "Step-by-step building instructions included. Delivery within 35 calendar days in Australia; " +
      "international orders take longer (transfer and customs)."
  }
};

const MAX_QUANTITY = 3;
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const blocked = restrictedJurisdiction(request, url);
    if (blocked) return blockedResponse(blocked);

    if (url.pathname === "/api/catalogue") {
      return json({
        salesEnabled: (env.SALES_ENABLED || "").toLowerCase() === "true",
        currency: "aud",
        products: PRODUCTS,
        zones: ZONES,
        countryZone: COUNTRY_ZONE,
        countryNames: COUNTRY_NAMES
      });
    }

    if (url.pathname === "/api/checkout") {
      if (request.method !== "POST") return json({ error: "Use POST." }, 405);
      return handleCheckout(request, env, url.origin);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleCheckout(request, env, origin) {
  if ((env.SALES_ENABLED || "").toLowerCase() !== "true") {
    return json({ error: "Ordering is not open yet. Please check back soon." }, 410);
  }
  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: "Payments aren't configured yet. Site owner: set the STRIPE_SECRET_KEY secret." }, 503);
  }

  let body = {};
  try { body = await request.json(); } catch { /* validated below */ }

  const product = PRODUCTS[body.model];
  if (!product) return json({ error: "Unknown model." }, 400);
  const edition = product.editions[body.edition];
  if (!edition) return json({ error: "Unknown edition." }, 400);
  const country = String(body.country || "").toUpperCase();
  const zone = COUNTRY_ZONE[country];
  if (!zone) return json({ error: "Please choose your delivery country." }, 400);
  const quantity = parseInt(body.quantity, 10);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return json({ error: `Quantity must be between 1 and ${MAX_QUANTITY}.` }, 400);
  }

  const shippingAmount = product.shipping[zone] * quantity;

  const params = new URLSearchParams();
  params.append("mode", "payment");
  params.append("success_url", `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`);
  params.append("cancel_url", `${origin}/cancel.html`);
  params.append("line_items[0][quantity]", String(quantity));
  params.append("line_items[0][price_data][currency]", "aud");
  params.append("line_items[0][price_data][unit_amount]", String(edition.unitAmount));
  params.append("line_items[0][price_data][product_data][name]", `${product.name} — ${edition.name}`);
  params.append("line_items[0][price_data][product_data][description]", product.description);
  params.append("line_items[0][price_data][product_data][images][0]",
    `${origin}/img/${body.model === "square" ? "square-main" : "tower-main"}.jpg`);
  params.append("phone_number_collection[enabled]", "true");
  // Address collection restricted to the destination the customer chose,
  // priced for that zone. Never a restricted jurisdiction.
  params.append("shipping_address_collection[allowed_countries][]", country);
  params.append("shipping_options[0][shipping_rate_data][display_name]",
    `Tracked shipping & handling to ${COUNTRY_NAMES[country]}`);
  params.append("shipping_options[0][shipping_rate_data][type]", "fixed_amount");
  params.append("shipping_options[0][shipping_rate_data][fixed_amount][amount]", String(shippingAmount));
  params.append("shipping_options[0][shipping_rate_data][fixed_amount][currency]", "aud");
  params.append("metadata[model]", body.model);
  params.append("metadata[edition]", body.edition);
  params.append("metadata[destination]", country);
  params.append("metadata[delivery_terms]", "AU: 35 calendar days; international: longer (transfer/customs)");

  const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });
  const session = await resp.json();
  if (!resp.ok) {
    const message = (session && session.error && session.error.message) || "The payment service rejected the request.";
    console.log("Stripe error:", message);
    return json({ error: message }, 502);
  }
  return json({ url: session.url });
}
