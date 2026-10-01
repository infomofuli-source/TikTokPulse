import { createClient } from "npm:@supabase/supabase-js@2";

// Auto-provided to every Supabase Edge Function - no manual secret needed.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

export interface Profile {
  username: string;
  tiktokId: string | null;
  nickname: string;
  bio: string;
  avatarUrl: string;
  verified: boolean;
  privateAccount: boolean;
  createTime: number | null;
  followers: number;
  following: number;
  likes: number;
  videoCount: number;
}

export async function getAccount(username: string) {
  const { data, error } = await supabase
    .from("tracked_accounts")
    .select("*")
    .eq("username", username)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listAccounts() {
  const { data, error } = await supabase
    .from("tracked_accounts")
    .select("username, nickname, avatar_url, followers, following, likes, video_count, verified, last_checked_at")
    .order("added_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function upsertAccount(profile: Profile, now: string) {
  // added_at is intentionally omitted: its column default (now()) covers a
  // first insert, and leaving it out of the upsert payload means an update
  // never touches it, so it stays put on repeat check-ins.
  const { error } = await supabase.from("tracked_accounts").upsert({
    username: profile.username,
    tiktok_id: profile.tiktokId,
    nickname: profile.nickname,
    bio: profile.bio,
    avatar_url: profile.avatarUrl,
    verified: profile.verified,
    private_account: profile.privateAccount,
    create_time: profile.createTime,
    followers: profile.followers,
    following: profile.following,
    likes: profile.likes,
    video_count: profile.videoCount,
    last_checked_at: now,
  });
  if (error) throw error;
}

export async function deleteAccount(username: string) {
  // snapshots cascade-delete via the foreign key in the migration.
  const { error } = await supabase.from("tracked_accounts").delete().eq("username", username);
  if (error) throw error;
}

export async function addSnapshot(username: string, profile: Profile, now: string) {
  const { error } = await supabase.from("snapshots").insert({
    username,
    followers: profile.followers,
    following: profile.following,
    likes: profile.likes,
    video_count: profile.videoCount,
    captured_at: now,
  });
  if (error) throw error;
}

export async function listSnapshots(username: string) {
  const { data, error } = await supabase
    .from("snapshots")
    .select("followers, following, likes, video_count, captured_at")
    .eq("username", username)
    .order("captured_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
