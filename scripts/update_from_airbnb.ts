#!/usr/bin/env -S npx tsx
/**
 * Refresh data from the public Airbnb listing.
 *
 * Usage:
 *   npm run update:airbnb -- [--listing-id 1021507317870791676] [--photos] [--dry-run]
 *
 * What it does:
 *   1. Fetches the public Airbnb listing page.
 *   2. Pulls the SSR'd "deferred state" JSON blob from the HTML.
 *   3. Extracts review aggregates (overall rating, count, per-category scores)
 *      and the top-mention tags ("Hospitalité 28", etc.).
 *   4. Merges them into content/reviews.json IN PLACE, preserving the
 *      'items' array (you maintain that one by hand — Airbnb doesn't expose
 *      individual review text via public endpoints) and the _comment fields.
 *   5. With --photos: also re-fetches every listing photo into
 *      public/images/photo-NN.jpeg and regenerates the .webp variants
 *      (requires `cwebp` on PATH).
 *
 * Limitations (read this):
 *   - Individual review TEXT is not in the public payload — it's
 *     lazy-loaded behind an authenticated GraphQL call. Copy real quotes
 *     from your Airbnb host dashboard into content/reviews.json items[].
 *   - Airbnb may change their HTML/JSON shape at any time; if extraction
 *     fails, the script exits with a clear message and does not touch
 *     reviews.json.
 *   - Tested against the version of Airbnb live in May 2026.
 *
 * This script reads listing config from content/site.json (it parses
 * listings.airbnb to get the listing ID, so you only have to keep one URL
 * in sync).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import type { ReviewTag, ReviewsData, SiteConfig } from '../src/types.ts';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SITE_JSON = join(REPO, 'content', 'site.json');
const REVIEWS_JSON = join(REPO, 'content', 'reviews.json');
const IMAGES_DIR = join(REPO, 'public', 'images');

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
  + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface ReviewRating {
  categoryType?: string;
  label?: string;
  localizedRating?: string | number;
}
interface ReviewTagRaw {
  name?: string;
  localizedName?: string;
  count?: number;
}
interface ReviewsSectionRaw {
  ratings?: ReviewRating[];
  reviewTags?: ReviewTagRaw[];
  overallRating?: number;
  overallCount?: number;
  isGuestFavorite?: boolean;
}

// --- helpers ---------------------------------------------------------------

const httpGetText = async (url: string): Promise<string> => {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      Accept: 'text/html',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
};

const httpGetBytes = async (url: string): Promise<Buffer> => {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return Buffer.from(await res.arrayBuffer());
};

const listingIdFromSiteJson = (): string => {
  if (!existsSync(SITE_JSON)) throw new Error(`missing ${relative(REPO, SITE_JSON)}`);
  const site = JSON.parse(readFileSync(SITE_JSON, 'utf-8')) as SiteConfig;
  const url = site.listings?.airbnb || '';
  const m = /\/rooms\/(\d+)/.exec(url);
  if (!m) throw new Error('could not parse listing ID from site.json:listings.airbnb');
  return m[1]!;
};

const extractDeferredState = (html: string): Record<string, unknown> => {
  const m = /<script[^>]+id="data-deferred-state-0"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('data-deferred-state-0 not found — Airbnb HTML shape may have changed');
  let raw = m[1]!.trim();
  // Strip optional HTML-comment wrapper
  if (raw.startsWith('<!--') && raw.endsWith('-->')) raw = raw.slice(4, -3);
  return JSON.parse(raw) as Record<string, unknown>;
};

const reviewsSection = (state: Record<string, unknown>): ReviewsSectionRaw => {
  const entries = state.niobeClientData as unknown[] | undefined;
  if (!Array.isArray(entries)) throw new Error('could not navigate to REVIEWS_DEFAULT: niobeClientData missing');
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [key, val] = entry as [unknown, any];
    if (typeof key !== 'string' || !key.startsWith('StaysPdpSections')) continue;
    const sections = val?.data?.presentation?.stayProductDetailPage?.sections?.sections;
    if (!Array.isArray(sections)) continue;
    for (const s of sections) {
      if (s?.sectionId === 'REVIEWS_DEFAULT') return s.section as ReviewsSectionRaw;
    }
  }
  throw new Error('REVIEWS_DEFAULT section not found in deferred state');
};

/** Collect all listing photo URLs from the static HTML (best-effort). */
const photoUrlsFromHtml = (html: string): string[] => {
  const listingIdRe = '\\d{15,20}';
  const pattern = new RegExp(
    'https://a0\\.muscache\\.com/im/pictures/'
    + `(?:hosting/Hosting-(?:${listingIdRe}|[A-Za-z0-9%=]+)|miso/Hosting-${listingIdRe})`
    + '/original/[a-f0-9-]+\\.(?:jpeg|jpg|png)',
    'g',
  );
  return [...new Set(html.match(pattern) ?? [])].sort();
};

// --- public-facing labels mapping -------------------------------------------

// Airbnb category names map to our internal keys.
const CATEGORY_KEY: Record<string, [string, string]> = {
  CLEANLINESS: ['cleanliness', 'Cleanliness'],
  ACCURACY: ['accuracy', 'Accuracy'],
  CHECKIN: ['checkin', 'Check-in'],
  COMMUNICATION: ['communication', 'Communication'],
  LOCATION: ['location', 'Location'],
  VALUE: ['value', 'Value'],
};

// English fallback for tag names since the SSR JSON is locale-specific.
const TAG_EN_FALLBACK: Record<string, string> = {
  GETTING_AROUND: 'Getting around',
  HOSPITALITY: 'Hospitality',
  PARKS: 'Parks',
  NEARBY: 'Nearby',
  LOCATION: 'Location',
  ACCURACY: 'Accuracy',
  INDOOR_SPACES: 'Indoor spaces',
  FAMILY: 'Family',
  CLEANLINESS: 'Cleanliness',
  WALKABILITY: 'Walkability',
  CHECK_IN: 'Check-in',
  COMMUNICATION: 'Communication',
  VALUE: 'Value',
};

const titleCase = (s: string): string => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Turn the raw REVIEWS_DEFAULT section into our reviews.json shape. */
const buildReviewsPayload = (rev: ReviewsSectionRaw): Pick<ReviewsData, 'summary' | 'tags'> => {
  const categories: NonNullable<ReviewsData['summary']>['categories'] = {};
  for (const r of rev.ratings || []) {
    const cat = r.categoryType || '';
    const [slug, enLabel] = CATEGORY_KEY[cat] || [cat.toLowerCase(), titleCase(cat)];
    // localizedRating uses French comma — keep numeric for consistency
    const score = parseFloat(String(r.localizedRating ?? '0').replace(',', '.'));
    categories[slug] = {
      fr: r.label || enLabel,
      en: enLabel,
      score: Math.round(score * 100) / 100,
    };
  }

  const tags: ReviewTag[] = (rev.reviewTags || []).map((t) => {
    const nameKey = t.name || '';
    return {
      fr: t.localizedName || nameKey,
      en: TAG_EN_FALLBACK[nameKey] || titleCase(nameKey),
      count: Number(t.count || 0),
    };
  });
  tags.sort((a, b) => b.count - a.count);

  let rating: string = '';
  if (typeof rev.overallRating === 'number') {
    rating = rev.overallRating.toFixed(2).replace('.', ',');
  }

  return {
    summary: {
      rating,
      count: Number(rev.overallCount || 0),
      guestFavorite: Boolean(rev.isGuestFavorite),
      categories,
    },
    tags,
  };
};

/** Update aggregates + tags. Preserve items[] and _comment fields. */
const mergeReviews = (existing: ReviewsData, fresh: Pick<ReviewsData, 'summary' | 'tags'>): ReviewsData => {
  const out: ReviewsData & Record<string, unknown> = { ...existing };
  if (!('_comment' in out)) {
    out._comment = 'Reviews data. Aggregates and tags are pulled from the live Airbnb '
      + "listing. Individual review TEXT in items[] is not public via Airbnb's "
      + 'API — paste real quotes from your host dashboard.';
  }
  out.summary = fresh.summary;
  out._tags_comment = 'Top keywords reviewers mention, with how many reviews mention each. '
    + 'Ordered by count descending. Pulled live from Airbnb.';
  out.tags = fresh.tags;
  out.items = out.items || [];
  return out;
};

// --- photo sync --------------------------------------------------------------

const cwebpAvailable = (): boolean => {
  try {
    execFileSync('which', ['cwebp'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const syncPhotos = async (html: string): Promise<void> => {
  const urls = photoUrlsFromHtml(html);
  if (!urls.length) {
    console.log("no photo URLs found in the HTML — Airbnb's markup may have changed");
    return;
  }
  console.log(`found ${urls.length} photo URLs; downloading…`);
  mkdirSync(IMAGES_DIR, { recursive: true });
  for (let i = 0; i < urls.length; i += 1) {
    const target = join(IMAGES_DIR, `photo-${String(i + 1).padStart(2, '0')}.jpeg`);
    try {
      writeFileSync(target, await httpGetBytes(urls[i]!));
      console.log(`  ${target.split('/').pop()}`);
    } catch (err) {
      console.log(`  ! failed photo-${String(i + 1).padStart(2, '0')}.jpeg: ${String(err)}`);
    }
  }

  if (cwebpAvailable()) {
    console.log('regenerating .webp variants…');
    const jpegs = readdirSync(IMAGES_DIR).filter((f) => f.startsWith('photo-') && f.endsWith('.jpeg')).sort();
    for (const jpeg of jpegs) {
      const jpegPath = join(IMAGES_DIR, jpeg);
      const webpPath = jpegPath.replace(/\.jpeg$/, '.webp');
      try {
        execFileSync('cwebp', ['-q', '82', '-quiet', jpegPath, '-o', webpPath]);
      } catch {
        // best-effort, matches the original script's check=False
      }
    }
    const webpCount = readdirSync(IMAGES_DIR).filter((f) => f.endsWith('.webp')).length;
    console.log(`  -> ${webpCount} webp files`);
  } else {
    console.log('cwebp not on PATH — skipping .webp regeneration');
  }
};

// --- main --------------------------------------------------------------------

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      'listing-id': { type: 'string' },
      photos: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  });

  const listingId = values['listing-id'] || listingIdFromSiteJson();
  const url = `https://www.airbnb.fr/rooms/${listingId}`;
  console.log(`fetching ${url} …`);
  const html = await httpGetText(url);

  const state = extractDeferredState(html);
  const revSection = reviewsSection(state);
  const fresh = buildReviewsPayload(revSection);

  const existing: ReviewsData = existsSync(REVIEWS_JSON)
    ? JSON.parse(readFileSync(REVIEWS_JSON, 'utf-8'))
    : {};
  const merged = mergeReviews(existing, fresh);

  console.log();
  console.log(
    `summary: ${fresh.summary?.rating} `
    + `(${fresh.summary?.count} reviews, guest favorite=${fresh.summary?.guestFavorite})`,
  );
  console.log(`categories: ${Object.keys(fresh.summary?.categories || {}).length}`);
  console.log(`tags: ${fresh.tags?.length ?? 0}`);

  if (values['dry-run']) {
    console.log();
    console.log('--dry-run: not writing');
    console.log(`${JSON.stringify(merged, null, 2).slice(0, 600)}...`);
  } else {
    writeFileSync(REVIEWS_JSON, `${JSON.stringify(merged, null, 2)}\n`, 'utf-8');
    console.log(`wrote ${relative(REPO, REVIEWS_JSON)}`);
  }

  if (values.photos) {
    console.log();
    await syncPhotos(html);
  }

  // Keep the double-click bundle in sync with the content we just changed.
  if (!values['dry-run']) {
    console.log();
    try {
      execFileSync('npx', ['tsx', join('scripts', 'build_bundle.ts')], { cwd: REPO, stdio: 'inherit' });
    } catch {
      // best-effort, matches the original script's check=False
    }
  }
};

main();
