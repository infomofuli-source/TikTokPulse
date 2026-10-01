const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Turns stored profile + history snapshots into a ranked list of
 * plain-language suggestions. These are general social-growth rules of
 * thumb, not a scientific model - framed that way on purpose.
 *
 * Note: this works from profile-level stats only (followers, following,
 * likes, video count) tracked over time. Per-video stats (which would enable
 * engagement-rate-per-video and exact posting-cadence insights) aren't
 * available without a TikTok login - see the note in scraper.js.
 */
function buildInsights(profile, snapshots) {
  const findings = [];

  // --- posting activity, proxied by video_count change between snapshots ---
  if (snapshots.length >= 2) {
    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const spanDays = Math.max((new Date(last.captured_at) - new Date(first.captured_at)) / DAY_MS, 1);
    const newVideos = last.video_count - first.video_count;
    if (spanDays >= 2) {
      const perWeek = (newVideos / spanDays) * 7;
      if (newVideos <= 0) {
        findings.push({
          area: "Posting activity",
          severity: "high",
          detail: `Video count hasn't moved in the ${spanDays.toFixed(1)} days since tracking started - no new posts detected. Consistent posting is one of the fastest ways to get TikTok's algorithm to show an account to new people.`,
        });
      } else if (perWeek < 2) {
        findings.push({
          area: "Posting activity",
          severity: "medium",
          detail: `About ${perWeek.toFixed(1)} new videos/week since tracking started. Accounts that grow steadily usually post 3-7 times a week.`,
        });
      } else {
        findings.push({
          area: "Posting activity",
          severity: "good",
          detail: `About ${perWeek.toFixed(1)} new videos/week since tracking started - a healthy, active pace.`,
        });
      }
    }
  } else {
    findings.push({
      area: "Posting activity",
      severity: "info",
      detail: "Need at least two check-ins over a few days to tell whether posting is picking up or slowing down.",
    });
  }

  // --- follower / following ratio ---
  if (profile.following > 0) {
    const ratio = profile.followers / profile.following;
    if (profile.following > 500 && ratio < 2) {
      findings.push({
        area: "Follower ratio",
        severity: "medium",
        detail: `You're following ${profile.following.toLocaleString()} accounts against ${profile.followers.toLocaleString()} followers. A very high following count relative to followers can read as "follow-for-follow" and may be worth trimming.`,
      });
    }
  }

  // --- likes-per-follower stickiness ---
  if (profile.followers > 0) {
    const likesPerFollower = profile.likes / profile.followers;
    if (likesPerFollower < 1) {
      findings.push({
        area: "Audience loyalty",
        severity: "medium",
        detail: `Total likes are lower than your follower count (${likesPerFollower.toFixed(2)} likes per follower) - a sign a chunk of your audience may not be actively engaging. Content that prompts likes/comments directly can help re-activate them.`,
      });
    }
  }

  // --- profile completeness ---
  const missing = [];
  if (!profile.bio || profile.bio.trim().length < 10) missing.push("a fuller bio");
  if (!profile.avatarUrl) missing.push("a profile picture");
  if (missing.length) {
    findings.push({
      area: "Profile basics",
      severity: "low",
      detail: `Your profile is missing ${missing.join(" and ")}. These are quick wins - a complete profile converts more profile visits into follows.`,
    });
  }
  if (!profile.verified) {
    findings.push({
      area: "Profile basics",
      severity: "info",
      detail: "Account isn't verified. Not something you control directly at most follower counts, but worth applying for once eligible - it adds trust.",
    });
  }

  // --- follower growth trend from snapshots ---
  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const spanDays = first && last ? (new Date(last.captured_at) - new Date(first.captured_at)) / DAY_MS : 0;

  if (snapshots.length >= 2 && spanDays >= 0.5) {
    const delta = last.followers - first.followers;
    const perDay = delta / spanDays;
    if (delta < 0) {
      findings.push({
        area: "Growth trend",
        severity: "high",
        detail: `Followers have dropped by ${Math.abs(delta).toLocaleString()} since tracking started (${spanDays.toFixed(1)} days ago). Worth checking recent activity for anything that may have prompted unfollows.`,
      });
    } else {
      findings.push({
        area: "Growth trend",
        severity: delta === 0 ? "medium" : "good",
        detail: `Gained ${delta.toLocaleString()} followers over the last ${spanDays.toFixed(1)} days (${perDay.toFixed(1)}/day) since tracking started.`,
      });
    }
  } else {
    findings.push({
      area: "Growth trend",
      severity: "info",
      detail: "Not enough time between check-ins yet - keep checking back (at least half a day apart) and a growth trend will appear here.",
    });
  }

  const severityOrder = { high: 0, medium: 1, low: 2, good: 3, info: 4 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  return findings;
}

module.exports = { buildInsights };
