/* ---------- animated matrix-rain background ---------- */
(() => {
  const canvas = document.getElementById("matrix-canvas");
  if (!canvas) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;

  const ctx = canvas.getContext("2d");
  const GLYPHS = "01アイウエオカキクケコサシスセソタチツテト$#@+-<>/\\";
  const FONT_SIZE = 15;
  let columns = 0;
  let drops = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    columns = Math.ceil(canvas.width / FONT_SIZE);
    drops = Array.from({ length: columns }, () => Math.floor((Math.random() * canvas.height) / FONT_SIZE));
  }
  window.addEventListener("resize", resize);
  resize();

  function draw() {
    ctx.fillStyle = "rgba(5,10,7,0.12)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${FONT_SIZE}px monospace`;
    for (let i = 0; i < columns; i++) {
      const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      const x = i * FONT_SIZE;
      const y = drops[i] * FONT_SIZE;
      ctx.fillStyle = Math.random() > 0.97 ? "#c9ffd8" : "#39ff14";
      ctx.fillText(glyph, x, y);
      if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
  }
  setInterval(draw, 50);
})();

(() => {
  const KEY_STORAGE = "tiktokPulse.appKey";
  let appKey = localStorage.getItem(KEY_STORAGE) || "";
  let activeUsername = null;

  const keyGate = document.getElementById("key-gate");
  const keyInput = document.getElementById("key-input");
  const keyError = document.getElementById("key-error");
  const appEl = document.getElementById("app");

  // This page is served from Supabase Storage, while the API is a separate
  // Edge Function - different paths under the same project domain (so no
  // CORS setup needed), but not a shared prefix, hence the absolute URL.
  const API_BASE = "https://ckvrruuvbpigusybylew.supabase.co/functions/v1/api";

  async function api(path, opts = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        "X-App-Key": appKey,
        ...(opts.headers || {}),
      },
    });
    if (res.status === 401) throw { authFailed: true };
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  async function tryEnter(key) {
    appKey = key;
    try {
      await api("/health");
      // health doesn't require a key, so verify against the real gate instead
      await api("/accounts");
      localStorage.setItem(KEY_STORAGE, key);
      keyGate.hidden = true;
      appEl.hidden = false;
      loadWatchlist();
    } catch (err) {
      keyError.textContent = err.authFailed || (err.message || "").includes("401")
        ? "That key was rejected by the server."
        : "Couldn't reach the server. Is it running?";
      keyError.hidden = false;
    }
  }

  document.getElementById("key-submit").addEventListener("click", () => {
    const v = keyInput.value.trim();
    if (v) tryEnter(v);
  });
  keyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("key-submit").click();
  });

  if (appKey) tryEnter(appKey);

  /* ---------- watchlist ---------- */
  const watchlistEl = document.getElementById("watchlist");
  const watchlistEmpty = document.getElementById("watchlist-empty");
  const wlTpl = document.getElementById("watchlist-item-tpl");

  async function loadWatchlist(selectAfter) {
    const { accounts } = await api("/accounts");
    watchlistEl.querySelectorAll(".watchlist-item").forEach((n) => n.remove());
    watchlistEmpty.hidden = accounts.length > 0;

    for (const acc of accounts) {
      const node = wlTpl.content.firstElementChild.cloneNode(true);
      node.querySelector(".wl-avatar").src = acc.avatar_url || "";
      node.querySelector(".wl-name").textContent = acc.nickname || acc.username;
      node.querySelector(".wl-handle").textContent = "@" + acc.username;
      node.querySelector(".wl-followers").textContent = formatCompact(acc.followers);
      node.addEventListener("click", () => selectAccount(acc.username));
      watchlistEl.appendChild(node);
      if (acc.username === (selectAfter || activeUsername)) node.classList.add("active");
    }
  }

  document.getElementById("add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("add-input");
    const username = input.value.trim().replace(/^@/, "");
    if (!username) return;
    input.disabled = true;
    try {
      await api("/accounts", { method: "POST", body: JSON.stringify({ username }) });
      input.value = "";
      await loadWatchlist(username);
      selectAccount(username);
    } catch (err) {
      alert(err.message || "Couldn't add that account.");
    } finally {
      input.disabled = false;
    }
  });

  /* ---------- detail view ---------- */
  const detailEmpty = document.getElementById("detail-empty");
  const detailContent = document.getElementById("detail-content");
  const insightTpl = document.getElementById("insight-tpl");

  function formatCompact(n) {
    if (n == null) return "—";
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
  }

  async function selectAccount(username) {
    activeUsername = username;
    watchlistEl.querySelectorAll(".watchlist-item").forEach((n) => {
      n.classList.toggle("active", n.querySelector(".wl-handle").textContent === "@" + username);
    });
    detailEmpty.hidden = true;
    detailContent.hidden = false;
    detailContent.innerHTML = '<p class="detail-empty">Loading…</p>';

    try {
      const data = await api(`/accounts/${encodeURIComponent(username)}`);
      renderDetail(data);
    } catch (err) {
      detailContent.innerHTML = `<p class="detail-empty">${escapeHtml(err.message || "Couldn't load that account.")}</p>`;
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderDetail({ profile, history, insights }) {
    const created = profile.createTime
      ? new Date(profile.createTime * 1000).toLocaleString(undefined, {
          year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
        })
      : "unknown";
    const checked = profile.lastCheckedAt ? new Date(profile.lastCheckedAt).toLocaleString() : "just now";

    detailContent.innerHTML = `
      <div class="profile-header">
        <img class="profile-avatar" src="${escapeHtml(profile.avatarUrl || "")}" alt="">
        <div class="profile-id">
          <h2>${escapeHtml(profile.nickname || profile.username)}${profile.verified ? ' <span class="verified-badge" title="Verified">✓</span>' : ""}</h2>
          <div class="handle">@${escapeHtml(profile.username)}</div>
          ${profile.bio ? `<p class="profile-bio">${escapeHtml(profile.bio)}</p>` : ""}
          <p class="profile-meta">Account created ${created} · last checked ${checked}</p>
        </div>
        <button class="refresh-btn" id="refresh-btn">Refresh</button>
        <button class="remove-btn" id="remove-btn">Stop tracking</button>
      </div>

      <div class="stat-row">
        <div class="stat"><div class="n">${formatCompact(profile.followers)}</div><div class="l">Followers</div></div>
        <div class="stat"><div class="n">${formatCompact(profile.following)}</div><div class="l">Following</div></div>
        <div class="stat"><div class="n">${formatCompact(profile.likes)}</div><div class="l">Likes</div></div>
        <div class="stat"><div class="n">${formatCompact(profile.videoCount)}</div><div class="l">Videos</div></div>
      </div>

      <div class="section-title">Follower history</div>
      <div class="chart-wrap" id="chart-wrap-followers"></div>

      <div class="section-title">Likes history</div>
      <div class="chart-wrap" id="chart-wrap-likes"></div>

      <div class="section-title">Where to strengthen</div>
      <div class="insights" id="insights-list"></div>

      <p class="videos-note">Per-video stats and comment counts (total or per-video) aren't shown here &mdash; TikTok's public profile page doesn't expose a comment-count figure at all, and per-video breakdowns only come through a signed, logged-in request that a plain profile lookup can't make. Everything above comes from the public profile page plus the history this app has recorded over time.</p>
    `;

    document.getElementById("refresh-btn").addEventListener("click", async (e) => {
      e.target.textContent = "Refreshing…";
      e.target.disabled = true;
      try {
        await api(`/accounts/${encodeURIComponent(profile.username)}/refresh`, { method: "POST" });
        await loadWatchlist(profile.username);
        await selectAccount(profile.username);
      } catch (err) {
        alert(err.message || "Refresh failed.");
        e.target.textContent = "Refresh";
        e.target.disabled = false;
      }
    });

    document.getElementById("remove-btn").addEventListener("click", async () => {
      if (!confirm(`Stop tracking @${profile.username}?`)) return;
      await api(`/accounts/${encodeURIComponent(profile.username)}`, { method: "DELETE" });
      activeUsername = null;
      detailContent.hidden = true;
      detailEmpty.hidden = false;
      await loadWatchlist();
    });

    renderChart(history, "followers", "chart-wrap-followers");
    renderChart(history, "likes", "chart-wrap-likes");

    const insightsList = document.getElementById("insights-list");
    for (const f of insights) {
      const node = insightTpl.content.firstElementChild.cloneNode(true);
      node.style.setProperty("--sev", `var(--${f.severity})`);
      node.querySelector(".insight-area").textContent = f.area;
      node.querySelector(".insight-detail").textContent = f.detail;
      insightsList.appendChild(node);
    }
  }

  function renderChart(history, field, wrapId) {
    const wrap = document.getElementById(wrapId);
    if (!history || history.length < 2) {
      wrap.innerHTML = '<p class="chart-empty">Not enough history yet — check back after a few lookups to see a trend line.</p>';
      return;
    }
    const w = 600, h = 140, pad = 10;
    const values = history.map((p) => p[field]);
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;
    const stepX = (w - pad * 2) / (history.length - 1);

    const points = history.map((p, i) => {
      const x = pad + i * stepX;
      const y = h - pad - ((p[field] - min) / range) * (h - pad * 2);
      return [x, y];
    });

    const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const areaPath = `${line} L${points[points.length - 1][0].toFixed(1)},${h - pad} L${points[0][0].toFixed(1)},${h - pad} Z`;

    wrap.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <path d="${areaPath}" fill="var(--accent-soft)" stroke="none"></path>
        <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
        ${points.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="var(--accent)"></circle>`).join("")}
      </svg>
    `;
  }
})();
