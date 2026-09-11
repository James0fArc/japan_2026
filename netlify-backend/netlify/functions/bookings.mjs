// Netlify Function: gates private booking details AND stored booking files
// (PDFs etc.) behind a shared passphrase.
//
// The public itinerary site (GitHub Pages) never contains booking
// confirmation numbers, private reservation links, or booking PDFs -- it
// only asks THIS function for them, and only gets them back if the request
// carries the correct passphrase as a Bearer token. Anyone without the
// passphrase gets a 401, even if they inspect the site's network requests
// directly or guess a file's URL.
//
// Routes (both routed here via the `config.path` export at the bottom):
//   GET /bookings    -> the BOOKINGS json below
//   GET /files/<key> -> the matching object from the "booking-files" Netlify
//                        Blobs store
// Both require the same Authorization: Bearer <passphrase> header.
//
// Deploy with:  netlify deploy --prod       (from this /netlify-backend directory)
// Set the passphrase with:  netlify env:set BOOKING_TOKEN "<value>" --secret
// Upload a file with:  netlify blobs:set booking-files <name> --input=<path>
// (see SETUP.md for the full walkthrough, including linking the site)
//
// To add or update a booking, edit the BOOKINGS object below and redeploy.

import { getStore } from "@netlify/blobs";

const BOOKINGS = {
  // Keyed by the "id" column in entries.csv. Add one entry per booking you
  // want to show. `confirmation` and `booking_url` are both optional --
  // include whichever you have. `links` is an optional array of
  // {label, url} for anything with more than one link (e.g. separate
  // tickets per passenger for the same journey) -- it can be used
  // alongside `booking_url` or instead of it.
  //
  // A url (in `booking_url` or `links`) can be either:
  //   - a normal https:// link (e.g. straight to the booking page), or
  //   - a "/files/<name>" path pointing at a file you've uploaded to the
  //     booking-files Blobs store below. The site fetches these with your
  //     passphrase and opens them -- the file itself is never sitting at
  //     a public, guessable URL.
  entries: {
    // Odawara -> Kyoto Shinkansen, 8 Oct -- one ticket per passenger.
    "e014": {
      links: [
        { label: "Ticket 1", url: "https://shinkansen2.jr-central.co.jp/RSV_P/ClientServiceQR-Ticket?_encParam=0300N1zemTLu00R5BbCanj005SvC6hhh00al2ZRdEk002zgMHdku00Ittklv2q00wmtdRknW008G9wg1Fq00oVycrKlU00Ii8" },
        { label: "Ticket 2", url: "https://shinkansen2.jr-central.co.jp/RSV_P/ClientServiceQR-Ticket?_encParam=0300NIkDkOd600HYGCy35o009kJVw3td001akN6I3Q002zgMHdku00Ittklv2q00wmtdRknW008G9wg1Fq00oVycrKcU00IiW" }
      ]
    },
    // Hozugawa Kudari Boat Ride, 9 Oct -- printable voucher with the
    // boarding QR code, stored so it opens straight from the site.
    "e020": {
      confirmation: "ARS_HOZUGAWA-20260910-6TSR",
      booking_url: "/files/hosugawavoucher.pdf"
    },
    // Sagano Scenic Railway, 9 Oct.
    "e051": {
      confirmation: "ARS_SAGANO_KANKO-20260910-5MNU",
      booking_url: "https://t.linktivity.io/issueticket/sagano-kanko/dGD9nN_zDNWrc6zQ/ARS_SAGANO_KANKO-20260910-5MNU/-?lang=EN"
    },
    // Ghibli Museum, 18 Oct -- entry ticket has its own QR code, so this is
    // stored too rather than just linked.
    "e042": {
      confirmation: "8844739851",
      booking_url: "/files/ghiblitickets.pdf"
    },
    // Pokémon Cafe -- this link was previously a public field in
    // entries.csv (moved here because it's a personal reservation link).
    // No separate confirmation number given for this one.
    "e052": {
      booking_url: "https://reserve.pokemon-cafe.jp/reservations/MjyqdPD8NqMPEkGr"
    }
  },

  // Keyed by the hotel keys used in index.html's HOTELS object:
  // yokohama, hakone, kyoto, osaka, koyasan, nara, tokyo.
  hotels: {
    yokohama: { confirmation: "6663.162.215 (PIN 8314)", booking_url: "/files/Yokohama.pdf" },
    hakone:   { confirmation: "5630.831.959 (PIN 8393)", booking_url: "/files/Hakone.pdf" },
    kyoto:    { confirmation: "5535.594.781 (PIN 9295)", booking_url: "/files/Kyoto.pdf" },
    osaka:    { confirmation: "5573.927.581 (PIN 2783)", booking_url: "/files/Osaka.pdf" },
    koyasan:  { confirmation: "6751.592.975 (PIN 3502)", booking_url: "/files/Koyasan.pdf" },
    nara:     { confirmation: "5584.259.819 (PIN 2395)", booking_url: "/files/Nara.pdf" },
    tokyo:    { confirmation: "5535.568.893 (PIN 9871)", booking_url: "/files/Tokyo.pdf" }
  }
};

function corsHeaders(){
  return {
    // Tighten this to your GitHub Pages origin (e.g. "https://yourname.github.io")
    // if you'd like -- it doesn't add real security (the token check below is
    // what actually protects everything), just tidiness.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

function unauthorizedResponse(){
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

// Netlify Blobs (unlike R2's --content-type flag on upload) doesn't have a
// simple CLI way to attach a content-type to an uploaded file, so we just
// guess it from the extension when serving it back. Everything in this
// trip's bookings is a PDF, so that's the sensible default either way.
function guessContentType(key){
  const ext = (key.split(".").pop() || "").toLowerCase();
  const map = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  return map[ext] || "application/pdf";
}

export default async (req, context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const authorized = !!process.env.BOOKING_TOKEN && !!token && token === process.env.BOOKING_TOKEN;

  if (!authorized) return unauthorizedResponse();

  const url = new URL(req.url);

  if (url.pathname === "/bookings") {
    return new Response(JSON.stringify(BOOKINGS), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  const rawKey = context.params && context.params.key;
  if (rawKey) {
    const key = decodeURIComponent(rawKey);
    const store = getStore("booking-files");
    const data = await store.get(key, { type: "arrayBuffer" });
    if (!data) {
      return new Response("Not found", { status: 404, headers: corsHeaders() });
    }
    const headers = new Headers(corsHeaders());
    headers.set("Content-Type", guessContentType(key));
    // "inline" so it opens in a browser tab instead of forcing a download.
    headers.set("Content-Disposition", 'inline; filename="' + key.split("/").pop() + '"');
    headers.set("Cache-Control", "private, max-age=3600");
    return new Response(data, { status: 200, headers });
  }

  return new Response("Not found", { status: 404, headers: corsHeaders() });
};

export const config = {
  path: ["/bookings", "/files/:key"],
};
