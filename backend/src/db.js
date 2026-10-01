const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "pulse.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS tracked_accounts (
    username TEXT PRIMARY KEY,
    tiktok_id TEXT,
    nickname TEXT,
    bio TEXT,
    avatar_url TEXT,
    verified INTEGER DEFAULT 0,
    private_account INTEGER DEFAULT 0,
    create_time INTEGER,
    followers INTEGER DEFAULT 0,
    following INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    video_count INTEGER DEFAULT 0,
    added_at TEXT NOT NULL,
    last_checked_at TEXT
  );

  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    followers INTEGER,
    following INTEGER,
    likes INTEGER,
    video_count INTEGER,
    captured_at TEXT NOT NULL
  );

`);

module.exports = db;
