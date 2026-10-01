create table if not exists tracked_accounts (
  username text primary key,
  tiktok_id text,
  nickname text,
  bio text,
  avatar_url text,
  verified boolean default false,
  private_account boolean default false,
  create_time bigint,
  followers integer default 0,
  following integer default 0,
  likes bigint default 0,
  video_count integer default 0,
  added_at timestamptz not null default now(),
  last_checked_at timestamptz
);

create table if not exists snapshots (
  id bigint generated always as identity primary key,
  username text not null references tracked_accounts(username) on delete cascade,
  followers integer,
  following integer,
  likes bigint,
  video_count integer,
  captured_at timestamptz not null default now()
);

create index if not exists snapshots_username_captured_at_idx
  on snapshots (username, captured_at);

-- Row Level Security: the Edge Function talks to Postgres with the
-- service_role key, which bypasses RLS entirely - these tables are never
-- queried directly by a browser client, so locking them down here is just
-- defense in depth in case that ever changes.
alter table tracked_accounts enable row level security;
alter table snapshots enable row level security;
