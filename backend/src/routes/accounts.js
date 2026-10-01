const express = require("express");
const db = require("../db");
const { fetchProfile } = require("../scraper");
const { buildInsights } = require("../insights");

const router = express.Router();
const CACHE_MINUTES = Number(process.env.CACHE_MINUTES || 30);

function normalize(username) {
  return String(username || "").trim().replace(/^@/, "").toLowerCase();
}

function isStale(lastCheckedAt) {
  if (!lastCheckedAt) return true;
  const ageMs = Date.now() - new Date(lastCheckedAt).getTime();
  return ageMs > CACHE_MINUTES * 60 * 1000;
}

async function refreshAccount(username) {
  const profile = await fetchProfile(username);
  const now = new Date().toISOString();

  const exists = db.prepare("SELECT username FROM tracked_accounts WHERE username = ?").get(profile.username);
  if (exists) {
    db.prepare(
      `UPDATE tracked_accounts SET
        tiktok_id=?, nickname=?, bio=?, avatar_url=?, verified=?, private_account=?,
        create_time=?, followers=?, following=?, likes=?, video_count=?, last_checked_at=?
       WHERE username=?`
    ).run(
      profile.tiktokId, profile.nickname, profile.bio, profile.avatarUrl,
      profile.verified ? 1 : 0, profile.privateAccount ? 1 : 0, profile.createTime,
      profile.followers, profile.following, profile.likes, profile.videoCount,
      now, profile.username
    );
  } else {
    db.prepare(
      `INSERT INTO tracked_accounts
        (username, tiktok_id, nickname, bio, avatar_url, verified, private_account,
         create_time, followers, following, likes, video_count, added_at, last_checked_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      profile.username, profile.tiktokId, profile.nickname, profile.bio, profile.avatarUrl,
      profile.verified ? 1 : 0, profile.privateAccount ? 1 : 0, profile.createTime,
      profile.followers, profile.following, profile.likes, profile.videoCount, now, now
    );
  }

  db.prepare(
    `INSERT INTO snapshots (username, followers, following, likes, video_count, captured_at)
     VALUES (?,?,?,?,?,?)`
  ).run(profile.username, profile.followers, profile.following, profile.likes, profile.videoCount, now);

  return profile.username;
}

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT username, nickname, avatar_url, followers, following, likes, video_count, verified, last_checked_at
       FROM tracked_accounts ORDER BY added_at DESC`
    )
    .all();
  res.json({ accounts: rows });
});

router.post("/", async (req, res) => {
  const username = normalize(req.body && req.body.username);
  if (!username) return res.status(400).json({ error: "username is required" });
  try {
    const saved = await refreshAccount(username);
    res.status(201).json({ username: saved });
  } catch (err) {
    res.status(err.code === "NOT_FOUND" ? 404 : 502).json({ error: err.message });
  }
});

router.delete("/:username", (req, res) => {
  const username = normalize(req.params.username);
  db.prepare("DELETE FROM tracked_accounts WHERE username = ?").run(username);
  res.json({ ok: true });
});

router.post("/:username/refresh", async (req, res) => {
  const username = normalize(req.params.username);
  try {
    await refreshAccount(username);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.code === "NOT_FOUND" ? 404 : 502).json({ error: err.message });
  }
});

router.get("/:username", async (req, res) => {
  const username = normalize(req.params.username);
  let account = db.prepare("SELECT * FROM tracked_accounts WHERE username = ?").get(username);

  try {
    if (!account || isStale(account.last_checked_at)) {
      await refreshAccount(username);
      account = db.prepare("SELECT * FROM tracked_accounts WHERE username = ?").get(username);
    }
  } catch (err) {
    if (!account) {
      return res.status(err.code === "NOT_FOUND" ? 404 : 502).json({ error: err.message });
    }
    // stale cached data beats no data if a refresh fails
  }

  const snapshots = db
    .prepare("SELECT followers, following, likes, video_count, captured_at FROM snapshots WHERE username = ? ORDER BY captured_at ASC")
    .all(username);

  const profile = {
    username: account.username,
    nickname: account.nickname,
    bio: account.bio,
    avatarUrl: account.avatar_url,
    verified: !!account.verified,
    privateAccount: !!account.private_account,
    createTime: account.create_time,
    followers: account.followers,
    following: account.following,
    likes: account.likes,
    videoCount: account.video_count,
    lastCheckedAt: account.last_checked_at,
  };

  res.json({
    profile,
    history: snapshots,
    insights: buildInsights(profile, snapshots),
  });
});

module.exports = router;
