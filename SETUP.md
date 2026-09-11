# Adding private booking details to your itinerary

## What changed

- `entries.csv` and `index.html` are still the same public site you had —
  it deploys to GitHub Pages exactly as before, no auth, no build step.
- One personal link that was sitting in the public CSV (the Pokémon Cafe
  reservation URL) has been moved out — its row's `id` changed from `e034`
  to `e052` (it happened to duplicate another row's id, which would have
  broken the booking lookup below — worth knowing about even aside from
  this change).
- A new `worker/` folder holds a small Cloudflare Worker. This is the only
  place your booking confirmation numbers and private reservation links
  live. It only hands them back to a request that includes the correct
  passphrase — so the public site stays exactly as shareable as it is now,
  and the private data is never part of what ships to a random visitor.
- `index.html` now has a small 🔒 button in the header. Clicking it prompts
  for the passphrase, calls the Worker, and — only on success — merges the
  booking details into the page for that device. Nobody without the
  passphrase ever sees it, even by viewing source or the network tab.

## One-time setup (about 10 minutes)

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
   `booking_url`, or both.

5. **Deploy the Worker:**
   ```
   cd worker
   wrangler deploy
   ```
   The output prints your Worker's URL — something like
   `https://japan-trip-bookings.<your-subdomain>.workers.dev`.

6. **Set your passphrase** (pick something reasonably long and random —
   this is the only thing standing between a visitor and your booking
   data):
   ```
   wrangler secret put BOOKING_TOKEN
   ```
   It'll prompt you to type the value.

7. **Point the site at your Worker.** In `index.html`, find this line near
   the top of the `<script>` block:
   ```js
   const BOOKINGS_WORKER_URL = "https://REPLACE-ME.workers.dev/bookings";
   ```
   Replace it with your actual Worker URL from step 5, with `/bookings`
   appended, e.g.:
   ```js
   const BOOKINGS_WORKER_URL = "https://japan-trip-bookings.yourname.workers.dev/bookings";
   ```

8. **Push everything to GitHub Pages as usual** (`index.html`,
   `entries.csv`, `manifest.json`, `sw.js`, `.gitignore` — the `worker/`
   folder doesn't need to be deployed to Pages at all; it only needs to be
   pushed to Cloudflare via `wrangler deploy`, so you can keep it in the
   same repo or split it out, whichever you prefer).

## Using it

- Visit your site as normal — nothing looks different, and nobody else
  visiting the link sees anything extra.
- Click the 🔒 icon in the top-right, enter your passphrase, hit Unlock.
  Confirmation numbers and booking links now appear inline on the relevant
  cards and hotel entries. The passphrase is remembered on that device
  (via `localStorage`) so you won't need to re-enter it every visit — click
  the icon again (now showing 🔓) to lock it back up, or use "Forget
  passphrase on this device" in the unlock panel.
- To add or change a booking later: edit `BOOKINGS` in
  `worker/bookings-worker.js` and run `wrangler deploy` again from the
  `worker/` folder. No changes to the public site are needed.

## Good to know

- This is a shared-secret model, not per-person accounts — anyone you give
  the passphrase to (or who guesses it) can see all the booking data. That's
  fine for personal/family use; it isn't meant to be bank-grade security.
- Once you've unlocked successfully with a connection, the booking data
  itself (not just the passphrase) is cached in `localStorage`. On every
  later visit — including fully offline, e.g. opening the installed PWA on
  a plane — the cached confirmation numbers and links show immediately,
  while the page quietly tries to refresh from the Worker in the
  background if it can reach it. A failed background refresh because
  you're offline never clears anything; it only clears the cache if the
  Worker actively rejects the passphrase (401), e.g. because you rotated
  it. This isn't covered by `sw.js` (that only caches same-origin files
  like `entries.csv`, not the cross-origin Worker calls) — it's handled
  separately in `index.html`'s unlock logic.
- If you'd rather not deal with Cloudflare at all, the simplest fallback is
  to just keep confirmation numbers in a notes app instead of on the site —
  the public itinerary already flags what's confirmed vs. not via its
  existing solid/dashed border styling.
