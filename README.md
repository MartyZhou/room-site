# Sceaux Sérénité

Standalone, bilingual (FR/EN) listing page for a 5-bedroom villa in Sceaux,
just south of Paris. The client-side logic is TypeScript (`src/app.ts`),
bundled to `app.js` with esbuild — a build step is required before the page
works.

## First-time setup

```sh
npm install
npm run build   # compiles src/app.ts -> app.js
```

Then open `index.html` directly in a browser (double-click it), or serve it
over HTTP (see below). `app.js` is a generated build artifact (git-ignored) —
run `npm run build` again any time you edit `src/app.ts`, or use
`npm run watch` to rebuild automatically while you work.

To put it on the internet so others can visit, drag the whole folder onto
**https://app.netlify.com/drop** after running `npm run build` — you'll get
a public link in about a minute. (Rebuild and re-drag the folder to publish
updates.) Git-based deploys (Netlify, Cloudflare Pages) run `npm install &&
npm run build` automatically — see `netlify.toml`.

## Editing the text (optional, slightly technical)

The wording, photos, reviews, etc. live in the `content/` folder (see the
table below). After editing anything there, regenerate the bundle so the
double-click preview reflects your change:

```sh
npm run bundle:content
```

## Live preview while editing (developers)

```sh
npm run watch          # in one terminal: rebuilds app.js on save
npm run serve          # in another terminal: serves the site at :4321
# then open http://localhost:4321/
```

Served over HTTP, the page fetches `content/*` live, so edits show on
refresh without rebuilding the content bundle. (`content/bundle.js` is only
used as a fallback when the page is opened directly via `file://`.)

## TypeScript source

| Command | What it does |
| --- | --- |
| `npm run build` | Type-checks implicitly and bundles `src/app.ts` → `app.js` (esbuild) |
| `npm run watch` | Same, but rebuilds on every save |
| `npm run typecheck` | Runs `tsc --noEmit` on `src/` and `scripts/` for full strict type-checking |

Source lives in `src/app.ts` (behavior) and `src/types.ts` (shapes of
`content/*.json`). Never edit `app.js` by hand — it's overwritten by the
next build. The content tooling in `scripts/` (see below) is also
TypeScript, run directly with `tsx` — no separate build step needed.

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
npm run update:airbnb                    # update reviews.json aggregates + tags
npm run update:airbnb -- --photos        # also re-download photos and regenerate .webp
npm run update:airbnb -- --dry-run       # show what would change without writing
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

The repo is a static site once built, so any static host works — but it now
needs a build step (`npm install && npm run build`) to generate `app.js`.

### Cloudflare Pages

1. Push the repo to GitHub.
2. In Cloudflare → Pages → Create project → Connect to Git.
3. **Build command:** `npm install && npm run build`
4. **Build output directory:** `/`
5. Deploy.

### Netlify

`netlify.toml` is included with the build command set — connect via Git
with default settings, or run `npm run build` locally and drag-and-drop the
folder onto netlify.com.

### GitHub Pages

GitHub Pages serves the repo as-is with no build step, so build locally
first (`npm run build`) and commit `app.js`, or add a GitHub Actions
workflow that runs `npm ci && npm run build` before publishing to the
`gh-pages` branch.

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
├── app.js            (generated by `npm run build` — git-ignored)
├── src/
│   ├── app.ts        (TypeScript source)
│   └── types.ts      (content/*.json shapes)
├── tsconfig.json
├── package.json
├── content/
│   ├── site.json
│   ├── fr.json
│   ├── en.json
│   ├── reviews.json
│   └── prose/
│       ├── fr/*.md
│       └── en/*.md
├── public/images/photo-NN.{jpeg,webp}
├── scripts/
│   ├── build_bundle.ts
│   └── update_from_airbnb.ts
├── netlify.toml
├── _headers
└── README.md
```
