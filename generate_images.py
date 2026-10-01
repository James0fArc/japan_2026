#!/usr/bin/env python3
"""
Generate watercolour images for the unplanned entries in entries.csv
using the Pollinations image API.

Run from the root of your japan_2026 repo (the folder with entries.csv
and images/):

    export POLLINATIONS_API_KEY=sk_...        # macOS / Linux
    setx POLLINATIONS_API_KEY sk_...          # Windows (then open a new terminal)

    python generate_images.py --dry-run       # preview prompts, no API calls
    python generate_images.py                 # generate every missing image
    python generate_images.py --only e022     # redo one entry (or e022,e017)
    python generate_images.py --only e022 --force --seed 7   # new variation

Each image is saved as images/<photo key>.jpg, where the key comes from the
"photo" column of entries.csv (e.g. images/wc_fushimi_inari.jpg). Existing
images are skipped unless you pass --force.

Only the Python standard library is required. If Pillow is installed
(pip install pillow) images are also resized and saved as compressed JPEGs,
which keeps the repo small.
"""

import argparse
import csv
import io
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API_BASE = "https://gen.pollinations.ai/image/"
CSV_PATH = "entries.csv"
IMAGE_DIR = "images"

# Appended to every prompt so the set looks consistent. Edit to taste.
STYLE = ("loose watercolour illustration, soft washes of colour, "
         "visible paper texture, gentle autumn tones, no text, no lettering")

# Optional per-entry prompt replacements, keyed by entry id. Use these when an
# entry's name is too vague or misspelt to produce a good picture.
PROMPT_OVERRIDES = {
    "e027": "Dotonbori canal and neon signs, Osaka, Japan",
    # "e016": "people in colourful kimono walking a stone lane, Kyoto, Japan",
}

WIDTH, HEIGHT = 900, 600
DELAY_SECONDS = 4        # pause between requests to stay under rate limits
MAX_RETRIES = 4


def build_prompt(row):
    if row["id"] in PROMPT_OVERRIDES:
        subject = PROMPT_OVERRIDES[row["id"]]
    else:
        name = row["description"].strip()
        location = (row.get("location") or "").strip()
        subject = name
        if location and location.lower() not in name.lower():
            subject += ", " + location
        subject += ", Japan"
    return subject + ", " + STYLE


def fetch_image(prompt, key, model, seed):
    params = urllib.parse.urlencode({
        "model": model, "width": WIDTH, "height": HEIGHT,
        "seed": seed, "nologo": "true", "private": "true",
    })
    url = API_BASE + urllib.parse.quote(prompt, safe="") + "?" + params
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + key,      # key goes in a header, never the URL
        "User-Agent": "japan-2026-itinerary/1.0",
    })
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                ctype = resp.headers.get("Content-Type", "")
                data = resp.read()
            if not ctype.startswith("image/"):
                raise RuntimeError("expected an image, got %s: %s"
                                   % (ctype, data[:200].decode("utf-8", "replace")))
            return data
        except urllib.error.HTTPError as e:
            body = e.read()[:300].decode("utf-8", "replace")
            if e.code in (401, 403):
                sys.exit("Auth error %d - check POLLINATIONS_API_KEY and that the key "
                         "is allowed to use model '%s'.\n%s" % (e.code, model, body))
            if e.code == 402:
                sys.exit("Payment required (402) - this model isn't covered by your "
                         "free allowance. Check your Pollen balance/model pricing.\n" + body)
            if e.code in (429, 500, 502, 503, 504) and attempt < MAX_RETRIES:
                wait = DELAY_SECONDS * 2 ** attempt
                print("    HTTP %d, retrying in %ds..." % (e.code, wait))
                time.sleep(wait)
                continue
            raise RuntimeError("HTTP %d: %s" % (e.code, body))
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < MAX_RETRIES:
                wait = DELAY_SECONDS * 2 ** attempt
                print("    network error (%s), retrying in %ds..." % (e, wait))
                time.sleep(wait)
                continue
            raise


def save_image(data, path):
    try:
        from PIL import Image
    except ImportError:
        # Browsers render the image fine even if the bytes are PNG.
        with open(path, "wb") as f:
            f.write(data)
        return
    img = Image.open(io.BytesIO(data)).convert("RGB")
    img.thumbnail((WIDTH, HEIGHT))
    img.save(path, "JPEG", quality=85, optimize=True, progressive=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma-separated entry ids, e.g. e022,e017")
    ap.add_argument("--force", action="store_true", help="overwrite existing images")
    ap.add_argument("--seed", type=int, default=42,
                    help="change this to get a different variation (default 42)")
    ap.add_argument("--model", default="flux", help="Pollinations image model (default flux)")
    ap.add_argument("--dry-run", action="store_true", help="print prompts only")
    args = ap.parse_args()

    if not os.path.exists(CSV_PATH):
        sys.exit("Can't find %s - run this from your repo's root folder." % CSV_PATH)
    os.makedirs(IMAGE_DIR, exist_ok=True)

    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        rows = [r for r in csv.DictReader(f) if r["category"] == "unplanned"]
    if args.only:
        wanted = {x.strip() for x in args.only.split(",")}
        rows = [r for r in rows if r["id"] in wanted]

    todo = []
    for r in rows:
        photo = (r.get("photo") or "").strip()
        if not photo:
            print("skip %s (%s): no photo key in CSV" % (r["id"], r["description"]))
            continue
        path = os.path.join(IMAGE_DIR, photo + ".jpg")
        if os.path.exists(path) and not args.force:
            continue
        todo.append((r, path))

    if not todo:
        print("Nothing to do - all images exist (use --force to redo).")
        return

    key = os.environ.get("POLLINATIONS_API_KEY", "").strip()
    if not key and not args.dry_run:
        sys.exit("Set POLLINATIONS_API_KEY first (see the top of this file).")

    print("%d image(s) to generate\n" % len(todo))
    failed = []
    for i, (r, path) in enumerate(todo, 1):
        prompt = build_prompt(r)
        print("[%d/%d] %s  %s -> %s" % (i, len(todo), r["id"], r["description"], path))
        if args.dry_run:
            print("    prompt: " + prompt)
            continue
        try:
            save_image(fetch_image(prompt, key, args.model, args.seed), path)
            print("    saved")
        except Exception as e:
            print("    FAILED: %s" % e)
            failed.append(r["id"])
        if i < len(todo):
            time.sleep(DELAY_SECONDS)

    if failed:
        print("\nFailed: %s\nRe-run with --only %s" % (", ".join(failed), ",".join(failed)))
    elif not args.dry_run:
        print("\nDone. Check the images/ folder, then commit and push.")


if __name__ == "__main__":
    main()