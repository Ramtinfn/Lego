/**
 * Gate of All Nations — Persepolis brick set storefront.
 *
 * Cloudflare Worker that:
 *   1. serves the static site from ./public (via the ASSETS binding),
 *   2. exposes GET  /api/product   — the product name/price the page displays,
 *   3. exposes POST /api/checkout  — creates a Stripe Checkout session and
 *      returns its URL, so the customer pays on Stripe's hosted page.
 *
 * Configuration (see wrangler.jsonc and the README):
 *   PRODUCT_NAME       - display name of the set
 *   CURRENCY           - ISO currency code, e.g. "aud"
 *   COMPAT_AMOUNT      - price of the compatible-bricks edition, in cents (80000 = A$800)
 *   GENUINE_AMOUNT     - price of the genuine LEGO-elements edition, in cents (200000 = A$2,000)
 *   STRIPE_SECRET_KEY  - secret, set with: npx wrangler secret put STRIPE_SECRET_KEY
 *   PAYMENT_LINK_URL_COMPAT / PAYMENT_LINK_URL_GENUINE
 *                      - optional alternative: Stripe Payment Link URLs per edition.
 *                        If set, checkout redirects there and no API key is needed.
 */

// Countries offered at Stripe checkout for the shipping address.
// Edit freely; codes are ISO 3166-1 alpha-2. (Stripe cannot collect
// addresses for a small number of sanctioned territories.)
const SHIPPING_COUNTRIES = [
  "AU", "NZ", "US", "CA", "GB", "IE",
  "DE", "FR", "NL", "BE", "LU", "SE", "NO", "DK", "FI",
  "IT", "ES", "PT", "AT", "CH", "PL", "CZ", "GR", "RO", "HU",
  "TR", "AE", "SA", "QA", "KW", "BH", "OM", "JO", "IL",
  "JP", "KR", "SG", "MY", "TH", "VN", "PH", "ID", "IN", "HK", "TW",
  "ZA", "EG", "MA", "KE", "NG",
  "BR", "MX", "AR", "CL", "CO", "PE"
];

const MAX_QUANTITY = 5;

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

/**
 * Restricted-jurisdiction controls (Stripe Restricted Businesses list).
 * Every request is geolocated at Cloudflare's edge; visitors in restricted
 * jurisdictions receive HTTP 451 and can reach neither the site nor checkout.
 * Countries: Iran (IR), Cuba (CU), North Korea (KP), Syria (SY).
 * Ukraine regions: Crimea (UA-43), Sevastopol (UA-40), Donetsk (UA-14),
 * Luhansk (UA-09). The ?geo-demo hook can only FORCE the block for
 * demonstration — it can never bypass a real geolocation block.
 * SHIPPING_COUNTRIES above is an allowlist and contains no restricted
 * jurisdiction, so checkout cannot collect a shipping address in one.
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

    if (url.pathname === "/api/product") {
      return handleProduct(env);
    }

    if (url.pathname === "/api/checkout") {
      if (request.method !== "POST") {
        return json({ error: "Use POST." }, 405);
      }
      return handleCheckout(request, env, url.origin);
    }

    // Everything else is the static site.
    return env.ASSETS.fetch(request);
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function productConfig(env) {
  const baseName = env.PRODUCT_NAME || "Gate of All Nations — Persepolis Brick Set";
  return {
    name: baseName,
    currency: (env.CURRENCY || "aud").toLowerCase(),
    variants: [
      {
        id: "compat",
        name: `${baseName} — Compatible bricks edition`,
        unitAmount: parseInt(env.COMPAT_AMOUNT || "80000", 10),
        description:
          "2,697-piece set in new, premium-quality compatible bricks. Delivery within 28 calendar days in Australia; international orders take longer (transfer and customs)."
      },
      {
        id: "genuine",
        name: `${baseName} — Genuine LEGO® elements edition`,
        unitAmount: parseInt(env.GENUINE_AMOUNT || "200000", 10),
        description:
          "2,697-piece set assembled from genuine, new LEGO® elements sourced at retail. An independent product, not endorsed by the LEGO Group. Delivery within 28 calendar days in Australia; international orders take longer (transfer and customs)."
      }
    ]
  };
}

function handleProduct(env) {
  const product = productConfig(env);
  return json({ name: product.name, currency: product.currency, variants: product.variants });
}

async function handleCheckout(request, env, origin) {
  // Sales are paused (LEGO Ideas licence window). Flip SALES_ENABLED to "true"
  // in wrangler.jsonc and redeploy to re-open ordering.
  if ((env.SALES_ENABLED || "").toLowerCase() !== "true") {
    return json({ error: "Ordering is not available." }, 410);
  }

  let quantity = 1;
  let variantId = "compat";
  try {
    const body = await request.json();
    quantity = parseInt(body.quantity, 10);
    if (typeof body.variant === "string") variantId = body.variant;
  } catch {
    /* fall through to validation */
  }

  const product = productConfig(env);
  const variant = product.variants.find((v) => v.id === variantId);
  if (!variant) {
    return json({ error: "Unknown edition selected." }, 400);
  }

  // Simplest path: per-edition Stripe Payment Links configured in the dashboard.
  const paymentLink =
    variantId === "genuine"
      ? env.PAYMENT_LINK_URL_GENUINE
      : env.PAYMENT_LINK_URL_COMPAT;
  if (paymentLink) {
    return json({ url: paymentLink });
  }

  if (!env.STRIPE_SECRET_KEY) {
    return json(
      {
        error:
          "Payments aren't configured yet. Site owner: set the STRIPE_SECRET_KEY secret " +
          "(npx wrangler secret put STRIPE_SECRET_KEY) or a PAYMENT_LINK_URL variable — see the README."
      },
      503
    );
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return json({ error: `Quantity must be between 1 and ${MAX_QUANTITY}.` }, 400);
  }

  // Stripe's REST API takes form-encoded bodies; no SDK needed in a Worker.
  const params = new URLSearchParams();
  params.append("mode", "payment");
  params.append("success_url", `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`);
  params.append("cancel_url", `${origin}/cancel.html`);
  params.append("line_items[0][quantity]", String(quantity));
  params.append("line_items[0][price_data][currency]", product.currency);
  params.append("line_items[0][price_data][unit_amount]", String(variant.unitAmount));
  params.append("line_items[0][price_data][product_data][name]", variant.name);
  params.append("line_items[0][price_data][product_data][description]", variant.description);
  params.append("line_items[0][price_data][product_data][images][0]", `${origin}/img/box-art.jpg`);
  params.append("phone_number_collection[enabled]", "true");
  SHIPPING_COUNTRIES.forEach((code) => {
    params.append("shipping_address_collection[allowed_countries][]", code);
  });
  params.append("metadata[edition]", variant.id);
  params.append("metadata[delivery_terms]", "AU: 28 calendar days; international: longer (transfer/customs)");

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const session = await stripeResponse.json();

  if (!stripeResponse.ok) {
    const message =
      (session && session.error && session.error.message) || "The payment service rejected the request.";
    console.log("Stripe error:", message);
    return json({ error: message }, 502);
  }

  return json({ url: session.url });
}
