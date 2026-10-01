# TikTok Pulse

A personal TikTok growth tracker: type in a username, get full profile stats,
and a "where to strengthen" list of growth suggestions — on Windows and
Android. No TikTok login required; it reads the same data TikTok's public
profile page already shows anyone who visits it.

```
backend/    Node/Express API + the web UI it serves (public/)
desktop/    Electron wrapper (Windows) that opens the backend's URL
mobile/     Capacitor wrapper (Android) that does the same
```

## 1. Run the backend

```bash
cd backend
npm install
copy .env.example .env
```

Edit `.env` and set `API_KEY` to any random string you choose — both apps
will need to send this exact value, so you'll paste it into each app once.

```bash
npm start
```

Open `http://localhost:4100` in a browser, enter your `API_KEY`, and add a
TikTok username (try your own first).

## 2. Run the desktop app

```bash
cd desktop
npm install
npm start
```

By default it points at `http://localhost:4100` (set in `desktop/config.json`
— edit that file, no rebuild needed, if you move the backend elsewhere).

To build a real Windows installer: `npm run dist` (needs `npm install` first).

## 3. Build the Android app

The native project is already generated at `mobile/android/` — open that
folder directly in Android Studio (File → Open), let it sync, then Run on a
device or emulator.

Before building, point it at your backend: edit
`mobile/capacitor.config.json`'s `server.url`, then run:

```bash
cd mobile
npx cap sync android
```

(If `npx` fails with a `cmd.exe` spawn error on this machine — a PATH/ComSpec
quirk unrelated to this project — run
`node node_modules/@capacitor/cli/bin/capacitor sync android` instead.)

## 4. Deploy the backend so the phone app works away from home

1. Push this repo to GitHub (can be private)
2. On [Render.com](https://render.com) (free tier): New → Web Service → connect
   the repo → set **Root Directory** to `backend` → it picks up `backend/render.yaml`
   → set the `API_KEY` env var to the same value you used locally
3. You'll get a URL like `https://tiktok-pulse.onrender.com` — put that in
   `desktop/config.json` and `mobile/capacitor.config.json` (and switch
   `cleartext` to `false` there once it's `https://`)

**Free-tier limits worth knowing:**
- Spins down after inactivity — first request after a while takes ~30-50s to
  wake up.
- No persistent disk on the free plan, so the SQLite file (and with it, your
  follower-history trend) resets on every redeploy and restart. Profile
  lookups still work fine either way since they re-fetch from TikTok. If you
  want history that actually survives long-term, move to a host with a
  persistent volume (e.g. Fly.io's free allowance includes one) — nothing
  else about the app needs to change.

## What this can and can't do

- **Works well:** followers, following, likes, video count, bio, avatar,
  verified status, account creation date, and growth-over-time once you've
  checked in more than once — all pulled straight from the public profile
  page, same as anyone visiting it in a browser would see.
- **Doesn't work:** per-video stats (which specific video is over/under-
  performing). TikTok only serves that through a signed, logged-in request a
  plain page fetch can't produce — confirmed while building this (the page's
  embedded video list comes back empty, and the unsigned API call TikTok
  would need returns an empty response rather than an error). Getting real
  per-video numbers would need either TikTok's official OAuth login or a
  headless-browser scraper — out of scope here by design, since you asked
  specifically to avoid the OAuth login flow.
- Because there's no login, every lookup is an anonymous page request —
  TikTok can rate-limit or block an IP that does this a lot, and that risk is
  somewhat higher from a cloud host's IP range than from a home connection.
  The app caches each account for 30 minutes to keep requests infrequent.
