# TikTok Pulse

A personal TikTok growth tracker: type in a username, get full profile stats,
and a "where to strengthen" list of growth suggestions — on Windows and
Android. No TikTok login required; it reads the same data TikTok's public
profile page already shows anyone who visits it.

```
supabase/
  functions/api/   the JSON API - a Supabase Edge Function (Deno)
  migrations/       the Postgres schema (tracked_accounts, snapshots)
  public/           canonical source for the shared UI (copied into both apps below)
desktop/            Electron wrapper (Windows) - UI bundled in ui/
mobile/             Capacitor wrapper (Android) - UI bundled in www/, native
                    project already generated at mobile/android/
```

**Everything runs on Supabase**: Postgres for data, an Edge Function for the
API. There's no separate server to host or keep running. The UI itself is
bundled directly into each app rather than fetched from a URL at runtime —
see "Why the UI is bundled, not hosted" below for why.

Already deployed and working at project `ckvrruuvbpigusybylew`:
- API: `https://ckvrruuvbpigusybylew.supabase.co/functions/v1/api`
- Both apps' bundled UI already point at that URL (`ui/app.js` /
  `www/app.js`'s `API_BASE` constant) with the app key already set

## 1. Run the desktop app

```bash
cd desktop
npm install
npm start
```

Enter the app key when prompted (ask if you don't have it handy - it's the
same one set as the `API_KEY` secret on the Supabase function). To build a
real Windows installer: `npm run dist`.

## 2. Build the Android app

The native project is already generated and synced at `mobile/android/` —
open that folder directly in Android Studio (File → Open), let it sync, then
Run on a device or emulator.

If you change the shared UI (`supabase/public/`) later, re-copy it into
`mobile/www/` and `desktop/ui/`, then re-sync Android:

```bash
cd mobile
node node_modules/@capacitor/cli/bin/capacitor sync android
```

(`npx cap sync android` should also work on a normal machine - it only
needed the direct `node node_modules/...` form here because of a local
PATH/ComSpec quirk unrelated to this project.)

## If you ever need to change the API or database schema

- API code: `supabase/functions/api/*.ts` - deploy with the Supabase CLI
  (`supabase functions deploy api`) or the Management API
  (`POST /v1/projects/{ref}/functions/deploy?slug=api`, multipart form with a
  `metadata` JSON part and one `file` part per source file)
- Schema changes: write a new file in `supabase/migrations/`, run it via the
  SQL Editor in the Supabase dashboard, or `POST /v1/projects/{ref}/database/query`
  with a personal access token
- Secrets (`API_KEY`, `CACHE_MINUTES`): Supabase dashboard → Edge Functions →
  Manage secrets, or `POST /v1/projects/{ref}/secrets`

## Why the UI is bundled, not hosted

The original plan was to also host the frontend on Supabase (Storage or the
Edge Function itself) so any browser could reach it with just a URL. That
turned out not to work: Supabase deliberately forces `Content-Type:
text/plain` (plus a locked-down CSP) on any HTML served from its own shared
`*.supabase.co` domain, from both Edge Functions and Storage — a security
measure against using Supabase's domain to host live, executable pages.
Confirmed directly while building this, not a guess. So the UI is bundled
into each app instead (`desktop/ui/`, `mobile/www/`), which is also just
normal practice for Electron/Capacitor apps - only the JSON API calls go to
Supabase, and the Edge Function sends proper CORS headers to allow that from
the apps' bundled-content origins.

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
  TikTok can rate-limit or block an IP that does this a lot. The app caches
  each account for 30 minutes to keep requests infrequent.
