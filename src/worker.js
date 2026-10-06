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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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
