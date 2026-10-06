# Gate of All Nations — Persepolis Brick Set storefront

A complete, deploy-ready store for your 2,697-piece Persepolis set:

- **Static site** in `public/` — bilingual (English + Farsi) landing page with your box art, renders and instruction pages, the "what Alexander burned, we rebuild — brick by brick" motto, shipping terms (28 calendar days in Australia, longer internationally), FAQ, and success/cancel pages.
- **Cloudflare Worker** in `src/worker.js` — serves the site and handles checkout by creating a **Stripe Checkout** session, so customers pay on Stripe's secure hosted page. You never touch card numbers, and Stripe emails the receipt.
- **Config** in `wrangler.jsonc` — product name, currency and price in one place.

---

## 1. Register your domain (Cloudflare Registrar)

1. Sign in (or sign up) at https://dash.cloudflare.com
2. In the left sidebar choose **Domain Registration → Register Domains**.
3. Search for the name you want (e.g. `gateofallnations.com`, `persepolisbricks.com.au` — note: `.com.au` requires an Australian ABN/ACN and is registered via an accredited .au registrar if Cloudflare doesn't offer it; `.com` works for everyone).
4. Add it to your cart and pay. Cloudflare sells domains at wholesale cost with free privacy, and the DNS is automatically set up on your account — nothing else to configure.

You can also deploy **before** buying a domain: every Worker gets a free `*.workers.dev` URL you can use to preview and test.

## 2. Deploy the Worker

You need Node.js 18+ installed (https://nodejs.org). Then, from this folder:

```bash
npm install          # installs wrangler (Cloudflare's CLI)
npx wrangler login   # opens a browser window to authorise your Cloudflare account
npm run deploy       # uploads the Worker + the site
```

The deploy output prints your live URL, e.g. `https://persepolis-gate-store.<your-subdomain>.workers.dev`. Open it — the whole site works immediately; only the **Pay securely** button will say payments aren't configured until you finish step 3.

### No-terminal alternative: deploy from GitHub

If you'd rather not use a terminal at all, Cloudflare can build and deploy the Worker for you from a Git repository:

1. Create a free account at https://github.com and make a new repository (private is fine).
2. Upload this whole project to it — on the repository page choose **Add file → Upload files** and drag in everything from the unzipped folder (`wrangler.jsonc`, `package.json`, `src/`, `public/`), then commit.
3. In the Cloudflare dashboard go to **Workers & Pages → Create → Workers → Import a repository**, connect your GitHub account, and pick the repo. Leave the build settings as detected (it reads `wrangler.jsonc`) and deploy.
4. From then on, any change you push to GitHub redeploys automatically. Secrets (step 3 below) can be set in the dashboard under your Worker's **Settings → Variables and Secrets** instead of the CLI.

This is different from the drag-and-drop asset uploader, which is static-only and can't run `worker.js` — the Git route deploys the full Worker, so checkout works.

## 3. Add the payment method (Stripe)

Stripe is the simplest way to take card payments (plus Apple Pay / Google Pay) for an Australian business, and this project is already wired for it.

1. Create an account at https://dashboard.stripe.com/register (business details, your bank account for payouts in AUD).
2. In the Stripe dashboard go to **Developers → API keys** and copy the **Secret key**. Start with the **test** key (`sk_test_...`) so you can try the flow with Stripe's test card `4242 4242 4242 4242`.
3. Give the key to your Worker as an encrypted secret:

   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY
   # paste the key when prompted
   ```

4. Reload your site and click **Pay securely** — you'll land on Stripe's checkout page with the box art, quantity, and a shipping-address form.
5. When you're happy, repeat step 3 with your **live** key (`sk_live_...`) and you're taking real payments. Orders appear in the Stripe dashboard under **Payments**, with the customer's shipping address and phone number attached.

**No-code alternative:** if you'd rather not handle API keys at all, create a **Payment Link** in Stripe (Products → Payment Links), then set it in `wrangler.jsonc`:

```jsonc
"PAYMENT_LINK_URL": "https://buy.stripe.com/XXXXXXXX"
```

and redeploy. The button will send customers straight to that link (the quantity selector on the page is then ignored — set the quantity options on the Payment Link itself).

## 4. Connect your domain to the Worker

Once the domain is registered on Cloudflare:

1. In `wrangler.jsonc`, uncomment the `routes` block at the bottom and replace `yourdomain.com` with your domain.
2. Run `npm run deploy` again. Cloudflare provisions the DNS records and TLS certificate automatically; your store is live at your own domain in a minute or two.

(Equivalent dashboard path: **Workers & Pages → persepolis-gate-store → Settings → Domains & Routes → Add → Custom domain**.)

## Changing the price, currency or shipping countries

- **Prices / currency / product name:** edit the `vars` block in `wrangler.jsonc` — `COMPAT_AMOUNT` (compatible bricks edition, `80000` = A$800.00) and `GENUINE_AMOUNT` (genuine LEGO® elements edition, `200000` = A$2,000.00) are in cents — then `npm run deploy`. The page reads prices from the Worker, so they update everywhere. If you use Payment Links instead of an API key, create one link per edition (`PAYMENT_LINK_URL_COMPAT`, `PAYMENT_LINK_URL_GENUINE`).
- **Countries offered at checkout:** edit the `SHIPPING_COUNTRIES` list at the top of `src/worker.js`. Stripe cannot collect shipping addresses for a few sanctioned territories (Iran included), so the site's FAQ directs Iranian orders to email: delivered by post where available, otherwise hand-carried by an international traveller with their additional charges added, confirmed with the customer before payment.
- **Contact email:** set to `ramtinf@gmail.com` in the footer and FAQ of `public/index.html` — change there if you ever switch to a dedicated orders address.

## Testing locally

```bash
npm run dev
```

opens the site at `http://localhost:8787`. Add your test Stripe key to a local `.dev.vars` file to test checkout locally:

```
STRIPE_SECRET_KEY=sk_test_...
```

## Things to review before launch

- **Branding:** the product is never branded "LEGO" — LEGO® is a trademark. The genuine-elements edition is described with the accepted wording for resold genuine parts ("built from genuine, new LEGO® elements, sourced at retail") plus the independent-product disclaimer; the word LEGO® appears only descriptively, never as the product name, and never as the logo graphic. Keep the same wording in ads and listings. The renders on the site are logo-free; keep any future imagery the same — the stud-logo graphic isn't yours to reproduce, and the imagery represents both editions, most of which ship with non-LEGO bricks (misleading-advertising risk under Australian Consumer Law). This isn't legal advice — for a product line at these prices, a short consult with an IP lawyer is cheap insurance.
- **Prices:** A$800 / A$2,000 are set in `wrangler.jsonc` — adjust as needed.
- **GST:** the FAQ says prices include GST for Australian orders; if you register for GST, Stripe Tax can calculate it automatically (optional).
- **Refund/consumer law:** as an Australian seller you're covered by Australian Consumer Law guarantees; the 30-day missing-pieces promise in the FAQ is a floor, not a ceiling — adjust wording to the policy you actually want.

## Project layout

```
persepolis-store/
├── wrangler.jsonc        Worker + product configuration
├── package.json
├── src/
│   └── worker.js         static serving + /api/product + /api/checkout (Stripe)
└── public/
    ├── index.html        the storefront
    ├── success.html      after a successful payment
    ├── cancel.html       if the customer backs out
    ├── css/style.css
    ├── js/main.js        price display + checkout hand-off
    └── img/              box art, renders, instruction pages
```
