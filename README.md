# Sceaux Sérénité

Standalone, bilingual (FR/EN) listing page for a 5-bedroom villa in Sceaux,
just south of Paris. Plain HTML/CSS/JS — no build step.

## Local preview

```sh
python3 -m http.server 4321
# then open http://localhost:4321/
```

The site must be served over HTTP (the JS uses `fetch()` to load JSON and
markdown files). Opening `index.html` directly via `file://` will not work.

## Editing content

| File / directory | What it controls |
| --- | --- |
| `content/site.json` | URLs, phone, email, map, photo categories, featured photo |
| `content/fr.json` / `content/en.json` | Short UI strings (nav, button labels, facts) |
| `content/prose/{fr,en}/*.md` | Long-form descriptions (about, access, location, rules, booking intros) |
| `content/reviews.json` | Review highlights — replace examples with real Airbnb quotes |
| `public/images/photo-NN.jpeg` + `.webp` | Photos (JPEG + WebP variant) |

To regenerate WebP variants after replacing photos:

```sh
cd public/images
for f in photo-*.jpeg; do cwebp -q 82 -quiet "$f" -o "${f%.jpeg}.webp" & done; wait
```

## Refreshing review aggregates from Airbnb

```sh
python3 scripts/update_from_airbnb.py             # update reviews.json aggregates + tags
python3 scripts/update_from_airbnb.py --photos    # also re-download photos and regenerate .webp
python3 scripts/update_from_airbnb.py --dry-run   # show what would change without writing
```

What it does:

- Re-fetches the public Airbnb listing page (URL parsed from
  `content/site.json:listings.airbnb`).
- Extracts review aggregates (overall rating, count, guest-favorite flag,
  six per-category scores) and the top-mention tags from the SSR'd JSON.
- Merges them into `content/reviews.json` while preserving your `items[]`
  (Airbnb doesn't expose individual review text via public endpoints —
  paste real quotes from your host dashboard there yourself).

Re-run whenever you get new reviews or want fresh tag counts.

## Before going live

1. **Fill in real contact info** in `content/site.json` (`contact.phone`,
   `contact.phoneDisplay`, `contact.email`).
2. **Set `siteUrl`** in `content/site.json` to your deployed canonical URL —
   this rewrites Open Graph / Twitter card / JSON-LD image URLs at runtime.
3. **Update the Booking.com URL** (`listings.booking`) — currently a placeholder.
4. **Adjust photo categories** in `site.json` — assign the right photo numbers
   to each room category.
5. **Tweak the map coordinates** if the marker isn't where the house is.

## Deploy

The repo is a plain static site, so any static host works.

### Cloudflare Pages

1. Push the repo to GitHub.
2. In Cloudflare → Pages → Create project → Connect to Git.
3. **Build command:** *(leave empty)*
4. **Build output directory:** `/`
5. Deploy.

### Netlify

`netlify.toml` is included — drag-and-drop the folder onto netlify.com or
connect via Git with default settings.

### GitHub Pages

Push to `main`, then Settings → Pages → Source: deploy from `main` / root.

## Theming

Four themes ship: Sérénité (default sage green), Classique (cream + gold),
Azur (Mediterranean blue), Nuit (warm dark mode). Users pick via the swatch
row in the header; the choice is persisted in `localStorage`.

To lock in a theme and remove the picker:

1. Add `data-theme="serenity|classique|azur|nuit"` to the `<html>` tag.
2. Delete the `.theme-picker` block from `index.html`.
3. Optionally trim the unused theme variables and picker CSS from `styles.css`.

## File layout

```
.
├── index.html
├── styles.css
├── app.js
├── content/
│   ├── site.json
│   ├── fr.json
│   ├── en.json
│   ├── reviews.json
│   └── prose/
│       ├── fr/*.md
│       └── en/*.md
├── public/images/photo-NN.{jpeg,webp}
├── netlify.toml
├── _headers
└── README.md
```
