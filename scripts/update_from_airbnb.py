#!/usr/bin/env python3
"""
Refresh data from the public Airbnb listing.

Usage:
    python3 scripts/update_from_airbnb.py [--listing-id 1021507317870791676] [--photos] [--dry-run]

What it does:
    1. Fetches the public Airbnb listing page.
    2. Pulls the SSR'd "deferred state" JSON blob from the HTML.
    3. Extracts review aggregates (overall rating, count, per-category scores)
       and the top-mention tags ("Hospitalité 28", etc.).
    4. Merges them into content/reviews.json IN PLACE, preserving the
       'items' array (you maintain that one by hand — Airbnb doesn't expose
       individual review text via public endpoints) and the _comment fields.
    5. With --photos: also re-fetches every listing photo into
       public/images/photo-NN.jpeg and regenerates the .webp variants
       (requires `cwebp` on PATH).

Limitations (read this):
    - Individual review TEXT is not in the public payload — it's
      lazy-loaded behind an authenticated GraphQL call. Copy real quotes
      from your Airbnb host dashboard into content/reviews.json items[].
    - Airbnb may change their HTML/JSON shape at any time; if extraction
      fails, the script will exit with a clear message and not touch
      reviews.json.
    - Tested against the version of Airbnb live in May 2026.

This script reads listing config from content/site.json (it parses
listings.airbnb to get the listing ID, so you only have to keep one URL
in sync).
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SITE_JSON = REPO / "content" / "site.json"
REVIEWS_JSON = REPO / "content" / "reviews.json"
IMAGES_DIR = REPO / "public" / "images"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


# --- helpers --------------------------------------------------------------

def _http_get(url: str, *, accept: str = "text/html,application/json") -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
            "Accept": accept,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} fetching {url}")
    except urllib.error.URLError as e:
        sys.exit(f"Network error fetching {url}: {e.reason}")


def _listing_id_from_site_json() -> str:
    if not SITE_JSON.exists():
        sys.exit(f"missing {SITE_JSON.relative_to(REPO)}")
    site = json.loads(SITE_JSON.read_text(encoding="utf-8"))
    url = (site.get("listings") or {}).get("airbnb", "")
    m = re.search(r"/rooms/(\d+)", url)
    if not m:
        sys.exit("could not parse listing ID from site.json:listings.airbnb")
    return m.group(1)


def _extract_deferred_state(html: str) -> dict:
    m = re.search(
        r'<script[^>]+id="data-deferred-state-0"[^>]*>(.*?)</script>',
        html,
        re.S,
    )
    if not m:
        sys.exit("data-deferred-state-0 not found — Airbnb HTML shape may have changed")
    raw = m.group(1).strip()
    # Strip optional HTML-comment wrapper
    if raw.startswith("<!--") and raw.endswith("-->"):
        raw = raw[4:-3]
    return json.loads(raw)


def _reviews_section(state: dict) -> dict:
    """Find the REVIEWS_DEFAULT section in the deferred state."""
    try:
        entries = state["niobeClientData"]
        # The entries are [key, value] pairs. Find the StaysPdpSections one.
        for entry in entries:
            if not isinstance(entry, list) or len(entry) != 2:
                continue
            key, val = entry
            if not str(key).startswith("StaysPdpSections"):
                continue
            sections = val["data"]["presentation"]["stayProductDetailPage"][
                "sections"
            ]["sections"]
            for s in sections:
                if s.get("sectionId") == "REVIEWS_DEFAULT":
                    return s["section"]
    except (KeyError, TypeError, IndexError) as e:
        sys.exit(f"could not navigate to REVIEWS_DEFAULT: {e}")
    sys.exit("REVIEWS_DEFAULT section not found in deferred state")


def _photo_urls_from_html(html: str) -> list[str]:
    """Collect all listing photo URLs from the static HTML (best-effort)."""
    listing_id_re = r"\d{15,20}"
    pattern = (
        r"https://a0\.muscache\.com/im/pictures/"
        r"(?:hosting/Hosting-(?:" + listing_id_re + r"|[A-Za-z0-9%=]+)|"
        r"miso/Hosting-" + listing_id_re + r")"
        r"/original/[a-f0-9-]+\.(?:jpeg|jpg|png)"
    )
    return sorted(set(re.findall(pattern, html)))


# --- public-facing labels mapping ----------------------------------------

# Airbnb category names map to our internal keys.
_CATEGORY_KEY = {
    "CLEANLINESS": ("cleanliness", "Cleanliness"),
    "ACCURACY": ("accuracy", "Accuracy"),
    "CHECKIN": ("checkin", "Check-in"),
    "COMMUNICATION": ("communication", "Communication"),
    "LOCATION": ("location", "Location"),
    "VALUE": ("value", "Value"),
}

# English fallback for tag names since the SSR JSON is locale-specific.
_TAG_EN_FALLBACK = {
    "GETTING_AROUND": "Getting around",
    "HOSPITALITY": "Hospitality",
    "PARKS": "Parks",
    "NEARBY": "Nearby",
    "LOCATION": "Location",
    "ACCURACY": "Accuracy",
    "INDOOR_SPACES": "Indoor spaces",
    "FAMILY": "Family",
    "CLEANLINESS": "Cleanliness",
    "WALKABILITY": "Walkability",
    "CHECK_IN": "Check-in",
    "COMMUNICATION": "Communication",
    "VALUE": "Value",
}


def _build_reviews_payload(rev: dict) -> dict:
    """Turn the raw REVIEWS_DEFAULT section into our reviews.json shape."""
    categories = {}
    for r in rev.get("ratings", []):
        cat = r.get("categoryType", "")
        slug, en_label = _CATEGORY_KEY.get(cat, (cat.lower(), cat.title()))
        # localizedRating uses French comma — keep numeric for consistency
        score = float(str(r.get("localizedRating", "0")).replace(",", "."))
        categories[slug] = {
            "fr": r.get("label") or en_label,
            "en": en_label,
            "score": round(score, 2),
        }

    tags = []
    for t in rev.get("reviewTags", []):
        name_key = t.get("name", "")
        tags.append(
            {
                "fr": t.get("localizedName", name_key),
                "en": _TAG_EN_FALLBACK.get(name_key, name_key.replace("_", " ").title()),
                "count": int(t.get("count", 0)),
            }
        )
    # sort by count desc for stable display
    tags.sort(key=lambda x: -x["count"])

    rating = rev.get("overallRating")
    if isinstance(rating, (int, float)):
        rating = (f"{rating:.2f}").replace(".", ",")
    elif rating is None:
        rating = ""

    return {
        "summary": {
            "rating": rating,
            "count": int(rev.get("overallCount", 0)),
            "guestFavorite": bool(rev.get("isGuestFavorite", False)),
            "categories": categories,
        },
        "tags": tags,
    }


def _merge_reviews(existing: dict, fresh: dict) -> dict:
    """Update aggregates + tags. Preserve items[] and _comment fields."""
    out = dict(existing) if existing else {}
    out.setdefault(
        "_comment",
        "Reviews data. Aggregates and tags are pulled from the live Airbnb "
        "listing. Individual review TEXT in items[] is not public via "
        "Airbnb's API — paste real quotes from your host dashboard.",
    )
    out["summary"] = fresh["summary"]
    out["_tags_comment"] = (
        "Top keywords reviewers mention, with how many reviews mention each. "
        "Ordered by count descending. Pulled live from Airbnb."
    )
    out["tags"] = fresh["tags"]
    out.setdefault("items", [])
    return out


# --- photo sync -----------------------------------------------------------

def _sync_photos(html: str) -> None:
    urls = _photo_urls_from_html(html)
    if not urls:
        print("no photo URLs found in the HTML — Airbnb's markup may have changed")
        return
    print(f"found {len(urls)} photo URLs; downloading…")
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    for i, url in enumerate(urls, 1):
        target = IMAGES_DIR / f"photo-{i:02d}.jpeg"
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                target.write_bytes(resp.read())
            print(f"  {target.name}")
        except Exception as e:
            print(f"  ! failed {target.name}: {e}")

    if shutil.which("cwebp"):
        print("regenerating .webp variants…")
        for jpeg in sorted(IMAGES_DIR.glob("photo-*.jpeg")):
            webp = jpeg.with_suffix(".webp")
            subprocess.run(
                ["cwebp", "-q", "82", "-quiet", str(jpeg), "-o", str(webp)],
                check=False,
            )
        print(f"  -> {len(list(IMAGES_DIR.glob('photo-*.webp')))} webp files")
    else:
        print("cwebp not on PATH — skipping .webp regeneration")


# --- main -----------------------------------------------------------------

def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    p.add_argument(
        "--listing-id",
        help="override the listing ID (default: parsed from site.json)",
    )
    p.add_argument(
        "--photos",
        action="store_true",
        help="also re-download photos and regenerate .webp variants",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="show what would change but don't write reviews.json",
    )
    args = p.parse_args()

    listing_id = args.listing_id or _listing_id_from_site_json()
    url = f"https://www.airbnb.fr/rooms/{listing_id}"
    print(f"fetching {url} …")
    html = _http_get(url, accept="text/html").decode("utf-8", errors="replace")

    state = _extract_deferred_state(html)
    rev_section = _reviews_section(state)
    fresh = _build_reviews_payload(rev_section)

    existing = (
        json.loads(REVIEWS_JSON.read_text(encoding="utf-8"))
        if REVIEWS_JSON.exists()
        else {}
    )
    merged = _merge_reviews(existing, fresh)

    print()
    print(
        f"summary: {fresh['summary']['rating']} "
        f"({fresh['summary']['count']} reviews, guest favorite="
        f"{fresh['summary']['guestFavorite']})"
    )
    print(f"categories: {len(fresh['summary']['categories'])}")
    print(f"tags: {len(fresh['tags'])}")

    if args.dry_run:
        print()
        print("--dry-run: not writing")
        print(json.dumps(merged, ensure_ascii=False, indent=2)[:600] + "...")
    else:
        REVIEWS_JSON.write_text(
            json.dumps(merged, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"wrote {REVIEWS_JSON.relative_to(REPO)}")

    if args.photos:
        print()
        _sync_photos(html)

    # Keep the double-click bundle in sync with the content we just changed.
    if not args.dry_run:
        build_script = REPO / "scripts" / "build_bundle.py"
        if build_script.exists():
            print()
            subprocess.run([sys.executable, str(build_script)], check=False)


if __name__ == "__main__":
    main()
