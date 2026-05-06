/* ----------------------------------------------------------------
   UI HELPERS
   ---------------------------------------------------------------- */

/**
 * playCloseSound()
 *
 * Plays a clean "swoosh" sound when tabs are closed.
 * Built entirely with the Web Audio API — no sound files needed.
 * A filtered noise sweep that descends in pitch, like air moving.
 */
function playCloseSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;

    // Swoosh: shaped white noise through a sweeping bandpass filter
    const duration = 0.25;
    const buffer = ctx.createBuffer(
      1,
      ctx.sampleRate * duration,
      ctx.sampleRate,
    );
    const data = buffer.getChannelData(0);

    // Generate noise with a natural envelope (quick attack, smooth decay)
    for (let i = 0; i < data.length; i++) {
      const pos = i / data.length;
      // Envelope: ramps up fast in first 10%, then fades out smoothly
      const env = pos < 0.1 ? pos / 0.1 : Math.pow(1 - (pos - 0.1) / 0.9, 1.5);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Bandpass filter sweeps from high to low — creates the "swoosh" character
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 2.0;
    filter.frequency.setValueAtTime(4000, t);
    filter.frequency.exponentialRampToValueAtTime(400, t + duration);

    // Volume
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(t);

    setTimeout(() => ctx.close(), 500);
  } catch {
    // Audio not supported — fail silently
  }
}

/**
 * shootConfetti(x, y)
 *
 * Shoots a burst of colorful confetti particles from the given screen
 * coordinates (typically the center of a card being closed).
 * Pure CSS + JS, no libraries.
 */
function shootConfetti(x, y) {
  const colors = [
    "#c8713a", // amber
    "#e8a070", // amber light
    "#5a7a62", // sage
    "#8aaa92", // sage light
    "#5a6b7a", // slate
    "#8a9baa", // slate light
    "#d4b896", // warm paper
    "#b35a5a", // rose
  ];

  const particleCount = 17;

  for (let i = 0; i < particleCount; i++) {
    const el = document.createElement("div");

    const isCircle = Math.random() > 0.5;
    const size = 5 + Math.random() * 6; // 5–11px
    const color = colors[Math.floor(Math.random() * colors.length)];

    el.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border-radius: ${isCircle ? "50%" : "2px"};
      pointer-events: none;
      z-index: 9999;
      transform: translate(-50%, -50%);
      opacity: 1;
    `;
    document.body.appendChild(el);

    // Physics: random angle and speed for the outward burst
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 120;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - 80; // bias upward
    const gravity = 200;

    const startTime = performance.now();
    const duration = 700 + Math.random() * 200; // 700–900ms

    function frame(now) {
      const elapsed = (now - startTime) / 1000;
      const progress = elapsed / (duration / 1000);

      if (progress >= 1) {
        el.remove();
        return;
      }

      const px = vx * elapsed;
      const py = vy * elapsed + 0.5 * gravity * elapsed * elapsed;
      const opacity = progress < 0.5 ? 1 : 1 - (progress - 0.5) * 2;
      const rotate = elapsed * 200 * (isCircle ? 0 : 1);

      el.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px)) rotate(${rotate}deg)`;
      el.style.opacity = opacity;

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }
}

/**
 * animateCardOut(card)
 *
 * Smoothly removes a mission card: fade + scale down, then confetti.
 * After the animation, checks if the grid is now empty.
 */
function animateCardOut(card) {
  if (!card) return;

  const rect = card.getBoundingClientRect();
  shootConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);

  card.classList.add("closing");
  setTimeout(() => {
    card.remove();
    checkAndShowEmptyState();
  }, 300);
}

/**
 * showToast(message)
 *
 * Brief pop-up notification at the bottom of the screen.
 */
function showToast(message) {
  const toast = document.getElementById("toast");
  document.getElementById("toastText").textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2500);
}

/**
 * checkAndShowEmptyState()
 *
 * Shows a cheerful "Inbox zero" message when all domain cards are gone.
 */
function checkAndShowEmptyState() {
  const missionsEl = document.getElementById("openTabsMissions");
  if (!missionsEl) return;

  const remaining = missionsEl.querySelectorAll(
    ".mission-card:not(.closing)",
  ).length;
  if (remaining > 0) return;

  missionsEl.innerHTML = `
    <div class="missions-empty-state">
      <div class="empty-checkmark">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>
      <div class="empty-title">${t("emptyStateTitle")}</div>
      <div class="empty-subtitle">${t("emptyStateSubtitle")}</div>
    </div>
  `;

  const countEl = document.getElementById("openTabsSectionCount");
  if (countEl) countEl.textContent = t("nDomains", 0);
}

/**
 * timeAgo(dateStr)
 *
 * Converts an ISO date string into a human-friendly relative time.
 * "2026-04-04T10:00:00Z" → "2 hrs ago" or "yesterday"
 */
function timeAgo(dateStr) {
  if (!dateStr) return "";
  const then = new Date(dateStr);
  const now = new Date();
  const diffMins = Math.floor((now - then) / 60000);
  const diffHours = Math.floor((now - then) / 3600000);
  const diffDays = Math.floor((now - then) / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return diffMins + " min ago";
  if (diffHours < 24)
    return diffHours + " hr" + (diffHours !== 1 ? "s" : "") + " ago";
  if (diffDays === 1) return "yesterday";
  return diffDays + " days ago";
}

/**
 * getDateDisplay() — weekday + DD/MM/YYYY, e.g. "Sunday · 03/05/2026"
 * Weekday name follows the current language setting.
 */
function getDateDisplay() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const date = `${dd}/${mm}/${d.getFullYear()}`;
  const locale = currentLang === "zh" ? "zh-CN" : "en-US";
  let weekday = "";
  try {
    weekday = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(d);
  } catch {}
  return weekday ? `${weekday} · ${date}` : date;
}

function getTimeDisplay() {
  const locale = currentLang === "zh" ? "zh-CN" : "en-US";
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
  } catch {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
}

function getHeroGreeting() {
  const hour = new Date().getHours();
  if (currentLang === "zh") {
    if (hour < 5) return "夜深了";
    if (hour < 12) return "早上好";
    if (hour < 18) return "下午好";
    if (hour < 22) return "晚上好";
    return "夜深了";
  }
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Good night";
}

function paintTopbarTime() {
  const dateEl = document.getElementById("dateDisplay");
  const timeEl = document.getElementById("timeDisplay");
  const heroEyebrow = document.getElementById("heroEyebrow");
  if (dateEl) dateEl.textContent = getDateDisplay();
  if (timeEl) timeEl.textContent = getTimeDisplay();
  if (heroEyebrow) heroEyebrow.textContent = getHeroGreeting();
}

/* ----------------------------------------------------------------
   WEATHER — IP geolocation (ipwho.is) + Open-Meteo
   Both services are free, global, and require no API key.
   Results are cached in chrome.storage.local for 30 minutes.
   ---------------------------------------------------------------- */
const WEATHER_CACHE_TTL = 30 * 60 * 1000;

function wmoCodeToEmoji(code) {
  if (code === 0) return "☀️";
  if (code === 1) return "🌤️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 55) return "🌦️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 82) return "🌦️";
  if (code <= 86) return "❄️";
  if (code >= 95) return "⛈️";
  return "🌡️";
}

function fetchWeatherFromApi() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "fetch-weather" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response || !response.ok) {
        reject(new Error(response?.error || "weather fetch failed"));
        return;
      }
      resolve(response.data);
    });
  });
}

async function loadAndPaintWeather() {
  const locationEl = document.getElementById("locationDisplay");
  const weatherEl = document.getElementById("weatherDisplay");
  if (!locationEl || !weatherEl) return;
  try {
    const cached = await chrome.storage.local.get("weatherCache");
    const cache = cached.weatherCache;
    let data;
    if (
      cache &&
      cache.fetchedAt &&
      Date.now() - cache.fetchedAt < WEATHER_CACHE_TTL
    ) {
      data = cache;
    } else {
      data = await fetchWeatherFromApi();
      await chrome.storage.local.set({ weatherCache: data });
    }
    locationEl.textContent =
      data.city || (currentLang === "zh" ? "本地" : "Local");
    weatherEl.textContent = `${wmoCodeToEmoji(data.code)} ${data.temp}°C`;
  } catch (err) {
    console.error("[browser-organizer] weather failed:", err);
    locationEl.textContent = currentLang === "zh" ? "本地" : "Local";
    weatherEl.textContent = currentLang === "zh" ? "天气未开启" : "Weather off";
  }
}

/* ----------------------------------------------------------------
   DOMAIN & TITLE CLEANUP HELPERS
   ---------------------------------------------------------------- */

// Map of known hostnames → friendly display names.
const FRIENDLY_DOMAINS = {
  "github.com": "GitHub",
  "www.github.com": "GitHub",
  "gist.github.com": "GitHub Gist",
  "youtube.com": "YouTube",
  "www.youtube.com": "YouTube",
  "music.youtube.com": "YouTube Music",
  "x.com": "X",
  "www.x.com": "X",
  "twitter.com": "X",
  "www.twitter.com": "X",
  "reddit.com": "Reddit",
  "www.reddit.com": "Reddit",
  "old.reddit.com": "Reddit",
  "substack.com": "Substack",
  "www.substack.com": "Substack",
  "medium.com": "Medium",
  "www.medium.com": "Medium",
  "linkedin.com": "LinkedIn",
  "www.linkedin.com": "LinkedIn",
  "stackoverflow.com": "Stack Overflow",
  "www.stackoverflow.com": "Stack Overflow",
  "news.ycombinator.com": "Hacker News",
  "google.com": "Google",
  "www.google.com": "Google",
  "mail.google.com": "Gmail",
  "docs.google.com": "Google Docs",
  "drive.google.com": "Google Drive",
  "calendar.google.com": "Google Calendar",
  "meet.google.com": "Google Meet",
  "gemini.google.com": "Gemini",
  "chatgpt.com": "ChatGPT",
  "www.chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "claude.ai": "Claude",
  "www.claude.ai": "Claude",
  "code.claude.com": "Claude Code",
  "notion.so": "Notion",
  "www.notion.so": "Notion",
  "figma.com": "Figma",
  "www.figma.com": "Figma",
  "slack.com": "Slack",
  "app.slack.com": "Slack",
  "discord.com": "Discord",
  "www.discord.com": "Discord",
  "wikipedia.org": "Wikipedia",
  "en.wikipedia.org": "Wikipedia",
  "amazon.com": "Amazon",
  "www.amazon.com": "Amazon",
  "netflix.com": "Netflix",
  "www.netflix.com": "Netflix",
  "spotify.com": "Spotify",
  "open.spotify.com": "Spotify",
  "vercel.com": "Vercel",
  "www.vercel.com": "Vercel",
  "npmjs.com": "npm",
  "www.npmjs.com": "npm",
  "developer.mozilla.org": "MDN",
  "arxiv.org": "arXiv",
  "www.arxiv.org": "arXiv",
  "huggingface.co": "Hugging Face",
  "www.huggingface.co": "Hugging Face",
  "producthunt.com": "Product Hunt",
  "www.producthunt.com": "Product Hunt",
  "xiaohongshu.com": "RedNote",
  "www.xiaohongshu.com": "RedNote",
  "local-files": "Local Files",
};

function friendlyDomain(hostname) {
  if (!hostname) return "";
  if (FRIENDLY_DOMAINS[hostname]) return FRIENDLY_DOMAINS[hostname];

  if (hostname.endsWith(".substack.com") && hostname !== "substack.com") {
    return capitalize(hostname.replace(".substack.com", "")) + "'s Substack";
  }
  if (hostname.endsWith(".github.io")) {
    return capitalize(hostname.replace(".github.io", "")) + " (GitHub Pages)";
  }

  // Strip leading www., then return just the second-level domain (the
  // "brand"). For www.binance.com → "Binance". For accounts.binance.com →
  // also "Binance". Two-segment TLDs (.co.uk etc.) are handled too.
  const TLDS_2 = [
    "co.uk",
    "co.jp",
    "com.cn",
    "com.tw",
    "com.au",
    "com.hk",
    "co.kr",
  ];
  const parts = hostname.replace(/^www\./, "").split(".");
  let brand;
  if (parts.length >= 3 && TLDS_2.includes(parts.slice(-2).join("."))) {
    brand = parts[parts.length - 3];
  } else if (parts.length >= 2) {
    brand = parts[parts.length - 2];
  } else {
    brand = parts[0];
  }
  return capitalize(brand);
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function stripTitleNoise(title) {
  if (!title) return "";
  // Strip leading notification count: "(2) Title"
  title = title.replace(/^\(\d+\+?\)\s*/, "");
  // Strip inline counts like "Inbox (16,359)"
  title = title.replace(/\s*\([\d,]+\+?\)\s*/g, " ");
  // Strip email addresses (privacy + cleaner display)
  title = title.replace(
    /\s*[\-\u2010-\u2015]\s*[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    "",
  );
  title = title.replace(
    /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    "",
  );
  // Clean X/Twitter format
  title = title.replace(/\s+on X:\s*/, ": ");
  title = title.replace(/\s*\/\s*X\s*$/, "");
  return title.trim();
}

function cleanTitle(title, hostname) {
  if (!title || !hostname) return title || "";

  const friendly = friendlyDomain(hostname);
  const domain = hostname.replace(/^www\./, "");
  const seps = [" - ", " | ", " — ", " · ", " – "];

  for (const sep of seps) {
    const idx = title.lastIndexOf(sep);
    if (idx === -1) continue;
    const suffix = title.slice(idx + sep.length).trim();
    const suffixLow = suffix.toLowerCase();
    if (
      suffixLow === domain.toLowerCase() ||
      suffixLow === friendly.toLowerCase() ||
      suffixLow === domain.replace(/\.\w+$/, "").toLowerCase() ||
      domain.toLowerCase().includes(suffixLow) ||
      friendly.toLowerCase().includes(suffixLow)
    ) {
      const cleaned = title.slice(0, idx).trim();
      if (cleaned.length >= 5) return cleaned;
    }
  }
  return title;
}

function smartTitle(title, url) {
  if (!url) return title || "";
  let pathname = "",
    hostname = "";
  try {
    const u = new URL(url);
    pathname = u.pathname;
    hostname = u.hostname;
  } catch {
    return title || "";
  }

  const titleIsUrl =
    !title ||
    title === url ||
    title.startsWith(hostname) ||
    title.startsWith("http");

  if (
    (hostname === "x.com" ||
      hostname === "twitter.com" ||
      hostname === "www.x.com") &&
    pathname.includes("/status/")
  ) {
    const username = pathname.split("/")[1];
    if (username) return titleIsUrl ? `Post by @${username}` : title;
  }

  if (hostname === "github.com" || hostname === "www.github.com") {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      const [owner, repo, ...rest] = parts;
      if (rest[0] === "issues" && rest[1])
        return `${owner}/${repo} Issue #${rest[1]}`;
      if (rest[0] === "pull" && rest[1])
        return `${owner}/${repo} PR #${rest[1]}`;
      if (rest[0] === "blob" || rest[0] === "tree")
        return `${owner}/${repo} — ${rest.slice(2).join("/")}`;
      if (titleIsUrl) return `${owner}/${repo}`;
    }
  }

  if (
    (hostname === "www.youtube.com" || hostname === "youtube.com") &&
    pathname === "/watch"
  ) {
    if (titleIsUrl) return "YouTube Video";
  }

  if (
    (hostname === "www.reddit.com" ||
      hostname === "reddit.com" ||
      hostname === "old.reddit.com") &&
    pathname.includes("/comments/")
  ) {
    const parts = pathname.split("/").filter(Boolean);
    const subIdx = parts.indexOf("r");
    if (subIdx !== -1 && parts[subIdx + 1]) {
      if (titleIsUrl) return `r/${parts[subIdx + 1]} post`;
    }
  }

  return title || url;
}

/* ----------------------------------------------------------------
   FAVICON URL — prefers Chrome's cached favicon (most accurate for sites
   the user has visited), which works for sites Google's S2 service can't
   resolve (e.g. WhatsApp Web). Requires the "favicon" permission.
   ---------------------------------------------------------------- */
function getFaviconUrl(pageUrl, size = 64) {
  if (!pageUrl) return "";
  try {
    const u = new URL(chrome.runtime.getURL("/_favicon/"));
    u.searchParams.set("pageUrl", pageUrl);
    u.searchParams.set("size", String(size));
    return u.toString();
  } catch {
    return "";
  }
}

/**
 * High-quality favicon fallback chain.
 *  1. apple-touch-icon.png            — typically 180–512px, beautiful
 *  2. apple-touch-icon-precomposed.png — older convention, same idea
 *  3. Chrome's cached _favicon (real icon, but lower-res)
 *
 * Used as a list passed via data-fallback="…|…|…" — when the <img> errors
 * out (404, transparent, etc.), the global error handler advances to the
 * next URL in the list.
 */
function getFaviconFallbackChain(pageUrl, size = 128) {
  if (!pageUrl) return [];
  let origin = "";
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return [];
  }
  return [
    `${origin}/apple-touch-icon.png`,
    `${origin}/apple-touch-icon-precomposed.png`,
    getFaviconUrl(pageUrl, size),
  ].filter(Boolean);
}

// Global error-handler: when an <img class="favorite-favicon"> 404s, walk
// the fallback chain stored in data-fallback. Capture phase because `error`
// events don't bubble.
document.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.classList.contains("chip-favicon")) {
      img.style.display = "none";
      return;
    }
    if (img.classList.contains("profile-favicon")) {
      const fallback = document.createElement("span");
      fallback.className = "profile-link-icon profile-page-icon";
      fallback.setAttribute("aria-hidden", "true");
      img.replaceWith(fallback);
      return;
    }
    if (!img.dataset || typeof img.dataset.fallback !== "string") return;
    const list = img.dataset.fallback.split("|").filter(Boolean);
    if (list.length === 0) {
      img.style.display = "none";
      return;
    }
    const next = list.shift();
    img.dataset.fallback = list.join("|");
    img.src = next;
  },
  true,
);

/* ----------------------------------------------------------------
   ICON RESOLUTION CACHE — once an image loads successfully, persist
   the URL that worked into the favorite's `iconUrl` field. Future
   renders skip the fallback chain entirely.
   ---------------------------------------------------------------- */
let _pendingIconWrites = new Map(); // favId → resolved url
let _iconWriteTimer = null;
let _suppressFavReRender = 0; // counter: > 0 means suppressed; increment/decrement around storage writes so onChanged skips us

async function flushIconWrites() {
  _iconWriteTimer = null;
  const writes = _pendingIconWrites;
  if (writes.size === 0) return;
  _pendingIconWrites = new Map();
  const favorites = await getFavorites();
  let modified = false;
  for (const [favId, url] of writes) {
    const fav = favorites.find((f) => f.id === favId);
    if (fav && fav.iconUrl !== url) {
      fav.iconUrl = url;
      modified = true;
    }
  }
  if (!modified) return;
  _suppressFavReRender++;
  try {
    await setFavorites(favorites, { touch: false });
  } finally {
    _suppressFavReRender--;
  }
}

function queueIconWrite(favId, url) {
  if (!favId || !url) return;
  _pendingIconWrites.set(favId, url);
  if (_iconWriteTimer) clearTimeout(_iconWriteTimer);
  _iconWriteTimer = setTimeout(flushIconWrites, 500);
}

// Capture phase — `load` doesn't bubble for individual images.
document.addEventListener(
  "load",
  (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (!img.classList.contains("favorite-favicon")) return;
    const favId = img.dataset.favId;
    if (!favId) return;
    if (img.dataset.resolved === "1") return; // already cached
    const finalUrl = img.currentSrc || img.src;
    if (!finalUrl) return;
    // Don't re-cache an already-stored data URL.
    if (finalUrl.startsWith("data:")) return;
    img.dataset.resolved = "1";
    // Download the image bytes and persist as a base64 data URL — zero
    // network on subsequent renders.
    downloadAndCacheIcon(favId, finalUrl);
  },
  true,
);

const MAX_ICON_BYTES = 200 * 1024; // hard cap to keep storage reasonable

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function downloadAndCacheIcon(favId, url) {
  try {
    const r = await fetch(url, { credentials: "omit" });
    if (!r.ok) return;
    const blob = await r.blob();
    if (blob.size === 0 || blob.size > MAX_ICON_BYTES) return;
    const dataUrl = await blobToDataUrl(blob);
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return;
    queueIconWrite(favId, dataUrl);
  } catch {
    // Fetch failed (network, blocked, etc.) — leave iconUrl unset; we'll
    // try again next render via the fallback chain.
  }
}

/* ----------------------------------------------------------------
   SVG ICON STRINGS
   ---------------------------------------------------------------- */
const ICONS = {
  tabs: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8.25V18a2.25 2.25 0 0 0 2.25 2.25h13.5A2.25 2.25 0 0 0 21 18V8.25m-18 0V6a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 6v2.25m-18 0h18" /></svg>`,
  close: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>`,
  archive: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg>`,
  focus: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 19.5 15-15m0 0H8.25m11.25 0v11.25" /></svg>`,
};
