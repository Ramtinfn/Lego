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
