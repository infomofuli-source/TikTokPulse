import { Hono } from "npm:hono@4";
import { cors } from "npm:hono@4/cors";
import * as db from "./db.ts";
import { fetchProfile, ScraperError } from "./scraper.ts";
import { buildInsights } from "./insights.ts";

const CACHE_MINUTES = Number(Deno.env.get("CACHE_MINUTES") || 30);
const API_KEY = Deno.env.get("API_KEY");

// This function is a pure JSON API. The frontend is bundled directly into
// the desktop and Android apps rather than hosted on Supabase - both
// Edge Functions and Storage force any HTML response to text/plain plus a
// restrictive CSP as a security boundary against serving live executable
// pages from Supabase's own shared domain (confirmed live while building
// this - not a bug, a deliberate platform policy). Since the apps' bundled
// UI calls this function from a different origin (file:// for Electron,
// Capacitor's local scheme for Android), real CORS headers are needed.

function normalize(username: string | undefined | null): string {
  return String(username || "").trim().replace(/^@/, "").toLowerCase();
}

function isStale(lastCheckedAt: string | null): boolean {
  if (!lastCheckedAt) return true;
  return Date.now() - new Date(lastCheckedAt).getTime() > CACHE_MINUTES * 60 * 1000;
}

async function refreshAccount(username: string): Promise<string> {
  const profile = await fetchProfile(username);
  const now = new Date().toISOString();
  await db.upsertAccount(profile, now);
  await db.addSnapshot(profile.username, profile, now);
  return profile.username;
}

function errorStatus(err: unknown): 404 | 502 {
  return err instanceof ScraperError && err.code === "NOT_FOUND" ? 404 : 502;
}

const app = new Hono().basePath("/api");

// Permissive CORS: the real access control is the X-App-Key check below,
// not the browser's same-origin policy - the app shell's origin varies
// (file://, Capacitor's local scheme) and isn't worth pinning down here.
app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", "X-App-Key"] }));

app.get("/health", (c) => c.json({ ok: true }));

const requireAppKey = async (c: any, next: () => Promise<void>) => {
  if (!API_KEY) return next(); // no key configured (local dev) - allow through
  if (c.req.header("X-App-Key") !== API_KEY) {
    return c.json({ error: "Missing or invalid X-App-Key header" }, 401);
  }
  await next();
};
// "/accounts/*" alone already matches the bare "/accounts" too in Hono.
app.use("/accounts/*", requireAppKey);

app.get("/accounts", async (c) => {
  const accounts = await db.listAccounts();
  return c.json({ accounts });
});

app.post("/accounts", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = normalize(body.username);
  if (!username) return c.json({ error: "username is required" }, 400);
  try {
    const saved = await refreshAccount(username);
    return c.json({ username: saved }, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, errorStatus(err));
  }
});

app.delete("/accounts/:username", async (c) => {
  await db.deleteAccount(normalize(c.req.param("username")));
  return c.json({ ok: true });
});

app.post("/accounts/:username/refresh", async (c) => {
  const username = normalize(c.req.param("username"));
  try {
    await refreshAccount(username);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, errorStatus(err));
  }
});

app.get("/accounts/:username", async (c) => {
  const username = normalize(c.req.param("username"));
  let account = await db.getAccount(username);

  try {
    if (!account || isStale(account.last_checked_at)) {
      await refreshAccount(username);
      account = await db.getAccount(username);
    }
  } catch (err) {
    if (!account) return c.json({ error: (err as Error).message }, errorStatus(err));
    // stale cached data beats no data if a refresh fails
  }

  const snapshots = await db.listSnapshots(username);

  const profile = {
    username: account!.username,
    nickname: account!.nickname,
    bio: account!.bio,
    avatarUrl: account!.avatar_url,
    verified: !!account!.verified,
    privateAccount: !!account!.private_account,
    createTime: account!.create_time,
    followers: account!.followers,
    following: account!.following,
    likes: account!.likes,
    videoCount: account!.video_count,
    lastCheckedAt: account!.last_checked_at,
  };

  return c.json({
    profile,
    history: snapshots,
    insights: buildInsights(profile, snapshots),
  });
});

Deno.serve(app.fetch);
