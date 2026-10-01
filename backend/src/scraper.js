const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

function deepFindAll(root, pred, maxResults = 50) {
  const seen = new Set();
  const stack = [root];
  const found = [];
  let guard = 0;
  while (stack.length && guard < 200000 && found.length < maxResults) {
    guard++;
    const obj = stack.pop();
    if (!obj || typeof obj !== "object" || seen.has(obj)) continue;
    seen.add(obj);
    if (pred(obj)) found.push(obj);
    const vals = Array.isArray(obj) ? obj : Object.values(obj);
    for (const v of vals) if (v && typeof v === "object") stack.push(v);
  }
  return found;
}

function deepFindOne(root, pred) {
  const r = deepFindAll(root, pred, 1);
  return r[0] || null;
}

function extractJsonBlobs(html) {
  const blobs = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const content = m[1].trim();
    if (!content.startsWith("{") && !content.startsWith("[")) continue;
    try {
      blobs.push(JSON.parse(content));
    } catch (e) {
      // not every inline script is JSON (some are plain JS) - skip those
    }
  }
  return blobs;
}

/**
 * Fetches a public TikTok profile page and pulls out the profile + stats +
 * recent video items TikTok server-renders into the page itself. No login,
 * no official API - same approach validated manually against a real account
 * during setup, and the same technique the TikTok-OSINT project used.
 */
async function fetchProfile(username) {
  const clean = String(username).trim().replace(/^@/, "");
  const res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(clean)}`, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (res.status === 404) {
    const err = new Error(`No TikTok account found for @${clean}`);
    err.code = "NOT_FOUND";
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`TikTok returned HTTP ${res.status} for @${clean}`);
    err.code = "UPSTREAM_ERROR";
    throw err;
  }

  const html = await res.text();
  const blobs = extractJsonBlobs(html);
  if (blobs.length === 0) {
    const err = new Error(
      "Couldn't find any embedded data on the page - TikTok may have changed its page format, or is blocking this server."
    );
    err.code = "PARSE_FAILED";
    throw err;
  }
  const root = { blobs };

  const user = deepFindOne(root, (o) => !Array.isArray(o) && typeof o.uniqueId === "string");
  if (!user) {
    const err = new Error(`Couldn't find profile data for @${clean} on the page.`);
    err.code = "PARSE_FAILED";
    throw err;
  }

  const stats = deepFindOne(
    root,
    (o) => !Array.isArray(o) && typeof o.followerCount !== "undefined" && typeof o.followingCount !== "undefined"
  );

  // Note: TikTok's profile page server-renders user + stats, but its video
  // list ("itemList") ships empty in that same payload - videos load via a
  // separate, signed API call (msToken/X-Bogus) that a plain page fetch can't
  // produce. Verified live: itemList is `[]` and the unsigned item_list
  // endpoint returns HTTP 200 with an empty body (a soft block, not an
  // error). Getting real per-video stats without TikTok login would require
  // a headless browser - out of scope here, so this app works at the
  // profile/stats level only.

  return {
    username: user.uniqueId,
    tiktokId: user.id,
    nickname: user.nickname || "",
    bio: user.signature || "",
    avatarUrl: user.avatarLarger || user.avatarMedium || user.avatarThumb || "",
    verified: !!user.verified,
    privateAccount: !!user.privateAccount,
    createTime: user.createTime ? Number(user.createTime) : null,
    followers: stats ? Number(stats.followerCount) || 0 : 0,
    following: stats ? Number(stats.followingCount) || 0 : 0,
    likes: stats ? Number(stats.heart ?? stats.heartCount) || 0 : 0,
    videoCount: stats ? Number(stats.videoCount) || 0 : 0,
  };
}

module.exports = { fetchProfile };
