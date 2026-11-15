# Gate of All Nations — Persepolis brick design showcase

A static showcase site for a 2,697-piece fan-designed building-brick model of the
Gate of All Nations at Persepolis, Iran, currently a candidate on LEGO® Ideas.
Nothing is sold on this site.

Live at https://persiainbricks.com — a Cloudflare Worker serving the static
pages in `public/`.

## Structure

```
├── wrangler.jsonc      Worker configuration (static assets + custom domain)
├── src/worker.js       serves ./public, nothing else
└── public/
    ├── index.html      the showcase page (English + Farsi)
    ├── css/style.css
    └── img/            model renders
```

## Deploying

Pushes to `main` are built and deployed automatically by Cloudflare (Workers
Builds). Manual deploy: `npm install && npx wrangler deploy`.

## Notes

- An earlier, fuller version of this project is archived on the
  `store-version` branch.
- LEGO® is a trademark of the LEGO Group, which does not sponsor, authorise or
  endorse this site.

## SEO checklist — every model, both domains

Standing rule: whatever is done for one model or one domain is done for all
models and both domains where relevant (persiainbricks.com.au = store,
persiainbricks.com = non-commercial LEGO® Ideas showcase until the Ideas
window ends).

When adding a model to the store (shahyad/):
1. PRODUCTS entry in src/worker.js (name, pieces, size, editions, shipping, description).
2. Page section with keyword-rich H2 carrying the model's name, bilingual subtitle,
   gallery with descriptive alt text on every image, specs list, order panel.
3. Clickable card in the #models gallery AND a tile/link in the hero collage.
4. JSON-LD Product in the <head> @graph (name, image, description with
   "Independent fan design" line, brand Persia in Bricks, Offer/AggregateOffer in AUD).
5. Update meta description / og tags / hero copy if the model count or price floor changes.
6. FAQ + policies: state the instruction-book format and any edition limits.
7. Bump sitemap.xml lastmod; push; then Google Search Console (account
   ramtinf@gmail.com) → URL inspection → Request indexing for the homepage.
8. Analytics: nothing to do — view_item (ViewContent), select_item, begin_checkout
   and purchase are generic over PRODUCTS keys.

Showcase (.com): keep strictly non-commercial — no Product/Offer schema, no
prices, no links to the store. CreativeWork + FAQPage schema only. The store
may link to the showcase; never the reverse while the Ideas entry is live.
