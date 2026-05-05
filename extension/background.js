/**
 * background.js — Service Worker for Badge Updates
 *
 * Chrome's "always-on" background script for Browser Organizer.
 * Its only job: keep the toolbar badge showing the current open tab count.
 *
 * Since we no longer have a server, we query chrome.tabs directly.
 * The badge counts real web tabs (skipping chrome:// and extension pages).
 *
 * Color coding gives a quick at-a-glance health signal:
 *   Green  (#3d7a4a) → 1–10 tabs  (focused, manageable)
 *   Amber  (#b8892e) → 11–20 tabs (getting busy)
 *   Red    (#b35a5a) → 21+ tabs   (time to cull!)
 */

importScripts("storage.js");

// ─── Badge updater ────────────────────────────────────────────────────────────

/**
 * updateBadge()
 *
 * Counts open real-web tabs and updates the extension's toolbar badge.
 * "Real" tabs = not chrome://, not extension pages, not about:blank.
 */
async function updateBadge() {
  try {
    const tabs = await chrome.tabs.query({});

    // Only count actual web pages — skip browser internals and extension pages
    const count = tabs.filter((t) => {
      const url = t.url || "";
      return (
        !url.startsWith("chrome://") &&
        !url.startsWith("chrome-extension://") &&
        !url.startsWith("about:") &&
        !url.startsWith("edge://") &&
        !url.startsWith("brave://")
      );
    }).length;

    // Don't show "0" — an empty badge is cleaner
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });

    if (count === 0) return;

    // Pick badge color based on workload level
    let color;
    if (count <= 10) {
      color = "#3d7a4a"; // Green — you're in control
    } else if (count <= 20) {
      color = "#b8892e"; // Amber — things are piling up
    } else {
      color = "#b35a5a"; // Red — time to focus and close some tabs
    }

    await chrome.action.setBadgeBackgroundColor({ color });
  } catch {
    // If something goes wrong, clear the badge rather than show stale data
    chrome.action.setBadgeText({ text: "" });
  }
}

// ─── Event listeners ──────────────────────────────────────────────────────────

// Update badge when the extension is first installed
chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
  self.TabHomeStorage.cleanupLegacySyncData();
  // Register the right-click menu items. (Re-registers on every install/upgrade
  // — that's the recommended pattern for service-worker extensions.)
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "wolfy-favorite-page",
      title: "Add page to Browser Organizer favorites",
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: "wolfy-favorite-link",
      title: "Add link to Browser Organizer favorites",
      contexts: ["link"],
    });
  });
});

// ─── Right-click handler — save URL to favorites ─────────────────────────────
// Tiny brand-name extractor (mirrors friendlyDomain in app.js for the
// background-script context, where we don't share helpers).
function brandFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const parts = host.split(".");
    const TLDS_2 = [
      "co.uk",
      "co.jp",
      "com.cn",
      "com.tw",
      "com.au",
      "com.hk",
      "co.kr",
    ];
    let brand;
    if (parts.length >= 3 && TLDS_2.includes(parts.slice(-2).join("."))) {
      brand = parts[parts.length - 3];
    } else if (parts.length >= 2) {
      brand = parts[parts.length - 2];
    } else {
      brand = parts[0];
    }
    return brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : url;
  } catch {
    return url;
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let url;
  if (info.menuItemId === "wolfy-favorite-page") {
    url = tab && tab.url;
  } else if (info.menuItemId === "wolfy-favorite-link") {
    url = info.linkUrl;
  } else {
    return;
  }

  if (!url) return;
  const title = brandFromUrl(url);
  // Skip browser-internal pages and unsafe protocols
  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("about:") ||
    url.startsWith("edge://") ||
    url.startsWith("brave://") ||
    /^(javascript|data|vbscript):/i.test(url)
  ) {
    return;
  }

  try {
    const favorites = await self.TabHomeStorage.getFavorites();
    if (favorites.some((f) => f.url === url)) return;
    // Place at the first free slot — no upper bound.
    const taken = new Set(favorites.map((f) => f.slot));
    let slot = 0;
    while (taken.has(slot)) slot++;
    favorites.push({
      id: Date.now().toString(),
      url,
      title: title || url,
      addedAt: new Date().toISOString(),
      slot,
    });
    await self.TabHomeStorage.setFavorites(favorites);
  } catch (err) {
    console.warn("[wolfy] context menu favorite failed:", err);
  }
});

// Update badge when Chrome starts up
chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});

// Update badge whenever a tab is opened
chrome.tabs.onCreated.addListener(() => {
  updateBadge();
});

// Update badge whenever a tab is closed
chrome.tabs.onRemoved.addListener(() => {
  updateBadge();
});

// Update badge when a tab's URL changes (e.g. navigating to/from chrome://)
chrome.tabs.onUpdated.addListener(() => {
  updateBadge();
});

// ─── Weather proxy ────────────────────────────────────────────────────────────
// Extension pages have a restrictive default CSP that can block direct fetch()
// calls to external origins. Service workers are not subject to this CSP, so
// we proxy the two weather API calls through here via message passing.

async function fetchGeoLocation() {
  // Primary: ipapi.co (HTTPS, free, 1000 req/day — well within 30-min cache)
  try {
    const res = await fetch("https://ipapi.co/json/");
    if (res.ok) {
      const d = await res.json();
      if (d.latitude != null)
        return {
          lat: d.latitude,
          lon: d.longitude,
          city: d.city || d.region || "",
        };
    }
  } catch {}
  // Fallback: geojs.io (open-source, no rate limit)
  const res2 = await fetch("https://get.geojs.io/v1/ip/geo.json");
  if (!res2.ok) throw new Error(`geo fallback HTTP ${res2.status}`);
  const d2 = await res2.json();
  if (d2.latitude == null) throw new Error("geo data invalid");
  return {
    lat: parseFloat(d2.latitude),
    lon: parseFloat(d2.longitude),
    city: d2.city || d2.name || "",
  };
}

// ─── Search suggestions proxy ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "fetch-suggestions") return false;
  const q = (message.query || "").trim();
  if (!q) {
    sendResponse({ suggestions: [] });
    return true;
  }
  (async () => {
    try {
      const url =
        `https://suggestqueries.google.com/complete/search` +
        `?output=firefox&q=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Response: ["query", ["sug1","sug2",...], ...]
      const suggestions = Array.isArray(data[1]) ? data[1].slice(0, 8) : [];
      sendResponse({ suggestions });
    } catch {
      sendResponse({ suggestions: [] });
    }
  })();
  return true;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "fetch-weather") return false;
  (async () => {
    try {
      const geo = await fetchGeoLocation();
      const weatherUrl =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${geo.lat}&longitude=${geo.lon}` +
        `&current=temperature_2m,weather_code&timezone=auto`;
      const weatherRes = await fetch(weatherUrl);
      if (!weatherRes.ok) throw new Error(`weather HTTP ${weatherRes.status}`);
      const weather = await weatherRes.json();
      sendResponse({
        ok: true,
        data: {
          city: geo.city,
          temp: Math.round(weather.current.temperature_2m),
          code: weather.current.weather_code,
          fetchedAt: Date.now(),
        },
      });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true;
});

// ─── Initial run ─────────────────────────────────────────────────────────────

// Run once immediately when the service worker first loads
updateBadge();
