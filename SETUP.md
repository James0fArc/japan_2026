# Adding private booking details to your itinerary

## What changed

- `entries.csv` and `index.html` are still the same public site you had —
  it deploys to GitHub Pages exactly as before, no auth, no build step.
- One personal link that was sitting in the public CSV (the Pokémon Cafe
  reservation URL) has been moved out — its row's `id` changed from `e034`
  to `e052` (it happened to duplicate another row's id, which would have
  broken the booking lookup below — worth knowing about even aside from
  this change).
- A small serverless backend holds your booking confirmation numbers,
  private reservation links, and booking PDFs — the only place they live.
  It only hands them back to a request that includes the correct
  passphrase, so the public site stays exactly as shareable as it is now,
  and the private data is never part of what ships to a random visitor.
  **Two ready-made options are included — pick whichever you'd rather use,
  you only need one:**
  - **Cloudflare** (Workers + R2) — in the `worker/` folder.
  - **Netlify** (Functions + Blobs) — in the `netlify-backend/` folder.

  They work identically from the site's point of view (same routes, same
  passphrase model), so whichever you pick, the rest of this guide's
  "Using it" section applies unchanged.
- `index.html` now has a small 🔒 button in the header. Clicking it prompts
  for the passphrase, calls your backend, and — only on success — merges
  the booking details into the page for that device. Nobody without the
  passphrase ever sees it, even by viewing source or the network tab.

## One-time setup (about 10 minutes)

### Option A: Cloudflare (Workers + R2)

1. **Create a free Cloudflare account** at https://dash.cloudflare.com/sign-up
   if you don't already have one. You do *not* need to move your domain or
   your GitHub Pages hosting — Workers get their own free
   `*.workers.dev` address.

2. **Install Wrangler** (Cloudflare's CLI), if you don't have it:
   ```
   npm install -g wrangler
   ```

3. **Log in:**
   ```
   wrangler login
   ```
   This opens a browser window to authorize the CLI against your Cloudflare
   account.

4. **Add your bookings.** Open `worker/bookings-worker.js` and fill in the
   `BOOKINGS` object — one entry per booking, keyed by the `id` from
   `entries.csv` (for trains, museums, restaurants, etc.) or by hotel key
   (`yokohama`, `hakone`, `kyoto`, `osaka`, `koyasan`, `nara`, `tokyo`) for
   hotel confirmations. Each entry can have a `confirmation` number, a
   `booking_url`, or both — and `booking_url` can be either a normal
   `https://` link (straight to the booking page) or a `/files/<name>` path
   pointing at a PDF you've uploaded (see step 6 below).

5. **Deploy the Worker:**
   ```
   cd worker
   wrangler deploy
   ```
   The output prints your Worker's URL — something like
   `https://japan-trip-bookings.<your-subdomain>.workers.dev`. This also
   creates the `japan-trip-booking-files` R2 bucket declared in
   `wrangler.toml`, which step 6 uploads PDFs into.

6. **(Optional) Upload booking PDFs.** If you have confirmation PDFs you'd
   rather store and open through the site itself, instead of just linking
   out to the booking page:
   ```
   wrangler r2 object put japan-trip-booking-files/<name>.pdf --file=/path/to/file.pdf --content-type=application/pdf
   ```
   Run this once per file, from wherever the PDF actually is on your
   machine (not necessarily the `worker/` folder) — pick whatever `<name>`
   makes sense to you, e.g. `hotel-plumm-confirmation.pdf`. Then reference
   it in `BOOKINGS` as `booking_url: "/files/<name>.pdf"`. Uploading a new
   version later with the same name just replaces it — no redeploy needed
   for the file itself, only if you also changed `BOOKINGS`.

7. **Set your passphrase** (pick something reasonably long and random —
   this is the only thing standing between a visitor and your booking
   data, PDFs included):
   ```
   wrangler secret put BOOKING_TOKEN
   ```
   It'll prompt you to type the value.

8. **Point the site at your Worker.** In `index.html`, find this line near
   the top of the `<script>` block:
   ```js
   const BOOKINGS_WORKER_ORIGIN = "https://REPLACE-ME.workers.dev";
   ```
   Replace it with your actual Worker URL from step 5 (no trailing slash,
   no `/bookings`), e.g.:
   ```js
   const BOOKINGS_WORKER_ORIGIN = "https://japan-trip-bookings.yourname.workers.dev";
   ```

9. **Push everything to GitHub Pages as usual** (`index.html`,
   `entries.csv`, `manifest.json`, `sw.js`, `.gitignore` — neither the
   `worker/` nor `netlify-backend/` folder needs to be deployed to Pages at
   all; `worker/` only needs to be pushed to Cloudflare via
   `wrangler deploy`, so you can keep it in the same repo or split it out,
   whichever you prefer).

If you went with Cloudflare, skip ahead to **Using it** below — you're done.

### Option B: Netlify (Functions + Blobs)

1. **Create a free Netlify account** at https://app.netlify.com/signup if
   you don't already have one. Same idea as Cloudflare — you don't need to
   move your domain or your GitHub Pages hosting, this is a separate site
   that only exists to run the bookings function, at its own free
   `*.netlify.app` address.

2. **Install the Netlify CLI**, if you don't have it:
   ```
   npm install -g netlify-cli
   ```

3. **Log in:**
   ```
   netlify login
   ```
   This opens a browser window to authorize the CLI against your Netlify
   account.

4. **Install the backend's one dependency:**
   ```
   cd netlify-backend
   npm install
   ```
   (This pulls in `@netlify/blobs`, used by the function to read your
   stored PDFs — everything else is plain JavaScript, no build step.)

5. **Add your bookings.** Open
   `netlify-backend/netlify/functions/bookings.mjs` and fill in the
   `BOOKINGS` object, the same way as the Cloudflare version above — one
   entry per booking, keyed by the `id` from `entries.csv` or by hotel key
   (`yokohama`, `hakone`, `kyoto`, `osaka`, `koyasan`, `nara`, `tokyo`).
   Each entry can have a `confirmation` number, a `booking_url`, or both —
   and `booking_url` can be either a normal `https://` link or a
   `/files/<name>` path pointing at a PDF you've uploaded (see step 7
   below).

6. **Deploy it**, from inside `netlify-backend`:
   ```
   netlify deploy --prod
   ```
   The first time you run this, it'll ask whether to link an existing site
   or create a new one — choose **"Create & configure a new site"**, pick
   your team, and give it any name you like (or let it generate one). The
   output prints your site's URL — something like
   `https://japan-trip-bookings-a1b2c3.netlify.app`. Keep running this
   command from `netlify-backend` any time you change `BOOKINGS` and want
   to redeploy — it remembers which site it's linked to.

7. **(Optional) Upload booking PDFs.** If you have confirmation PDFs you'd
   rather store and open through the site itself, instead of just linking
   out to the booking page, run this once per file (also from inside
   `netlify-backend`, so it knows which site's storage to use):
   ```
   netlify blobs:set booking-files <name>.pdf --input=/path/to/file.pdf
   ```
   Pick whatever `<name>` makes sense to you, e.g.
   `hotel-plumm-confirmation.pdf` — it doesn't need to match the PDF's
   original filename. Then reference it in `BOOKINGS` as
   `booking_url: "/files/<name>.pdf"`. Uploading again with the same name
   just replaces it.

8. **Set your passphrase** (pick something reasonably long and random —
   this is the only thing standing between a visitor and your booking
   data, PDFs included), from inside `netlify-backend`:
   ```
   netlify env:set BOOKING_TOKEN "your-long-random-passphrase" --secret
   ```
   Then redeploy once more (`netlify deploy --prod`) so the function picks
   it up.

9. **Point the site at your Netlify function.** In `index.html`, find this
   line near the top of the `<script>` block:
   ```js
   const BOOKINGS_WORKER_ORIGIN = "https://REPLACE-ME.workers.dev";
   ```
   Replace it with your actual Netlify site URL from step 6 (no trailing
   slash), e.g.:
   ```js
   const BOOKINGS_WORKER_ORIGIN = "https://japan-trip-bookings-a1b2c3.netlify.app";
   ```
   (The constant name still says "worker" — that's just leftover naming,
   it works exactly the same with a Netlify site's URL.)

10. **Push everything to GitHub Pages as usual** (`index.html`,
    `entries.csv`, `manifest.json`, `sw.js`, `.gitignore` — neither the
    `worker/` nor `netlify-backend/` folder needs to be deployed to Pages
    at all; `netlify-backend/` only needs to be pushed to Netlify via
    `netlify deploy --prod`, so you can keep it in the same repo or split
    it out, whichever you prefer).

## Using it

- Visit your site as normal — nothing looks different, and nobody else
  visiting the link sees anything extra.
- Click the 🔒 icon in the top-right, enter your passphrase, hit Unlock.
  Confirmation numbers and booking links now appear inline on the relevant
  cards and hotel entries. The passphrase is remembered on that device
  (via `localStorage`) so you won't need to re-enter it every visit — click
  the icon again (now showing 🔓) to lock it back up, or use "Forget
  passphrase on this device" in the unlock panel.
- A booking with a stored PDF shows the same "Booking ↗" style button as an
  external link, but clicking it fetches the file with your passphrase and
  opens it in a new tab (rather than navigating to a public URL, since the
  file doesn't have one). The first open needs a connection; after that
  it's cached on-device and opens instantly offline too.
- To add or change a booking later: edit `BOOKINGS` (in
  `worker/bookings-worker.js` or `netlify-backend/netlify/functions/bookings.mjs`,
  whichever you're using) and redeploy (`wrangler deploy` or
  `netlify deploy --prod`, run from that folder). To add/replace a PDF,
  re-run the upload command from step 6/7 above. No changes to the public
  site are needed for either.

## Good to know

- This is a shared-secret model, not per-person accounts — anyone you give
  the passphrase to (or who guesses it) can see all the booking data. That's
  fine for personal/family use; it isn't meant to be bank-grade security.
- Once you've unlocked successfully with a connection, the booking data
  itself (not just the passphrase) is cached in `localStorage`. On every
  later visit — including fully offline, e.g. opening the installed PWA on
  a plane — the cached confirmation numbers and links show immediately,
  while the page quietly tries to refresh from the backend in the
  background if it can reach it. A failed background refresh because
  you're offline never clears anything; it only clears the cache if the
  backend actively rejects the passphrase (401), e.g. because you rotated
  it. This isn't covered by `sw.js` (that only caches same-origin files
  like `entries.csv`, not the cross-origin backend calls) — it's handled
  separately in `index.html`'s unlock logic.
- If you'd rather not deal with either Cloudflare or Netlify, the simplest
  fallback is to just keep confirmation numbers in a notes app instead of
  on the site — the public itinerary already flags what's confirmed vs.
  not via its existing solid/dashed border styling.
- Both providers' free tiers comfortably cover a folder of trip PDFs and
  the handful of requests this site makes (Cloudflare R2: 10GB storage;
  Netlify Blobs: 1GB on the free plan; both far more than you need here).
  There's no cleanup step needed if you skip the PDF-upload step entirely —
  the bucket/store just sits empty and unused.
- Only set up *one* of the two backends — running both isn't necessary,
  and `BOOKINGS_WORKER_ORIGIN` in `index.html` can only point at one at a
  time. If you ever want to switch later, redeploy under the other option
  and update that one line.
