const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

function deepFindAll(root: unknown, pred: (o: any) => boolean, maxResults = 50): any[] {
  const seen = new Set<unknown>();
  const stack: unknown[] = [root];
  const found: any[] = [];
  let guard = 0;
  while (stack.length && guard < 200000 && found.length < maxResults) {
    guard++;
    const obj = stack.pop();
    if (!obj || typeof obj !== "object" || seen.has(obj)) continue;
    seen.add(obj);
    if (pred(obj)) found.push(obj);
    const vals = Array.isArray(obj) ? obj : Object.values(obj as object);
    for (const v of vals) if (v && typeof v === "object") stack.push(v);
  }
  return found;
}

function deepFindOne(root: unknown, pred: (o: any) => boolean) {
  return deepFindAll(root, pred, 1)[0] || null;
}

function extractJsonBlobs(html: string): any[] {
  const blobs: any[] = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const content = m[1].trim();
    if (!content.startsWith("{") && !content.startsWith("[")) continue;
    try {
      blobs.push(JSON.parse(content));
    } catch {
      // not every inline script is JSON (some are plain JS) - skip those
    }
  }
  return blobs;
}

export class ScraperError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Fetches a public TikTok profile page and pulls out the profile + stats
 * TikTok server-renders into the page itself. No login, no official API -
 * same approach validated manually against a real account during setup.
 */
export async function fetchProfile(username: string) {
  const clean = String(username).trim().replace(/^@/, "");
  const res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(clean)}`, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (res.status === 404) throw new ScraperError(`No TikTok account found for @${clean}`, "NOT_FOUND");
  if (!res.ok) throw new ScraperError(`TikTok returned HTTP ${res.status} for @${clean}`, "UPSTREAM_ERROR");

  const html = await res.text();
  const blobs = extractJsonBlobs(html);
  if (blobs.length === 0) {
    throw new ScraperError(
      "Couldn't find any embedded data on the page - TikTok may have changed its page format, or is blocking this server.",
      "PARSE_FAILED"
    );
  }
  const root = { blobs };

  const user = deepFindOne(root, (o) => !Array.isArray(o) && typeof o.uniqueId === "string");
  if (!user) throw new ScraperError(`Couldn't find profile data for @${clean} on the page.`, "PARSE_FAILED");

  const stats = deepFindOne(
    root,
    (o) => !Array.isArray(o) && typeof o.followerCount !== "undefined" && typeof o.followingCount !== "undefined"
  );

  // Note: TikTok's profile page server-renders user + stats, but its video
  // list ("itemList") ships empty in that same payload - videos load via a
  // separate, signed API call (msToken/X-Bogus) that a plain page fetch
  // can't produce. Verified live while building this. Per-video stats would
  // need TikTok login or a headless browser - out of scope by design.

  return {
    username: user.uniqueId as string,
    tiktokId: (user.id as string) ?? null,
    nickname: (user.nickname as string) || "",
    bio: (user.signature as string) || "",
    avatarUrl: (user.avatarLarger || user.avatarMedium || user.avatarThumb || "") as string,
    verified: !!user.verified,
    privateAccount: !!user.privateAccount,
    createTime: user.createTime ? Number(user.createTime) : null,
    followers: stats ? Number(stats.followerCount) || 0 : 0,
    following: stats ? Number(stats.followingCount) || 0 : 0,
    likes: stats ? Number(stats.heart ?? stats.heartCount) || 0 : 0,
    videoCount: stats ? Number(stats.videoCount) || 0 : 0,
  };
}
