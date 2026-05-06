/* ================================================================
   Browser Organizer — Dashboard App (Pure Extension Edition)

   This file is the brain of the dashboard. Now that the dashboard
   IS the extension page (not inside an iframe), it can call
   chrome.tabs and chrome.storage directly — no postMessage bridge needed.

   What this file does:
   1. Reads open browser tabs directly via chrome.tabs.query()
   2. Groups tabs by domain with a landing pages category
   3. Renders domain cards, banners, and stats
   4. Handles all user actions (close tabs, save for later, focus tab)
   5. Stores local state and supports JSON backup / restore
   ================================================================ */

"use strict";

const TabHomeStorage = window.TabHomeStorage;

const APP_DISPLAY_NAME = "Browser Organizer";
const EXPORT_APP_ID = "browser-organizer";
const LEGACY_EXPORT_APP_IDS = ["tab-home"];
const PROFILE_BOOKMARK_PREVIEW_LIMIT = 5;
const PLANNER_MAX_DAYS_AHEAD = 365;

/* No hard cap on favorites. The favorites column scrolls when content
   overflows. SLOT_UPPER_BOUND is just a defensive ceiling on slot indices
   — nobody should ever hit it, but it prevents pathological inputs from
   creating a grid with billions of empty cells. */
const SLOT_UPPER_BOUND = 10000;

/* ================================================================
   Modules loaded before this file (via <script> tags in index.html):
     i18n.js      – STRINGS, t(), escapeHtml(), loadLang(), saveLang()
     theme.js     – themes, paintThemeToggle(), applyStaticI18n()
     tabs.js      – openTabs, tabStatuses, fetchOpenTabs(), focusTab(), …
     favorites.js – getFavorites(), setFavorites(), addFavorite(), sections, migrations
     planner.js   – dailyTasks, calendar, profile image helpers
     hero.js      – hero note editing
     backup.js    – JSON export / import
     helpers.js   – UI animations, weather, domain/title cleanup, favicon, ICONS
   ================================================================ */

/* ----------------------------------------------------------------
   IN-MEMORY STORE FOR OPEN-TAB GROUPS
   ---------------------------------------------------------------- */
let domainGroups = []; // regular open-tabs groups
let pinnedDomainGroups = []; // pinned-tabs groups (rendered above)
const collapsedDomainCards = new Set();
let currentTabView = "domain"; // "domain" | "status"
let batchMode = false;
const batchSelected = new Map(); // url → tabId

function updateBatchBar() {
  const bar = document.getElementById("batchBar");
  const countEl = document.getElementById("batchCount");
  if (!bar) return;
  if (!batchMode || batchSelected.size === 0) {
    bar.style.display = "none";
  } else {
    bar.style.display = "flex";
    if (countEl) countEl.textContent = `${batchSelected.size} selected`;
  }
  updateSaveSessionBtn();
}

function updateSaveSessionBtn() {
  const btn = document.getElementById("saveSessionBtn");
  if (!btn) return;
  if (batchMode && batchSelected.size > 0) {
    btn.textContent = `+ Save ${batchSelected.size} tabs`;
    btn.title = `Save ${batchSelected.size} selected tabs as a session`;
  } else {
    const count = getRealTabs().filter((t) => !t.pinned).length;
    btn.textContent = `+ Save All`;
    btn.title = `Save all ${count} open tabs as a session`;
  }
}

function exitBatchMode() {
  batchMode = false;
  batchSelected.clear();
  const section = document.getElementById("openTabsSection");
  if (section) section.classList.remove("batch-mode");
  const btn = document.getElementById("batchModeBtn");
  if (btn) {
    btn.classList.remove("is-active");
    btn.textContent = "Select";
  }
  updateBatchBar();
}

function enterBatchMode() {
  batchMode = true;
  const section = document.getElementById("openTabsSection");
  if (section) section.classList.add("batch-mode");
  const btn = document.getElementById("batchModeBtn");
  if (btn) {
    btn.classList.add("is-active");
    btn.textContent = "Done";
  }
  updateBatchBar();
}

/* ----------------------------------------------------------------
   HELPER: filter out browser-internal pages
   ---------------------------------------------------------------- */

/**
 * getRealTabs()
 *
 * Returns tabs that are real web pages — no chrome://, extension
 * pages, about:blank, etc.
 */
function getRealTabs() {
  return openTabs.filter((t) => {
    const url = t.url || "";
    return (
      !url.startsWith("chrome://") &&
      !url.startsWith("chrome-extension://") &&
      !url.startsWith("about:") &&
      !url.startsWith("edge://") &&
      !url.startsWith("brave://")
    );
  });
}

/**
 * getDisplayTabs()
 *
 * Returns tabs to show in the domain cards panel — all tabs except
 * truly blank/useless ones. Includes chrome:// and chrome-extension://
 * pages so the user can manage the full tab set from one place.
 */
function getDisplayTabs() {
  return openTabs.filter((t) => {
    const url = t.url || "";
    if (!url) return false;
    if (t.isTabOut) return false;
    if (url.startsWith("about:")) return false;
    if (url.startsWith("edge://") || url.startsWith("brave://")) return false;
    return true;
  });
}

/**
 * checkTabOutDupes()
 *
 * Counts how many tab-out pages are open. If more than 1,
 * shows a banner offering to close the extras.
 */
function checkTabOutDupes() {
  const tabOutTabs = openTabs.filter((t) => t.isTabOut);
  const banner = document.getElementById("tabOutDupeBanner");
  const countEl = document.getElementById("tabOutDupeCount");
  if (!banner) return;

  if (tabOutTabs.length > 1) {
    if (countEl) countEl.textContent = tabOutTabs.length;
    banner.style.display = "inline-flex";
  } else {
    banner.style.display = "none";
  }
}

/* ----------------------------------------------------------------
   OVERFLOW CHIPS ("+N more" expand button in domain cards)
   ---------------------------------------------------------------- */

function buildOverflowChips(
  hiddenTabs,
  urlCounts = {},
  favoritedUrls = new Set(),
) {
  const hiddenChips = hiddenTabs
    .map((tab) => {
      const label = cleanTitle(
        smartTitle(stripTitleNoise(tab.title || ""), tab.url),
        "",
      );
      const count = urlCounts[tab.url] || 1;
      const safeUrl = escapeHtml(tab.url || "");
      const safeTitle = escapeHtml(label);
      const dupeTag =
        count > 1
          ? ` <button class="chip-dupe-badge" data-action="dedup-this-url" data-tab-url="${safeUrl}" title="${t("closeDupes")}"><span class="dupe-count">${t("dupeBadge", count)}</span><span class="dupe-action">${t("closeDupes")}</span></button>`
          : "";
      const chipClass = count > 1 ? " chip-has-dupes" : "";
      const isFav = favoritedUrls.has(tab.url);
      const isPinned = !!tab.pinned;
      const faviconUrl = getFaviconUrl(tab.url, 64);
      return `<div class="page-chip clickable${chipClass}" data-action="focus-tab" data-tab-url="${safeUrl}" data-tab-id="${tab.id}" title="${safeTitle}">
      <input class="batch-check" type="checkbox" data-action="batch-select-tab" data-tab-url="${safeUrl}" data-tab-id="${tab.id}">
      ${faviconUrl ? `<img class="chip-favicon" src="${faviconUrl}" alt="">` : ""}
      <span class="chip-text">${safeTitle}</span>${dupeTag}
      <div class="chip-actions">
        <button class="chip-action chip-task" data-action="add-tab-to-task" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="Add to tasks">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75"/></svg>
        </button>
        <button class="chip-action chip-star${isFav ? " active" : ""}" data-action="favorite-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="${isFav ? t("removeFromFav") : t("addToFav")}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>
        </button>
        <button class="chip-action chip-pin${isPinned ? " active" : ""}" data-action="pin-tab" data-tab-url="${safeUrl}" data-tab-id="${tab.id}" title="${isPinned ? t("unpinTip") : t("pinTip")}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
        </button>
<button class="chip-action chip-close" data-action="close-single-tab" data-tab-url="${safeUrl}" data-tab-id="${tab.id}" title="${t("closeThisTab")}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>`;
    })
    .join("");

  return `
    <div class="page-chips-overflow" style="display:none">${hiddenChips}</div>
    <div class="page-chip page-chip-overflow clickable" data-action="expand-chips">
      <span class="chip-text">${t("plusN", hiddenTabs.length)}</span>
    </div>`;
}

function renderDomainCard(group, favoritedUrls = new Set()) {
  const tabs = group.tabs || [];
  const tabCount = tabs.length;
  const isLanding = group.domain === "__landing-pages__";
  const stableId = "domain-" + group.domain.replace(/[^a-z0-9]/g, "-");
  const isCollapsed = collapsedDomainCards.has(stableId);

  // Count duplicates (exact URL match)
  const urlCounts = {};
  for (const tab of tabs) urlCounts[tab.url] = (urlCounts[tab.url] || 0) + 1;
  const dupeUrls = Object.entries(urlCounts).filter(([, c]) => c > 1);
  const hasDupes = dupeUrls.length > 0;
  const totalExtras = dupeUrls.reduce((s, [, c]) => s + c - 1, 0);
  void totalExtras;

  const tabBadge = `<span class="open-tabs-badge">
    ${ICONS.tabs}
    ${tabCount}
  </span>`;

  // Deduplicate for display: show each URL once, with (Nx) badge if duped
  const seen = new Set();
  const uniqueTabs = [];
  for (const tab of tabs) {
    if (!seen.has(tab.url)) {
      seen.add(tab.url);
      uniqueTabs.push(tab);
    }
  }

  const visibleTabs = uniqueTabs.slice(0, 8);
  const extraCount = uniqueTabs.length - visibleTabs.length;

  const pageChips =
    visibleTabs
      .map((tab) => {
        let label = cleanTitle(
          smartTitle(stripTitleNoise(tab.title || ""), tab.url),
          group.domain,
        );
        // For localhost tabs, prepend port number so you can tell projects apart
        try {
          const parsed = new URL(tab.url);
          if (parsed.hostname === "localhost" && parsed.port)
            label = `${parsed.port} ${label}`;
        } catch {}
        const count = urlCounts[tab.url];
        const safeUrl = escapeHtml(tab.url || "");
        const safeTitle = escapeHtml(label);
        const dupeTag =
          count > 1
            ? ` <button class="chip-dupe-badge" data-action="dedup-this-url" data-tab-url="${safeUrl}" title="${t("closeDupes")}"><span class="dupe-count">${t("dupeBadge", count)}</span><span class="dupe-action">${t("closeDupes")}</span></button>`
            : "";
        const chipClass = count > 1 ? " chip-has-dupes" : "";
        const isFav = favoritedUrls.has(tab.url);
        const isPinned = !!tab.pinned;
        const status = tabStatuses[tab.url] || "";
        const statusPill = status
          ? `<span class="chip-status-pill chip-status-${status}">${status === "later" ? "Later" : "Important"}</span>`
          : "";
        const faviconUrl = getFaviconUrl(tab.url, 64);
        return `<div class="page-chip clickable${chipClass}${status ? ` chip-${status}` : ""}" data-action="focus-tab" data-tab-url="${safeUrl}" data-tab-id="${tab.id}" title="${safeTitle}">
      <input class="batch-check" type="checkbox" data-action="batch-select-tab" data-tab-url="${safeUrl}" data-tab-id="${tab.id}">
      ${faviconUrl ? `<img class="chip-favicon" src="${faviconUrl}" alt="">` : ""}
      <span class="chip-text">${safeTitle}</span>${statusPill}${dupeTag}
      <div class="chip-actions">
        <button class="chip-action chip-later${status === "later" ? " active" : ""}" data-action="mark-tab-later" data-tab-url="${safeUrl}" title="Later">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
        </button>
        <button class="chip-action chip-important${status === "important" ? " active" : ""}" data-action="mark-tab-important" data-tab-url="${safeUrl}" title="Important">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5"/></svg>
        </button>
        <button class="chip-action chip-task" data-action="add-tab-to-task" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="Add to tasks">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75"/></svg>
        </button>
        <button class="chip-action chip-star${isFav ? " active" : ""}" data-action="favorite-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="${isFav ? t("removeFromFav") : t("addToFav")}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>
        </button>
        <button class="chip-action chip-pin${isPinned ? " active" : ""}" data-action="pin-tab" data-tab-url="${safeUrl}" data-tab-id="${tab.id}" title="${isPinned ? t("unpinTip") : t("pinTip")}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
        </button>
<button class="chip-action chip-close" data-action="close-single-tab" data-tab-url="${safeUrl}" data-tab-id="${tab.id}" title="${t("closeThisTab")}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>`;
      })
      .join("") +
    (extraCount > 0
      ? buildOverflowChips(uniqueTabs.slice(8), urlCounts, favoritedUrls)
      : "");

  // Close-all icon-only button at the top-right of the card. Tooltip carries the label.
  const closeAllBtn = `
    <button class="action-btn close-tabs mission-close-all" data-action="close-domain-tabs" data-domain-id="${stableId}" title="${t("closeAllN", tabCount)}">
      ${ICONS.close}
    </button>`;

  return `
    <div class="mission-card domain-card ${tabs.some((t) => t.active) ? "has-active-bar" : hasDupes ? "has-amber-bar" : "has-neutral-bar"}${isCollapsed ? " is-collapsed" : ""}" data-domain-id="${stableId}">
      <div class="status-bar"></div>
      <div class="mission-content">
        <div class="mission-top">
          <span class="mission-name">${isLanding ? t("homepages") : group.label || friendlyDomain(group.domain)}</span>
          ${tabBadge}
          ${closeAllBtn}
          <button class="domain-collapse-btn" data-action="toggle-domain-card" data-domain-id="${stableId}" aria-expanded="${isCollapsed ? "false" : "true"}" title="Collapse group">⌃</button>
        </div>
        <div class="mission-pages">${pageChips}</div>
      </div>
      <div class="mission-meta">
        <div class="mission-page-count">${tabCount}</div>
        <div class="mission-page-label">${t("tabs")}</div>
      </div>
    </div>`;
}

function renderFavoriteItem(fav) {
  const safeUrl = escapeHtml(fav.url || "");
  const safeTitle = escapeHtml(fav.title || fav.url || "");
  const sectionId = fav.sectionId || "default";
  const sectionSlot =
    typeof fav.sectionSlot === "number" ? fav.sectionSlot : fav.slot || 0;

  let imgHtml = "";
  if (fav.customLogo) {
    imgHtml = `<img class="favorite-favicon" src="${fav.customLogo}" draggable="false" alt="">`;
  } else if (fav.iconUrl) {
    // Already resolved. Data URLs are real binary caches — mark resolved so
    // we never re-download. Plain URL strings (legacy) get rendered but left
    // unresolved, so the load handler downloads + upgrades to a data URL.
    const safe = fav.iconUrl.replace(/"/g, "&quot;");
    const isBinary = fav.iconUrl.startsWith("data:");
    const resolved = isBinary ? 'data-resolved="1"' : "";
    imgHtml = `<img class="favorite-favicon" src="${safe}" data-fav-id="${fav.id}" ${resolved} draggable="false" alt="">`;
  } else {
    const chain = getFaviconFallbackChain(fav.url, 128);
    if (chain.length > 0) {
      const primary = chain[0].replace(/"/g, "&quot;");
      const fallback = chain.slice(1).join("|").replace(/"/g, "&quot;");
      imgHtml = `<img class="favorite-favicon" src="${primary}" data-fallback="${fallback}" data-fav-id="${fav.id}" draggable="false" alt="">`;
    }
  }

  return `
    <div class="favorite-item" data-fav-id="${fav.id}" data-fav-url="${safeUrl}" data-section-id="${sectionId}" data-slot="${sectionSlot}" title="${safeUrl}" role="link" tabindex="0">
      ${imgHtml}
      <span class="favorite-title">${safeTitle}</span>
      <button class="favorite-menu" data-action="favorite-menu" data-fav-id="${fav.id}" title="${t("moreActions")}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
      </button>
    </div>`;
}

async function renderFavoritesColumn() {
  const container = document.getElementById("favoriteSectionsList");
  const empty = document.getElementById("favoritesEmpty");
  if (!container || !empty) return;

  try {
    const sections = await getFavoriteSections();
    const items = await getFavorites();
    empty.style.display = items.length === 0 ? "block" : "none";
    container.innerHTML = sections
      .sort((a, b) => a.order - b.order)
      .map((section) => renderFavoriteSection(section, items))
      .join("");
  } catch (err) {
    console.warn("[wolfy] Could not load favorites:", err);
  }
}

function renderFavoriteSection(section, favorites) {
  const safeName = escapeHtml(section.name || t("favorites"));
  const sectionItems = favorites
    .filter((f) => (f.sectionId || "default") === section.id)
    .sort((a, b) => {
      const aSlot =
        typeof a.sectionSlot === "number" ? a.sectionSlot : a.slot || 0;
      const bSlot =
        typeof b.sectionSlot === "number" ? b.sectionSlot : b.slot || 0;
      return aSlot - bSlot;
    });

  // Render items in sorted order with contiguous indices.
  // Only append ONE hidden empty slot (for drag-drop targets).
  let row = "";
  for (let i = 0; i < sectionItems.length; i++) {
    row += renderFavoriteItem(sectionItems[i]);
  }
  // Single empty drop slot at the end (hidden by default, shown during drag)
  const nextSlot = sectionItems.length;
  row += `<div class="favorite-slot-empty" data-section-id="${section.id}" data-slot="${nextSlot}"></div>`;

  return `
    <section class="favorite-section${section.collapsed ? " is-collapsed" : ""}" data-section-id="${section.id}">
      <div class="favorite-section-header">
        <button class="favorite-section-title" data-action="toggle-favorite-section" data-section-id="${section.id}" aria-expanded="${section.collapsed ? "false" : "true"}">
          <span>${safeName}</span>
          <small>${sectionItems.length}</small>
        </button>
        <div class="favorite-section-actions">
          <button data-action="move-favorite-section" data-section-id="${section.id}" data-dir="-1" title="Move up">\u2191</button>
          <button data-action="move-favorite-section" data-section-id="${section.id}" data-dir="1" title="Move down">\u2193</button>
          <button data-action="rename-favorite-section" data-section-id="${section.id}" title="${t("edit")}">${t("edit")}</button>${
            section.id !== "default"
              ? `
          <button data-action="delete-favorite-section" data-section-id="${section.id}" title="Delete section">\u2715</button>`
              : ""
          }
          <button data-action="add-favorite-to-section" data-section-id="${section.id}" title="${t("addAFavorite")}">+</button>
        </div>
      </div>
      <div class="favorites-list favorite-row">${row}</div>
    </section>`;
}

/* ----------------------------------------------------------------
   CHROME PROFILE BOOKMARKS + READING LIST

   These APIs read the current Chrome profile's native data so the new-tab
   override does not make the browser's own Bookmarks and Lists feel hidden.
   Sources:
   - https://developer.chrome.com/docs/extensions/reference/api/bookmarks
   ---------------------------------------------------------------- */

function hasChromeBookmarksApi() {
  return !!(chrome.bookmarks && typeof chrome.bookmarks.getTree === "function");
}

async function loadBookmarkUiState() {
  try {
    const data = await chrome.storage.local.get([
      "profileBookmarkCollapsedFolders",
      "profileBookmarkExpandedFolders",
    ]);
    collapsedBookmarkFolders = new Set(
      data.profileBookmarkCollapsedFolders || [],
    );
    expandedBookmarkFolders = new Set(
      data.profileBookmarkExpandedFolders || [],
    );
  } catch {
    collapsedBookmarkFolders = new Set();
    expandedBookmarkFolders = new Set();
  }
}

async function saveBookmarkUiState() {
  try {
    await chrome.storage.local.set({
      profileBookmarkCollapsedFolders: Array.from(collapsedBookmarkFolders),
      profileBookmarkExpandedFolders: Array.from(expandedBookmarkFolders),
    });
  } catch {}
}

function countBookmarkUrls(nodes = []) {
  let count = 0;
  for (const node of nodes || []) {
    if (!node) continue;
    if (shouldHideBookmarkNode(node)) continue;
    if (node.url) count += 1;
    if (node.children) count += countBookmarkUrls(node.children);
  }
  return count;
}

function countFolderChildren(node) {
  return countBookmarkUrls(node?.children || []);
}

function collectBookmarkFolderIds(nodes = []) {
  const ids = [];
  for (const node of nodes || []) {
    if (!node) continue;
    if (shouldHideBookmarkNode(node)) continue;
    if (!node.url && node.id) ids.push(node.id);
    if (node.children) ids.push(...collectBookmarkFolderIds(node.children));
  }
  return ids;
}

function shouldHideBookmarkNode(node) {
  if (!node || node.url) return false;
  const title = String(node.title || "")
    .trim()
    .toLowerCase();
  return node.id === "2" || title === "other bookmarks";
}

function renderProfileBookmarkIcon(url) {
  const faviconUrl = getFaviconUrl(url, 32);
  if (!faviconUrl)
    return '<span class="profile-link-icon profile-page-icon" aria-hidden="true"></span>';
  const safeIcon = faviconUrl.replace(/"/g, "&quot;");
  return `<img class="profile-link-icon profile-favicon" src="${safeIcon}" alt="">`;
}

function renderBookmarkLeaf(node, depth = 0) {
  const safeTitle = escapeHtml(node.title || node.url || "");
  const safeUrl = (node.url || "").replace(/"/g, "&quot;");
  return `
    <a class="profile-link-row bookmark-leaf-row" href="${safeUrl}" target="_blank" rel="noopener noreferrer" title="${safeUrl}" style="--depth:${depth}">
      ${renderProfileBookmarkIcon(node.url)}
      <span class="profile-link-title">${safeTitle}</span>
    </a>`;
}

function renderBookmarkFolder(node, depth = 0) {
  const id = escapeHtml(node.id || "");
  const title = escapeHtml(node.title || t("profileBookmarks"));
  const total = countFolderChildren(node);
  const isCollapsed = collapsedBookmarkFolders.has(node.id);
  const isPreviewExpanded = expandedBookmarkFolders.has(node.id);
  const children = node.children || [];
  const visibleChildren = isPreviewExpanded
    ? children
    : children.slice(0, PROFILE_BOOKMARK_PREVIEW_LIMIT);
  const remaining = Math.max(0, children.length - visibleChildren.length);

  return `
    <div class="bookmark-tree-folder" data-bookmark-folder-id="${id}">
      <button class="bookmark-folder-row" type="button" data-action="toggle-bookmark-folder" data-folder-id="${id}" style="--depth:${depth}">
        <span class="bookmark-folder-chevron" aria-hidden="true">${isCollapsed ? "›" : "⌄"}</span>
        <span class="bookmark-folder-icon" aria-hidden="true">▣</span>
        <span class="bookmark-folder-title">${title}</span>
        <small class="bookmark-folder-count">${total}</small>
      </button>
      <div class="bookmark-folder-children"${isCollapsed ? " hidden" : ""}>
        ${visibleChildren.map((child) => renderBookmarkTreeNode(child, depth + 1)).join("")}
        ${
          remaining > 0
            ? `
          <button class="bookmark-view-more" type="button" data-action="expand-bookmark-folder-preview" data-folder-id="${id}" style="--depth:${depth + 1}">
            ${escapeHtml(t("profileViewAll", children.length))}
          </button>
        `
            : ""
        }
      </div>
    </div>`;
}

function renderBookmarkTreeNode(node, depth = 0) {
  if (!node) return "";
  if (shouldHideBookmarkNode(node)) return "";
  if (node.url) return renderBookmarkLeaf(node, depth);
  return renderBookmarkFolder(node, depth);
}

function renderProfileEmpty(message) {
  return `<div class="profile-library-empty">${escapeHtml(message)}</div>`;
}

async function renderProfileBookmarks() {
  const list = document.getElementById("profileBookmarksList");
  const count = document.getElementById("profileBookmarksCount");
  if (!list || !count) return;

  if (!hasChromeBookmarksApi()) {
    count.textContent = "0";
    list.innerHTML = renderProfileEmpty(t("profileBookmarksUnavailable"));
    return;
  }

  try {
    const tree = await chrome.bookmarks.getTree();
    const roots = (tree?.[0]?.children || []).filter(
      (node) => !shouldHideBookmarkNode(node),
    );
    const bookmarkCount = countBookmarkUrls(roots);
    count.textContent = bookmarkCount > 0 ? String(bookmarkCount) : "";

    if (!roots.length) {
      list.innerHTML = renderProfileEmpty(t("profileBookmarksEmpty"));
      return;
    }

    list.innerHTML = roots
      .map((node) => renderBookmarkTreeNode(node, 0))
      .join("");
  } catch (error) {
    console.warn("[browser-organizer] bookmarks render failed:", error);
    count.textContent = "0";
    list.innerHTML = renderProfileEmpty(t("profileBookmarksUnavailable"));
  }
}

async function renderProfileLibrary() {
  await renderProfileBookmarks();
}

let _profileLibraryRenderTimer = null;

function scheduleProfileLibraryRender() {
  if (_profileLibraryRenderTimer) clearTimeout(_profileLibraryRenderTimer);
  _profileLibraryRenderTimer = setTimeout(() => {
    _profileLibraryRenderTimer = null;
    renderProfileLibrary();
  }, 150);
}

function duplicateExtrasCount(tabs) {
  const counts = new Map();
  for (const tab of tabs || []) {
    if (!tab.url) continue;
    counts.set(tab.url, (counts.get(tab.url) || 0) + 1);
  }
  let extras = 0;
  for (const count of counts.values()) {
    if (count > 1) extras += count - 1;
  }
  return extras;
}

function renderSmartCleanup(tabs, displayTabCount) {
  const card = document.getElementById("smartCleanupCard");
  if (!card) return;
  if (displayTabCount === 0) {
    card.style.display = "none";
    return;
  }
  card.style.display = "";
  const duplicates = duplicateExtrasCount(tabs);

  // Collect duplicate URLs for the "close all" action
  const urlCounts = new Map();
  for (const tab of tabs || []) {
    if (!tab.url) continue;
    urlCounts.set(tab.url, (urlCounts.get(tab.url) || 0) + 1);
  }
  const dupeUrls = [...urlCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([url]) => url);

  if (duplicates > 0) {
    card.innerHTML = `
      <div>
        <p class="eyebrow">${currentLang === "zh" ? "智能清理" : "Smart cleanup"}</p>
        <strong class="cleanup-detail">${t("nDuplicateTabsFound", duplicates)}</strong>
        <span>${t("cleanupHint")}</span>
      </div>
      <div class="cleanup-actions">
        <button class="review-duplicates-btn" data-action="review-duplicates">${t("reviewDupes")}</button>
        <button class="cleanup-close-btn" data-action="close-all-duplicates" title="Close all duplicate tabs (keep one of each)">Close ${duplicates} dupes</button>
      </div>`;
  } else {
    card.innerHTML = `
      <div>
        <p class="eyebrow">${currentLang === "zh" ? "智能清理" : "Smart cleanup"}</p>
        <strong class="cleanup-detail">${t("noDupes")}</strong>
        <span>${t("cleanupHint")}</span>
      </div>`;
  }
}

/* ----------------------------------------------------------------
   SAVED SESSIONS
   ---------------------------------------------------------------- */
let savedSessions = [];

async function loadSavedSessions() {
  savedSessions = await TabHomeStorage.getSavedSessions();
}

async function persistSessions() {
  await TabHomeStorage.setSavedSessions(savedSessions);
}

function renderSavedSessions() {
  const panel = document.getElementById("savedSessionsPanel");
  const list = document.getElementById("savedSessionsList");
  if (!panel || !list) return;

  if (savedSessions.length === 0) {
    list.innerHTML = `<div class="session-empty">No saved sessions yet.</div>`;
    return;
  }
  list.innerHTML = savedSessions
    .map((s) => {
      const dateStr = new Date(s.createdAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      // Inline favicon stack — show up to 5 tiny favicons as a visual preview
      const faviconStack = s.tabs
        .slice(0, 5)
        .map((tab) => {
          const faviconUrl = getFaviconUrl(tab.url, 16);
          return faviconUrl
            ? `<img class="session-favicon-dot" src="${faviconUrl}" alt="">`
            : `<span class="session-favicon-dot session-favicon-placeholder"></span>`;
        })
        .join("");
      const moreCount =
        s.tabs.length > 5
          ? `<span class="session-favicon-more">+${s.tabs.length - 5}</span>`
          : "";

      // Expandable tab list
      const tabPreview = s.tabs
        .map((tab) => {
          const faviconUrl = getFaviconUrl(tab.url, 16);
          const title = escapeHtml(tab.title || tab.url);
          const url = escapeHtml(tab.url);
          return `<div class="session-tab-row" title="${url}">
          ${faviconUrl ? `<img class="session-tab-favicon" src="${faviconUrl}" alt="">` : `<span class="session-tab-favicon"></span>`}
          <span class="session-tab-title">${title}</span>
        </div>`;
        })
        .join("");

      return `<div class="session-row-item" data-session-id="${escapeHtml(s.id)}">
      <div class="session-row" data-action="toggle-session-preview" data-session-id="${escapeHtml(s.id)}">
        <div class="session-favicons">${faviconStack}${moreCount}</div>
        <div class="session-info">
          <span class="session-name" data-action="rename-session" data-session-id="${escapeHtml(s.id)}" title="Click to rename">${escapeHtml(s.name)}</span>
          <span class="session-meta">${s.tabs.length} tabs · ${dateStr}</span>
        </div>
        <div class="session-actions">
          <button class="action-btn" data-action="restore-session" data-session-id="${escapeHtml(s.id)}" title="Restore all tabs">Open</button>
          <button class="action-btn close-tabs" data-action="delete-session" data-session-id="${escapeHtml(s.id)}" title="Delete session">${ICONS.close}</button>
        </div>
      </div>
      <div class="session-preview" style="display:none">${tabPreview}</div>
    </div>`;
    })
    .join("");
}

async function saveCurrentSession() {
  let tabsToSave;
  if (batchMode && batchSelected.size > 0) {
    const selectedUrls = new Set(batchSelected.keys());
    tabsToSave = openTabs.filter((t) => selectedUrls.has(t.url));
  } else {
    tabsToSave = getRealTabs().filter((t) => !t.pinned);
  }
  if (tabsToSave.length === 0) return;
  const name = `Session (${tabsToSave.length} tabs)`;
  const session = {
    id: makeId("sess"),
    name,
    createdAt: new Date().toISOString(),
    tabs: tabsToSave.map((t) => ({ url: t.url, title: t.title })),
  };
  savedSessions.unshift(session);
  await persistSessions();
  renderSavedSessions();
  if (batchMode) exitBatchMode();
  showToast(`Session saved — ${tabsToSave.length} tabs`);
}

async function restoreSession(id) {
  const session = savedSessions.find((s) => s.id === id);
  if (!session) return;
  for (const tab of session.tabs) {
    try {
      await chrome.tabs.create({ url: tab.url, active: false });
    } catch {}
  }
  showToast(`Restored ${session.tabs.length} tabs`);
}

async function deleteSession(id) {
  savedSessions = savedSessions.filter((s) => s.id !== id);
  await persistSessions();
  renderSavedSessions();
}

/* ----------------------------------------------------------------
   MAIN DASHBOARD RENDERER
   ---------------------------------------------------------------- */

/**
 * renderStatusView(tabs, favoritedUrls)
 *
 * Renders open tabs grouped by status: Important → Later → Active (no status).
 */
function renderStatusView(tabs, favoritedUrls) {
  const groups = { important: [], later: [], active: [] };
  for (const tab of tabs) {
    const status = tabStatuses[tab.url];
    if (status === "important") groups.important.push(tab);
    else if (status === "later") groups.later.push(tab);
    else groups.active.push(tab);
  }

  const LABELS = { important: "Important", later: "Later", active: "Active" };

  let html = "";
  for (const key of ["important", "later", "active"]) {
    const list = groups[key];
    if (!list.length) continue;
    const chips = list
      .map((tab) => {
        const label = cleanTitle(
          smartTitle(stripTitleNoise(tab.title || ""), tab.url),
          "",
        );
        const safeUrl = escapeHtml(tab.url || "");
        const safeTitle = escapeHtml(label);
        const isFav = favoritedUrls.has(tab.url);
        const faviconUrl = getFaviconUrl(tab.url, 64);
        return `<div class="page-chip clickable" data-action="focus-tab" data-tab-url="${safeUrl}" data-tab-id="${tab.id}" title="${safeTitle}">
        <input class="batch-check" type="checkbox" data-action="batch-select-tab" data-tab-url="${safeUrl}" data-tab-id="${tab.id}">
        ${faviconUrl ? `<img class="chip-favicon" src="${faviconUrl}" alt="">` : ""}
        <span class="chip-text">${safeTitle}</span>
        <div class="chip-actions">
          <button class="chip-action chip-task" data-action="add-tab-to-task" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="Add to tasks">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75"/></svg>
          </button>
          <button class="chip-action chip-star${isFav ? " active" : ""}" data-action="favorite-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="${isFav ? t("removeFromFav") : t("addToFav")}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>
          </button>
          <button class="chip-action chip-close" data-action="close-single-tab" data-tab-url="${safeUrl}" data-tab-id="${tab.id}" title="${t("closeThisTab")}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>`;
      })
      .join("");
    html += `<div class="status-group-card">
      <div class="status-group-header"><span class="status-dot status-dot-${key}"></span>${LABELS[key]} (${list.length})</div>
      <div class="mission-pages">${chips}</div>
    </div>`;
  }
  return html;
}

/**
 * renderStaticDashboard()
 *
 * The main render function:
 * 1. Paints greeting + date
 * 2. Fetches open tabs via chrome.tabs.query()
 * 3. Groups tabs by domain (with landing pages pulled out to their own group)
 * 4. Renders domain cards
 * 5. Updates footer stats
 * 6. Renders the "Saved for Later" checklist
 */
async function renderStaticDashboard() {
  // --- Header ---
  paintTopbarTime();

  // --- Fetch tabs ---
  await fetchOpenTabs();
  const realTabs = getRealTabs();

  // --- Group tabs by domain ---
  // Tabs are grouped purely by hostname. The original tab-out had a special
  // "Homepages" group that pulled out x.com/home, gmail inbox, etc. — but
  // splitting x.com tabs across two groups (Homepages + X) was confusing.
  // Users can re-enable per-site landing-page splits via config.local.js
  // (LOCAL_LANDING_PAGE_PATTERNS) if they want the old behavior.
  const LANDING_PAGE_PATTERNS = [
    ...(typeof LOCAL_LANDING_PAGE_PATTERNS !== "undefined"
      ? LOCAL_LANDING_PAGE_PATTERNS
      : []),
  ];

  function isLandingPage(url) {
    try {
      const parsed = new URL(url);
      return LANDING_PAGE_PATTERNS.some((p) => {
        // Support both exact hostname and suffix matching (for wildcard subdomains)
        const hostnameMatch = p.hostname
          ? parsed.hostname === p.hostname
          : p.hostnameEndsWith
            ? parsed.hostname.endsWith(p.hostnameEndsWith)
            : false;
        if (!hostnameMatch) return false;
        if (p.test) return p.test(parsed.pathname, url);
        if (p.pathPrefix) return parsed.pathname.startsWith(p.pathPrefix);
        if (p.pathExact) return p.pathExact.includes(parsed.pathname);
        return parsed.pathname === "/";
      });
    } catch {
      return false;
    }
  }

  // Custom group rules from config.local.js (if any)
  const customGroups =
    typeof LOCAL_CUSTOM_GROUPS !== "undefined" ? LOCAL_CUSTOM_GROUPS : [];

  function matchCustomGroup(url) {
    try {
      const parsed = new URL(url);
      return (
        customGroups.find((r) => {
          const hostMatch = r.hostname
            ? parsed.hostname === r.hostname
            : r.hostnameEndsWith
              ? parsed.hostname.endsWith(r.hostnameEndsWith)
              : false;
          if (!hostMatch) return false;
          if (r.pathPrefix) return parsed.pathname.startsWith(r.pathPrefix);
          return true;
        }) || null
      );
    } catch {
      return null;
    }
  }

  const landingHostnames = new Set(
    LANDING_PAGE_PATTERNS.map((p) => p.hostname).filter(Boolean),
  );
  const landingSuffixes = LANDING_PAGE_PATTERNS.map(
    (p) => p.hostnameEndsWith,
  ).filter(Boolean);
  function isLandingDomain(domain) {
    if (landingHostnames.has(domain)) return true;
    return landingSuffixes.some((s) => domain.endsWith(s));
  }

  /**
   * Group an array of tabs into domain cards. Same logic as before, just
   * factored out so we can run it twice — once for pinned tabs, once for
   * the rest — and render each set into its own sub-section.
   */
  function groupTabsByDomain(tabs) {
    const groupMap = {};
    const landing = [];
    for (const tab of tabs) {
      // Handle chrome:// pages (Extensions, Settings, History, etc.)
      if (tab.url && tab.url.startsWith("chrome://")) {
        try {
          const hostname = new URL(tab.url).hostname || "chrome";
          const key = "chrome://" + hostname;
          if (!groupMap[key]) {
            const label =
              hostname.charAt(0).toUpperCase() +
              hostname.slice(1).replace(/-/g, " ");
            groupMap[key] = { domain: key, label, tabs: [] };
          }
          groupMap[key].tabs.push(tab);
        } catch {}
        continue;
      }
      // Handle chrome-extension:// pages
      if (tab.url && tab.url.startsWith("chrome-extension://")) {
        try {
          const extId = new URL(tab.url).hostname;
          const key = "chrome-extension://" + extId;
          if (!groupMap[key]) {
            const label = tab.isTabOut
              ? "Browser Organizer"
              : tab.title || "Extension";
            groupMap[key] = { domain: key, label, tabs: [] };
          }
          groupMap[key].tabs.push(tab);
        } catch {}
        continue;
      }
      try {
        if (isLandingPage(tab.url)) {
          landing.push(tab);
          continue;
        }
        const customRule = matchCustomGroup(tab.url);
        if (customRule) {
          const key = customRule.groupKey;
          if (!groupMap[key])
            groupMap[key] = {
              domain: key,
              label: customRule.groupLabel,
              tabs: [],
            };
          groupMap[key].tabs.push(tab);
          continue;
        }
        const hostname =
          tab.url && tab.url.startsWith("file://")
            ? "local-files"
            : new URL(tab.url).hostname;
        if (!hostname) continue;
        if (!groupMap[hostname])
          groupMap[hostname] = { domain: hostname, tabs: [] };
        groupMap[hostname].tabs.push(tab);
      } catch {
        /* skip malformed */
      }
    }
    if (landing.length > 0) {
      groupMap["__landing-pages__"] = {
        domain: "__landing-pages__",
        tabs: landing,
      };
    }

    // Sort tabs WITHIN each group: most recently active first, then newer
    // tab ids (a fresh tab might have lastAccessed=0 but a higher id than
    // older tabs).
    const tabRecency = (t) => t.lastAccessed || 0;
    for (const g of Object.values(groupMap)) {
      g.tabs.sort((a, b) => {
        const t = tabRecency(b) - tabRecency(a);
        return t !== 0 ? t : b.id - a.id;
      });
    }

    return Object.values(groupMap).sort((a, b) => {
      // Landing pages still float to the top (no-op when LANDING_PAGE_PATTERNS is empty)
      const aIsLanding = a.domain === "__landing-pages__";
      const bIsLanding = b.domain === "__landing-pages__";
      if (aIsLanding !== bIsLanding) return aIsLanding ? -1 : 1;

      // Primary: group with the most recently active tab comes first.
      // Because tabs inside each group are already sorted by recency,
      // tabs[0] holds the freshest one.
      const aTime = a.tabs[0] ? tabRecency(a.tabs[0]) : 0;
      const bTime = b.tabs[0] ? tabRecency(b.tabs[0]) : 0;
      if (aTime !== bTime) return bTime - aTime;

      // Tie-break: highest tab id first — handles brand-new background
      // tabs that haven't been activated yet but should still appear at the top.
      const aMaxId = a.tabs[0] ? a.tabs[0].id : 0;
      const bMaxId = b.tabs[0] ? b.tabs[0].id : 0;
      return bMaxId - aMaxId;
    });
  }

  // Split tabs into pinned + regular and group each subset separately.
  // displayTabs includes chrome:// and extension pages for the full picture;
  // realTabs (filtered) is still used for close-all count and smart cleanup.
  const displayTabs = getDisplayTabs();
  const pinnedRealTabs = realTabs.filter((t) => t.pinned);
  const regularRealTabs = realTabs.filter((t) => !t.pinned);
  const pinnedDisplayTabs = displayTabs.filter((t) => t.pinned);
  const regularDisplayTabs = displayTabs.filter((t) => !t.pinned);
  pinnedDomainGroups = groupTabsByDomain(pinnedDisplayTabs);
  domainGroups = groupTabsByDomain(regularDisplayTabs);
  renderSmartCleanup(realTabs, displayTabs.length);
  renderDailyPlanner();

  // --- Render domain cards ---
  const openTabsSection = document.getElementById("openTabsSection");
  const openTabsSubSection = document.getElementById("openTabsSubSection");
  const openTabsMissionsEl = document.getElementById("openTabsMissions");
  const openTabsSectionCount = document.getElementById("openTabsSectionCount");
  const openTabsSectionTitle = document.getElementById("openTabsSectionTitle");
  const openTabsSectionAction = document.getElementById(
    "openTabsSectionAction",
  );
  const pinnedSubSection = document.getElementById("pinnedSubSection");
  const pinnedMissionsEl = document.getElementById("pinnedMissions");
  const pinnedSectionCount = document.getElementById("pinnedSectionCount");
  const pinnedSectionTitle = document.getElementById("pinnedSectionTitle");

  // Build a Set of favorited URLs so domain cards can render the ⭐ active state
  const favoritedUrls = new Set((await getFavorites()).map((f) => f.url));

  // Pinned sub-section
  if (pinnedSubSection) {
    if (pinnedDomainGroups.length > 0) {
      if (pinnedSectionTitle) pinnedSectionTitle.textContent = t("pinned");
      if (pinnedSectionCount)
        pinnedSectionCount.innerHTML = t("nTabsCount", pinnedRealTabs.length);
      pinnedMissionsEl.innerHTML = pinnedDomainGroups
        .map((g) => renderDomainCard(g, favoritedUrls))
        .join("");
      pinnedSubSection.style.display = "block";
    } else {
      pinnedSubSection.style.display = "none";
    }
  }

  // Open-tabs section is always visible — the column should hold its 50%
  // width even when there are no open tabs, so the favorites column can't
  // expand to swallow the whole page.
  if (openTabsSection) openTabsSection.style.display = "block";

  if (openTabsSectionTitle) openTabsSectionTitle.textContent = t("openTabs");

  if (regularDisplayTabs.length > 0 && openTabsSubSection) {
    openTabsSectionCount.innerHTML = t("nDomains", domainGroups.length);
    if (openTabsSectionAction) {
      openTabsSectionAction.innerHTML = `<button class="action-btn close-tabs" data-action="close-all-open-tabs">${ICONS.close} ${t("closeAllN", regularRealTabs.length)}</button>`;
    }
    if (currentTabView === "status") {
      openTabsMissionsEl.innerHTML = renderStatusView(
        regularDisplayTabs,
        favoritedUrls,
      );
    } else {
      openTabsMissionsEl.innerHTML = domainGroups
        .map((g) => renderDomainCard(g, favoritedUrls))
        .join("");
    }
    openTabsSubSection.style.display = "block";
  } else if (openTabsSubSection) {
    openTabsSubSection.style.display = "none";
    if (openTabsSectionCount) openTabsSectionCount.textContent = "";
    if (openTabsSectionAction) openTabsSectionAction.innerHTML = "";
    const emptyMsg =
      currentLang === "zh"
        ? "所有标签已关闭，享受宁静。"
        : "All tabs closed. Enjoy the calm.";
    const emptyEl = document.getElementById("openTabsEmptyState");
    if (emptyEl) {
      emptyEl.style.display = "block";
      emptyEl.innerHTML = `<p class="tabs-empty-text">${emptyMsg}</p>`;
    }
  }
  // Hide empty state when there are tabs
  if (regularDisplayTabs.length > 0 || pinnedDisplayTabs.length > 0) {
    const emptyEl = document.getElementById("openTabsEmptyState");
    if (emptyEl) emptyEl.style.display = "none";
  }

  // --- Footer stats ---
  const statTabs = document.getElementById("statTabs");
  if (statTabs) statTabs.textContent = realTabs.length;

  // --- Check for duplicate tab-out tabs ---
  checkTabOutDupes();

  // --- Render "Long-term Favorites" column ---
  await renderFavoritesColumn();
}

async function renderDashboard() {
  await renderStaticDashboard();
  // Prune tabStatuses for URLs no longer open in any tab
  const openUrls = new Set(openTabs.map((t) => t.url));
  let pruned = false;
  for (const url of Object.keys(tabStatuses)) {
    if (!openUrls.has(url)) {
      delete tabStatuses[url];
      pruned = true;
    }
  }
  if (pruned) await TabHomeStorage.setTabStatuses(tabStatuses);
}

/* ----------------------------------------------------------------
   EVENT HANDLERS — using event delegation

   One listener on document handles ALL button clicks.
   Think of it as one security guard watching the whole building
   instead of one per door.
   ---------------------------------------------------------------- */

document.addEventListener("click", async (e) => {
  // Walk up the DOM to find the nearest element with data-action
  const actionEl = e.target.closest("[data-action]");
  if (!actionEl) return;

  const action = actionEl.dataset.action;

  // ---- Close duplicate tab-out tabs ----
  if (action === "close-tabout-dupes") {
    await closeTabOutDupes();
    playCloseSound();
    const banner = document.getElementById("tabOutDupeBanner");
    if (banner) {
      banner.style.transition = "opacity 0.4s";
      banner.style.opacity = "0";
      setTimeout(() => {
        banner.style.display = "none";
        banner.style.opacity = "1";
      }, 400);
    }
    showToast(t("closedExtras"));
    return;
  }

  // ---- Language toggle ----
  if (action === "toggle-lang") {
    await saveLang(currentLang === "zh" ? "en" : "zh");
    applyStaticI18n();
    await paintHeroTitle();
    await paintHeroCopy();
    loadAndPaintWeather();
    await renderDashboard();
    await renderProfileLibrary();
    return;
  }

  // ---- Theme picker: toggle dropdown open/close ----
  if (action === "toggle-theme") {
    const dropdown = document.getElementById("themeDropdown");
    if (dropdown?.classList.contains("open")) closeThemeDropdown();
    else openThemeDropdown();
    return;
  }

  // ---- Theme picker: apply selected theme ----
  if (action === "select-theme") {
    await applyTheme(actionEl.dataset.themeId);
    return;
  }

  if (action === "select-planner-date") {
    const dateKey = actionEl.dataset.date;
    if (!dateKey || !isDateInPlannerRange(dateKey)) return;
    selectedPlannerDate = dateKey;
    visiblePlannerMonth = startOfMonth(parseLocalDateKey(dateKey));
    renderDailyPlanner();
    return;
  }

  if (action === "planner-prev-month") {
    const nextMonth = addMonths(visiblePlannerMonth, -1);
    const minMonth = startOfMonth(new Date());
    if (nextMonth.getTime() >= minMonth.getTime()) {
      visiblePlannerMonth = nextMonth;
      renderDailyPlanner();
    }
    return;
  }

  if (action === "planner-next-month") {
    const nextMonth = addMonths(visiblePlannerMonth, 1);
    const maxMonth = startOfMonth(parseLocalDateKey(getPlannerMaxDateKey()));
    if (nextMonth.getTime() <= maxMonth.getTime()) {
      visiblePlannerMonth = nextMonth;
      renderDailyPlanner();
    }
    return;
  }

  if (action === "planner-today" || action === "planner-select-today") {
    const today = new Date();
    selectedPlannerDate = toLocalDateKey(today);
    visiblePlannerMonth = startOfMonth(today);
    renderDailyPlanner();
    return;
  }

  if (action === "toggle-daily-task") {
    const id = actionEl.dataset.taskId;
    if (!id) return;
    const completed = await toggleDailyTask(id);
    if (completed) showToast(t("todoDone"));
    return;
  }

  if (action === "delete-repeat-group") {
    const id = actionEl.dataset.taskId;
    if (!id) return;
    const task = dailyTasks.find((t) => t.id === id);
    if (!task || !task.repeatGroupId) return;
    const count = dailyTasks.filter(
      (t) =>
        t.repeatGroupId === task.repeatGroupId &&
        t.date >= toLocalDateKey(new Date()),
    ).length;
    const ok = await showConfirm({
      message: `Delete all ${count} future tasks in this recurring series?`,
      okLabel: "Delete all",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    await deleteRepeatGroupFuture(id);
    showToast(`Deleted ${count} recurring tasks`);
    return;
  }

  if (action === "delete-daily-task") {
    const id = actionEl.dataset.taskId;
    if (!id) return;
    const task = dailyTasks.find((t) => t.id === id);
    if (!task) return;

    // Check if there are sibling tasks (same repeatGroupId, or same title on other future dates)
    const todayKey = toLocalDateKey(new Date());
    const siblings = dailyTasks.filter((t) => {
      if (t.id === id) return false;
      if (t.date < todayKey) return false;
      if (task.repeatGroupId && t.repeatGroupId === task.repeatGroupId)
        return true;
      if (t.title === task.title && !task.repeatGroupId) return true;
      return false;
    });

    if (siblings.length > 0) {
      const total = siblings.length + 1;
      const ok = await showConfirm({
        message: `"${task.title}" appears on ${total} future dates.\n\nDelete ALL ${total}, or just this one?`,
        okLabel: `Delete all ${total}`,
        cancelLabel: "Just this one",
      });
      if (ok) {
        // Delete all siblings + this task
        const removeIds = new Set(siblings.map((t) => t.id));
        removeIds.add(id);
        dailyTasks = dailyTasks.filter((t) => !removeIds.has(t.id));
        await persistDailyTasks();
        renderDailyPlanner();
        showToast(`Deleted ${total} tasks`);
        return;
      }
    }

    await deleteDailyTask(id);
    return;
  }

  if (action === "open-new-tab") {
    await chrome.tabs.create({});
    return;
  }

  if (action === "open-bookmark-manager") {
    try {
      await chrome.tabs.create({ url: "chrome://bookmarks/" });
    } catch {
      showToast(t("bookmarkManagerUnavailable"));
    }
    return;
  }

  if (action === "toggle-bookmark-folder") {
    const folderId = actionEl.dataset.folderId;
    if (!folderId) return;
    if (collapsedBookmarkFolders.has(folderId))
      collapsedBookmarkFolders.delete(folderId);
    else collapsedBookmarkFolders.add(folderId);
    await saveBookmarkUiState();
    await renderProfileBookmarks();
    return;
  }

  if (action === "expand-bookmark-folder-preview") {
    const folderId = actionEl.dataset.folderId;
    if (!folderId) return;
    expandedBookmarkFolders.add(folderId);
    collapsedBookmarkFolders.delete(folderId);
    await saveBookmarkUiState();
    await renderProfileBookmarks();
    return;
  }

  if (action === "collapse-bookmarks") {
    if (!hasChromeBookmarksApi()) return;
    const tree = await chrome.bookmarks.getTree();
    const roots = tree?.[0]?.children || [];
    collapsedBookmarkFolders = new Set(collectBookmarkFolderIds(roots));
    await saveBookmarkUiState();
    await renderProfileBookmarks();
    return;
  }

  if (action === "expand-bookmarks") {
    collapsedBookmarkFolders.clear();
    await saveBookmarkUiState();
    await renderProfileBookmarks();
    return;
  }

  if (action === "export-data") {
    await exportTabHomeData();
    return;
  }

  if (action === "import-data") {
    document.getElementById("importDataInput")?.click();
    return;
  }

  if (action === "add-favorite-section") {
    const name = await showPrompt({ message: t("addSectionPrompt") });
    const section = await addFavoriteSection(name);
    if (section) {
      await renderFavoritesColumn();
      await populateFavoriteSectionInput(section.id);
      showToast(t("sectionAdded"));
    }
    return;
  }

  if (action === "delete-favorite-section") {
    const id = actionEl.dataset.sectionId;
    if (!id || id === "default") return;
    const sections = await getFavoriteSections();
    const section = sections.find((s) => s.id === id);
    if (!section) return;
    const favorites = await getFavorites();
    const count = favorites.filter((f) => f.sectionId === id).length;
    const msg =
      count > 0
        ? `Delete section "${section.name}"? Its ${count} favorite(s) will be moved to the default section.`
        : `Delete section "${section.name}"?`;
    const ok = await showConfirm({ message: msg, okLabel: "Delete" });
    if (!ok) return;
    await deleteFavoriteSection(id);
    await renderFavoritesColumn();
    await populateFavoriteSectionInput();
    showToast(`Section "${section.name}" deleted`);
    return;
  }

  if (action === "rename-favorite-section") {
    const id = actionEl.dataset.sectionId;
    const current = (await getFavoriteSections()).find(
      (section) => section.id === id,
    );
    if (!current) return;
    const name = await showPrompt({
      message: t("renameSectionPrompt"),
      defaultValue: current.name,
    });
    if (!name || name.trim() === current.name) return;
    await renameFavoriteSection(id, name);
    await renderFavoritesColumn();
    await populateFavoriteSectionInput(id);
    showToast(t("sectionRenamed"));
    return;
  }

  if (action === "toggle-favorite-section") {
    const id = actionEl.dataset.sectionId;
    await toggleFavoriteSection(id);
    await renderFavoritesColumn();
    return;
  }

  if (action === "move-favorite-section") {
    const id = actionEl.dataset.sectionId;
    const dir = parseInt(actionEl.dataset.dir, 10);
    if (!Number.isNaN(dir)) {
      await moveFavoriteSection(id, dir);
      await renderFavoritesColumn();
      await populateFavoriteSectionInput(id);
    }
    return;
  }

  // ---- Favorites: toggle add modal ----
  if (action === "toggle-favorite-form") {
    const modal = document.getElementById("favoritesModal");
    const btn = document.getElementById("favoritesAddToggle");
    if (!modal) return;
    const showing = modal.style.display !== "none";
    if (showing) {
      resetFavoriteForm();
      modal.style.display = "none";
      if (btn) btn.classList.remove("open");
    } else {
      resetFavoriteForm();
      await populateFavoriteSectionInput(
        actionEl.dataset.sectionId || "default",
      );
      modal.style.display = "flex";
      if (btn) btn.classList.add("open");
      const urlInput = document.getElementById("favoritesUrlInput");
      if (urlInput) setTimeout(() => urlInput.focus(), 0);
    }
    return;
  }

  if (action === "add-favorite-to-section") {
    const modal = document.getElementById("favoritesModal");
    const btn = document.getElementById("favoritesAddToggle");
    if (!modal) return;
    resetFavoriteForm();
    await populateFavoriteSectionInput(actionEl.dataset.sectionId || "default");
    modal.style.display = "flex";
    if (btn) btn.classList.add("open");
    const urlInput = document.getElementById("favoritesUrlInput");
    if (urlInput) setTimeout(() => urlInput.focus(), 0);
    return;
  }

  // ---- Favorites: cancel (close modal) ----
  if (action === "cancel-favorite-form") {
    closeFavoriteModal();
    return;
  }

  // ---- Favorites: delete from edit modal ----
  if (action === "delete-from-form") {
    const form = document.getElementById("favoritesForm");
    const id = form && form.dataset.editingId;
    if (!id) return;
    await removeFavorite(id);
    closeFavoriteModal();
    await renderFavoritesColumn();
    showToast(t("removedFromFavorites"));
    return;
  }

  // ---- Click on modal backdrop closes it ----
  if (e.target.id === "favoritesModal") {
    closeFavoriteModal();
    return;
  }

  // (Favorite cards are real <a href> links — the browser handles
  //  navigation, modifier keys, middle-click, and right-click context
  //  menu natively. No JS click handler needed for plain opens.)

  // ---- Favorites: open the 3-dot menu next to the card (click again to close) ----
  if (action === "favorite-menu") {
    // Stop the parent <a> link from navigating when the menu button is clicked.
    e.preventDefault();
    e.stopPropagation();
    const id = actionEl.dataset.favId;
    if (!id) return;
    const existing = document.getElementById("favoritePopupMenu");
    if (existing && existing.dataset.favId === id) {
      closeFavoriteMenu();
    } else {
      closeFavoriteMenu();
      openFavoriteMenu(actionEl, id);
    }
    return;
  }

  // ---- Menu items ----
  if (action === "menu-edit-favorite") {
    const id = actionEl.dataset.favId;
    closeFavoriteMenu();
    if (id) await openEditFavorite(id);
    return;
  }
  if (action === "menu-remove-favorite") {
    const id = actionEl.dataset.favId;
    closeFavoriteMenu();
    if (id) {
      await removeFavorite(id);
      await renderFavoritesColumn();
      showToast(t("removedFromFavorites"));
    }
    return;
  }

  // ---- Favorites: reset logo to default favicon ----
  if (action === "reset-favorite-logo") {
    pendingLogoDataUrl = null;
    clearCustomLogo = true;

    // Re-derive favicon from current URL input for live preview
    const urlVal = document.getElementById("favoritesUrlInput").value.trim();
    setLogoPreviewForUrl(urlVal);
    return;
  }

  // ---- Favorites: star a tab from a chip ----
  if (action === "favorite-tab") {
    e.stopPropagation();
    const tabUrl = actionEl.dataset.tabUrl;
    if (!tabUrl) return;

    const already = await isFavorited(tabUrl);
    if (already) {
      // Removing is destructive enough to warrant a confirm.
      const ok = await showConfirm({
        message: t("confirmRemoveFav"),
        okLabel: t("remove"),
      });
      if (!ok) return;
      const favs = await getFavorites();
      const fav = favs.find((f) => f.url === tabUrl);
      if (fav) await removeFavorite(fav.id);
      actionEl.classList.remove("active");
      showToast(t("removedFromFavorites"));
    } else {
      // No title — let addFavorite derive a clean brand name from the URL
      // (e.g. "Binance" from www.binance.com).
      const ok = await addFavorite(tabUrl);
      if (ok) {
        actionEl.classList.add("active");
        showToast(t("addedToFavorites"));
      } else {
        showToast(t("alreadyAdded"));
      }
    }
    await renderFavoritesColumn();
    return;
  }

  // ---- Batch mode ----
  if (action === "toggle-batch-mode") {
    if (batchMode) exitBatchMode();
    else enterBatchMode();
    return;
  }

  if (action === "batch-select-tab") {
    e.stopPropagation();
    const url = actionEl.dataset.tabUrl;
    const tabId = parseInt(actionEl.dataset.tabId, 10);
    if (!url) return;
    const chip = actionEl.closest(".page-chip");
    if (batchSelected.has(url)) {
      batchSelected.delete(url);
      if (chip) chip.classList.remove("is-batch-selected");
      actionEl.checked = false;
    } else {
      batchSelected.set(url, tabId);
      if (chip) chip.classList.add("is-batch-selected");
      actionEl.checked = true;
    }
    updateBatchBar();
    return;
  }

  if (action === "batch-close-tabs") {
    if (batchSelected.size === 0) return;
    const ids = [...batchSelected.values()].filter((id) => !Number.isNaN(id));
    if (ids.length > 0) {
      try {
        await chrome.tabs.remove(ids);
      } catch {}
    }
    const n = batchSelected.size;
    exitBatchMode();
    await fetchOpenTabs();
    await renderDashboard();
    showToast(`Closed ${n} tabs`);
    return;
  }

  if (action === "batch-mark-later") {
    for (const url of batchSelected.keys()) tabStatuses[url] = "later";
    await TabHomeStorage.setTabStatuses(tabStatuses);
    exitBatchMode();
    await renderDashboard();
    return;
  }

  if (action === "batch-mark-important") {
    for (const url of batchSelected.keys()) tabStatuses[url] = "important";
    await TabHomeStorage.setTabStatuses(tabStatuses);
    exitBatchMode();
    await renderDashboard();
    return;
  }

  if (action === "batch-add-tasks") {
    const todayKey = toLocalDateKey(new Date());
    let count = 0;
    for (const [url] of batchSelected) {
      const tab = openTabs.find((t) => t.url === url);
      const title = tab ? tab.title || url : url;
      const added = await addDailyTask(title, "Web", todayKey);
      if (added) count++;
    }
    exitBatchMode();
    if (count > 0) showToast(`Added ${count} tasks`);
    return;
  }

  // ---- Sessions: save / restore / delete ----
  if (action === "save-current-session") {
    await saveCurrentSession();
    return;
  }
  if (action === "restore-session") {
    const sessionId = actionEl.dataset.sessionId;
    if (sessionId) await restoreSession(sessionId);
    return;
  }
  if (action === "delete-session") {
    const sessionId = actionEl.dataset.sessionId;
    if (sessionId) await deleteSession(sessionId);
    return;
  }
  if (action === "toggle-session-preview") {
    const card =
      actionEl.closest(".session-row-item") ||
      actionEl.closest(".session-card");
    if (!card) return;
    const preview = card.querySelector(".session-preview");
    if (preview) {
      preview.style.display =
        preview.style.display === "none" ? "block" : "none";
    }
    return;
  }
  if (action === "rename-session") {
    const sessionId = actionEl.dataset.sessionId;
    const session = savedSessions.find((s) => s.id === sessionId);
    if (!session) return;
    const span = actionEl;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "session-rename-input";
    input.value = session.name;
    span.replaceWith(input);
    input.focus();
    input.select();
    const commit = async () => {
      const newName = input.value.trim() || session.name;
      session.name = newName;
      await persistSessions();
      renderSavedSessions();
    };
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        input.blur();
      }
      if (ev.key === "Escape") {
        input.value = session.name;
        input.blur();
      }
    });
    return;
  }

  // ---- Switch tab view: Domain / Status ----
  if (action === "switch-tab-view") {
    const view = actionEl.dataset.view;
    if (!view || view === currentTabView) return;
    currentTabView = view;
    document
      .querySelectorAll("#tabViewToggle .view-toggle-btn")
      .forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.view === view);
      });
    await renderDashboard();
    return;
  }

  const card = actionEl.closest(".mission-card");

  if (action === "toggle-domain-card") {
    e.stopPropagation();
    const domainId = actionEl.dataset.domainId;
    if (!domainId || !card) return;
    card.classList.toggle("is-collapsed");
    const collapsed = card.classList.contains("is-collapsed");
    actionEl.setAttribute("aria-expanded", collapsed ? "false" : "true");
    if (collapsed) collapsedDomainCards.add(domainId);
    else collapsedDomainCards.delete(domainId);
    return;
  }

  if (action === "review-duplicates") {
    const badge = document.querySelector(".chip-dupe-badge");
    if (badge) {
      badge.scrollIntoView({ behavior: "smooth", block: "center" });
      badge.classList.add("attention");
      setTimeout(() => badge.classList.remove("attention"), 1400);
    } else {
      showToast(t("noDupes"));
    }
    return;
  }

  if (action === "close-all-duplicates") {
    const realTabs = getRealTabs();
    const urlCounts = new Map();
    for (const tab of realTabs) {
      if (!tab.url) continue;
      urlCounts.set(tab.url, (urlCounts.get(tab.url) || 0) + 1);
    }
    const dupeUrls = [...urlCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([url]) => url);
    if (dupeUrls.length > 0) {
      await closeDuplicateTabs(dupeUrls, true);
      showToast(`Closed ${duplicateExtrasCount(realTabs)} duplicate tabs`);
      await renderStaticDashboard();
    } else {
      showToast(t("noDupes"));
    }
    return;
  }

  // ---- Expand overflow chips ("+N more") ----
  if (action === "expand-chips") {
    const overflowContainer = actionEl.parentElement.querySelector(
      ".page-chips-overflow",
    );
    if (overflowContainer) {
      overflowContainer.style.display = "contents";
      actionEl.remove();
    }
    return;
  }

  // ---- Focus a specific tab (or toggle selection in batch mode) ----
  if (action === "focus-tab") {
    if (batchMode) {
      const url = actionEl.dataset.tabUrl;
      const tabId = parseInt(actionEl.dataset.tabId, 10);
      const checkbox = actionEl.querySelector(".batch-check");
      if (url) {
        if (batchSelected.has(url)) {
          batchSelected.delete(url);
          actionEl.classList.remove("is-batch-selected");
          if (checkbox) checkbox.checked = false;
        } else {
          batchSelected.set(url, tabId);
          actionEl.classList.add("is-batch-selected");
          if (checkbox) checkbox.checked = true;
        }
        updateBatchBar();
      }
      return;
    }
    const tabId = parseInt(actionEl.dataset.tabId, 10);
    if (!Number.isNaN(tabId)) {
      try {
        const tab = await chrome.tabs.get(tabId);
        await chrome.tabs.update(tabId, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
        return;
      } catch {
        /* tab gone — fall through to URL fallback */
      }
    }
    const tabUrl = actionEl.dataset.tabUrl;
    if (tabUrl) await focusTab(tabUrl);
    return;
  }

  // ---- Close a single tab ----
  if (action === "close-single-tab") {
    e.stopPropagation(); // don't trigger parent chip's focus-tab
    const tabId = parseInt(actionEl.dataset.tabId, 10);
    if (Number.isNaN(tabId)) return;

    // Close THIS exact tab — using its id, not URL (multiple tabs may
    // share the same URL but represent different open windows).
    try {
      await chrome.tabs.remove(tabId);
    } catch {}
    await fetchOpenTabs();

    playCloseSound();

    // Animate the chip row out
    const chip = actionEl.closest(".page-chip");
    if (chip) {
      const rect = chip.getBoundingClientRect();
      shootConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
      chip.style.transition = "opacity 0.2s, transform 0.2s";
      chip.style.opacity = "0";
      chip.style.transform = "scale(0.8)";
      setTimeout(() => {
        chip.remove();
        // If the card now has no tabs, remove it too
        const parentCard = document.querySelector(
          ".mission-card:has(.mission-pages:empty)",
        );
        if (parentCard) animateCardOut(parentCard);
        document.querySelectorAll(".mission-card").forEach((c) => {
          if (
            c.querySelectorAll('.page-chip[data-action="focus-tab"]').length ===
            0
          ) {
            animateCardOut(c);
          }
        });
      }, 200);
    }

    // Update footer
    const statTabs = document.getElementById("statTabs");
    if (statTabs) statTabs.textContent = openTabs.length;

    showToast(t("tabClosed"));
    return;
  }

  // ---- Add tab as a Daily Planner task ----
  if (action === "add-tab-to-task") {
    e.stopPropagation();
    const title = actionEl.dataset.tabTitle;
    const url = actionEl.dataset.tabUrl;
    if (!title && !url) return;
    const taskTitle = title || url;
    const todayKey = toLocalDateKey(new Date());
    const added = await addDailyTask(taskTitle, "Web", todayKey);
    if (added) showToast(t("todoAdded"));
    return;
  }

  // ---- Mark tab as Later / Important (toggle) ----
  if (action === "mark-tab-later" || action === "mark-tab-important") {
    e.stopPropagation();
    const url = actionEl.dataset.tabUrl;
    if (!url) return;
    const key = action === "mark-tab-later" ? "later" : "important";
    if (tabStatuses[url] === key) {
      delete tabStatuses[url];
    } else {
      tabStatuses[url] = key;
    }
    await TabHomeStorage.setTabStatuses(tabStatuses);
    await renderDashboard();
    return;
  }

  // ---- Pin / unpin a single tab in Chrome (use exact tab id, not URL) ----
  if (action === "pin-tab") {
    e.stopPropagation();
    const tabId = parseInt(actionEl.dataset.tabId, 10);
    if (Number.isNaN(tabId)) return;
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      return;
    }
    const newPinned = !tab.pinned;
    await chrome.tabs.update(tabId, { pinned: newPinned });
    // Optimistic UI: flip the active class + tooltip. CSS handles the fill.
    // The live re-render listener will refresh the cards in full right after.
    actionEl.classList.toggle("active", newPinned);
    actionEl.title = newPinned ? t("unpinTip") : t("pinTip");
    return;
  }

  // ---- Close all tabs in a domain group ----
  if (action === "close-domain-tabs") {
    const domainId = actionEl.dataset.domainId;
    // Search the right group list based on which sub-section the X is in.
    const inPinned = !!actionEl.closest("#pinnedSubSection");
    const sourceList = inPinned ? pinnedDomainGroups : domainGroups;
    const group = sourceList.find(
      (g) => "domain-" + g.domain.replace(/[^a-z0-9]/g, "-") === domainId,
    );
    if (!group) return;

    // Close exactly THIS group's tabs by id — robust against same-URL tabs
    // existing in the other section (pinned/unpinned).
    const tabIds = group.tabs.map((t) => t.id).filter(Boolean);
    if (tabIds.length > 0) {
      try {
        await chrome.tabs.remove(tabIds);
      } catch {}
      await fetchOpenTabs();
    }

    if (card) {
      playCloseSound();
      animateCardOut(card);
    }

    // Remove from in-memory groups
    const idx = sourceList.indexOf(group);
    if (idx !== -1) sourceList.splice(idx, 1);

    const groupLabel =
      group.domain === "__landing-pages__"
        ? t("homepages")
        : group.label || friendlyDomain(group.domain);
    showToast(t("closedNFromX", tabIds.length, groupLabel));

    const statTabs = document.getElementById("statTabs");
    if (statTabs) statTabs.textContent = openTabs.length;
    return;
  }

  // ---- Close duplicates of THIS specific URL (the inline chip badge) ----
  // Scoped to the same pin-state as the source chip — pinned and unpinned
  // sections are dedup'd separately, so a pinned tab is never used as the
  // "keep" for the unpinned section's dedup.
  if (action === "dedup-this-url") {
    e.stopPropagation();
    e.preventDefault();
    const url = actionEl.dataset.tabUrl;
    const chip = actionEl.closest(".page-chip");
    const chipId = chip ? parseInt(chip.dataset.tabId, 10) : NaN;
    if (!url) return;

    const allTabs = await chrome.tabs.query({});
    const sourceTab = !Number.isNaN(chipId)
      ? allTabs.find((t) => t.id === chipId)
      : null;
    const wantPinned = sourceTab ? !!sourceTab.pinned : false;
    const matching = allTabs.filter(
      (t) => t.url === url && !!t.pinned === wantPinned,
    );
    if (matching.length <= 1) return;

    // Keep the active match if any, else the first; close the rest.
    const keep = matching.find((t) => t.active) || matching[0];
    const toClose = matching.filter((t) => t.id !== keep.id).map((t) => t.id);
    if (toClose.length > 0) await chrome.tabs.remove(toClose);
    await fetchOpenTabs();

    playCloseSound();
    // Fade out the badge — live re-render listener will refresh the card.
    actionEl.style.transition = "opacity 0.2s";
    actionEl.style.opacity = "0";
    setTimeout(() => actionEl.remove(), 200);
    showToast(t("closedDupes"));
    return;
  }

  // ---- Close ALL open tabs ----
  if (action === "close-all-open-tabs") {
    const allUrls = getRealTabs()
      .filter((t) => !t.pinned)
      .map((t) => t.url);
    await closeTabsByUrls(allUrls);
    playCloseSound();

    document
      .querySelectorAll("#openTabsMissions .mission-card")
      .forEach((c) => {
        shootConfetti(
          c.getBoundingClientRect().left + c.offsetWidth / 2,
          c.getBoundingClientRect().top + c.offsetHeight / 2,
        );
        animateCardOut(c);
      });

    showToast(t("allTabsClosed"));
    return;
  }
});

document.addEventListener("dblclick", (e) => {
  if (e.target.closest("#heroTitle")) {
    beginHeroTitleEdit();
    return;
  }
  if (e.target.closest("#heroCopy")) {
    beginHeroCopyEdit();
  }
});

document.addEventListener("keydown", async (e) => {
  const titleEl = e.target.closest && e.target.closest("#heroTitle");
  if (titleEl && titleEl.isContentEditable) {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelHeroTitleEdit(titleEl);
      titleEl.blur();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      await saveHeroTitleEdit(titleEl);
      titleEl.blur();
      return;
    }
  }

  const el = e.target.closest && e.target.closest("#heroCopy");
  if (!el || !el.isContentEditable) return;

  if (e.key === "Escape") {
    e.preventDefault();
    cancelHeroCopyEdit(el);
    el.blur();
    return;
  }

  if (e.key === "Enter") {
    e.preventDefault();
    await saveHeroCopyEdit(el);
    el.blur();
  }
});

document.addEventListener("focusout", async (e) => {
  const titleEl = e.target.closest && e.target.closest("#heroTitle");
  if (titleEl && titleEl.isContentEditable) {
    await saveHeroTitleEdit(titleEl);
    return;
  }

  const el = e.target.closest && e.target.closest("#heroCopy");
  if (!el || !el.isContentEditable) return;
  await saveHeroCopyEdit(el);
});

/* ----------------------------------------------------------------
   FAVORITES FORM — shared state for add/edit mode

   pendingLogoDataUrl:
     - null   = no new logo uploaded this session (keep current value on save)
     - string = data URL the user just picked, save as customLogo

   clearCustomLogo:
     - true   = user clicked "Reset", remove customLogo on save (revert to favicon)
     - false  = leave customLogo alone
   ---------------------------------------------------------------- */
let pendingLogoDataUrl = null;
let clearCustomLogo = false;

function setLogoPreview(src, fallbackList = []) {
  const placeholder = document.getElementById("favoritesLogoPlaceholder");
  const img = document.getElementById("favoritesLogoPreviewImg");
  if (!img || !placeholder) return;
  if (src) {
    img.dataset.fallback = fallbackList.join("|");
    img.src = src;
    img.style.display = "block";
    placeholder.style.display = "none";
  } else {
    img.removeAttribute("src");
    delete img.dataset.fallback;
    img.style.display = "none";
    placeholder.style.display = "block";
  }
}

/**
 * Set the logo preview using the same fallback chain as favorite cards.
 * Customizable: pass a customLogo data URL to skip the chain entirely.
 */
function setLogoPreviewForUrl(pageUrl, customLogo = null) {
  if (customLogo) {
    setLogoPreview(customLogo);
    return;
  }
  const chain = getFaviconFallbackChain(pageUrl, 128);
  if (chain.length === 0) {
    setLogoPreview("");
    return;
  }
  setLogoPreview(chain[0], chain.slice(1));
}

async function populateFavoriteSectionInput(selectedId = "default") {
  const select = document.getElementById("favoritesSectionInput");
  if (!select) return;
  const sections = await getFavoriteSections();
  select.innerHTML = sections
    .sort((a, b) => a.order - b.order)
    .map((section) => {
      const safeName = escapeHtml(section.name);
      const selected = section.id === selectedId ? " selected" : "";
      return `<option value="${section.id}"${selected}>${safeName}</option>`;
    })
    .join("");
}

function resetFavoriteForm() {
  const form = document.getElementById("favoritesForm");
  if (!form) return;
  form.dataset.editingId = "";
  document.getElementById("favoritesUrlInput").value = "";
  document.getElementById("favoritesTitleInput").value = "";
  document.getElementById("favoritesLogoInput").value = "";
  document.getElementById("favoritesFormSubmit").textContent = t("add");
  const sectionInput = document.getElementById("favoritesSectionInput");
  if (sectionInput) sectionInput.value = "default";
  const delBtn = document.getElementById("favoritesFormDelete");
  if (delBtn) delBtn.style.display = "none";
  setLogoPreview("");
  pendingLogoDataUrl = null;
  clearCustomLogo = false;
}

function closeFavoriteModal() {
  const modal = document.getElementById("favoritesModal");
  const btn = document.getElementById("favoritesAddToggle");
  resetFavoriteForm();
  if (modal) modal.style.display = "none";
  if (btn) btn.classList.remove("open");
}

/**
 * showConfirm({ message, okLabel?, cancelLabel? })
 * Returns Promise<boolean> — resolves true on confirm, false on cancel /
 * Esc / backdrop click. In-page modal styled to match the rest of the app.
 */
function showConfirm({ message, okLabel, cancelLabel } = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById("confirmModal");
    const msgEl = document.getElementById("confirmMessage");
    const okBtn = document.getElementById("confirmOkBtn");
    const cancelBtn = document.getElementById("confirmCancelBtn");
    if (!modal || !msgEl || !okBtn || !cancelBtn) {
      resolve(window.confirm(message || ""));
      return;
    }

    msgEl.textContent = message || "";
    okBtn.textContent = okLabel || t("confirmOk");
    cancelBtn.textContent = cancelLabel || t("cancel");
    modal.style.display = "flex";

    const cleanup = () => {
      modal.style.display = "none";
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey, true);
    };
    const onOk = () => {
      cleanup();
      resolve(true);
    };
    const onCancel = () => {
      cleanup();
      resolve(false);
    };
    const onBackdrop = (e) => {
      if (e.target === modal) onCancel();
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      } else if (e.key === "Enter") {
        e.stopPropagation();
        onOk();
      }
    };

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey, true);

    // Default focus the safer choice (cancel)
    setTimeout(() => cancelBtn.focus(), 0);
  });
}

/**
 * showPrompt({ message, defaultValue?, okLabel?, cancelLabel? })
 * Returns Promise<string|null> — resolves the entered string on confirm,
 * null on cancel / Esc / backdrop click.
 * In-page alternative to window.prompt().
 */
function showPrompt({ message, defaultValue = "", okLabel, cancelLabel } = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById("promptModal");
    const msgEl = document.getElementById("promptMessage");
    const input = document.getElementById("promptInput");
    const okBtn = document.getElementById("promptOkBtn");
    const cancelBtn = document.getElementById("promptCancelBtn");
    if (!modal || !msgEl || !input || !okBtn || !cancelBtn) {
      resolve(window.prompt(message || "", defaultValue));
      return;
    }

    msgEl.textContent = message || "";
    input.value = defaultValue || "";
    okBtn.textContent = okLabel || t("confirmOk");
    cancelBtn.textContent = cancelLabel || t("cancel");
    modal.style.display = "flex";

    const cleanup = () => {
      modal.style.display = "none";
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey, true);
    };
    const onOk = () => {
      cleanup();
      resolve(input.value);
    };
    const onCancel = () => {
      cleanup();
      resolve(null);
    };
    const onBackdrop = (e) => {
      if (e.target === modal) onCancel();
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      } else if (e.key === "Enter") {
        e.stopPropagation();
        onOk();
      }
    };

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey, true);

    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  });
}

async function openEditFavorite(id) {
  const favs = await getFavorites();
  const fav = favs.find((f) => f.id === id);
  if (!fav) return;
  document.getElementById("favoritesUrlInput").value = fav.url || "";
  document.getElementById("favoritesTitleInput").value = fav.title || "";
  await populateFavoriteSectionInput(fav.sectionId || "default");
  setLogoPreviewForUrl(fav.url, fav.customLogo);
  pendingLogoDataUrl = null;
  clearCustomLogo = false;
  const form = document.getElementById("favoritesForm");
  const modal = document.getElementById("favoritesModal");
  form.dataset.editingId = id;
  if (modal) modal.style.display = "flex";
  document.getElementById("favoritesAddToggle").classList.add("open");
  document.getElementById("favoritesFormSubmit").textContent = t("save");
  const delBtn = document.getElementById("favoritesFormDelete");
  if (delBtn) delBtn.style.display = "inline-flex";
}

function openFavoriteMenu(anchorEl, favId) {
  const menu = document.createElement("div");
  menu.id = "favoritePopupMenu";
  menu.className = "favorite-popup-menu";
  menu.dataset.favId = favId;
  menu.innerHTML = `
    <button class="favorite-popup-item" data-action="menu-edit-favorite"   data-fav-id="${favId}">${t("edit")}</button>
    <button class="favorite-popup-item favorite-popup-item-danger" data-action="menu-remove-favorite" data-fav-id="${favId}">${t("remove")}</button>
  `;
  document.body.appendChild(menu);

  // Position below-and-aligned-right with the anchor; clamp to viewport.
  const r = anchorEl.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  let top = r.bottom + 4;
  let left = r.right - m.width;
  if (top + m.height > window.innerHeight - 4) top = r.top - m.height - 4;
  if (left < 4) left = 4;
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}

function closeFavoriteMenu() {
  const menu = document.getElementById("favoritePopupMenu");
  if (menu) menu.remove();
}

// Click outside the menu closes it.
document.addEventListener("click", (e) => {
  if (!document.getElementById("favoritePopupMenu")) return;
  if (e.target.closest("#favoritePopupMenu")) return;
  if (e.target.closest('[data-action="favorite-menu"]')) return;
  closeFavoriteMenu();
});

// Escape closes whichever overlay is open.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const modal = document.getElementById("favoritesModal");
  if (modal && modal.style.display !== "none") {
    closeFavoriteModal();
    return;
  }
  closeFavoriteMenu();
});

/**
 * Downscale an image blob to fit within `maxSize × maxSize` using a canvas,
 * exporting as a PNG data URL. Preserves transparency. Never upscales —
 * a 100×100 image stays 100×100. Output is typically a few KB regardless
 * of input size, which is what keeps chrome.storage.local from filling up.
 */
function compressImage(blob, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;
      if (!srcW || !srcH) {
        reject(new Error("zero-size image"));
        return;
      }
      const ratio = Math.min(maxSize / srcW, maxSize / srcH, 1);
      const w = Math.max(1, Math.round(srcW * ratio));
      const h = Math.max(1, Math.round(srcH * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

/**
 * Stage an image blob as the favorite's custom logo. Used by both the
 * file picker and the clipboard-paste path. Auto-compresses to ≤256×256
 * so storage stays small no matter how big the original image is.
 */
async function stageCustomLogoFromBlob(blob) {
  if (!blob || !blob.type || !blob.type.startsWith("image/")) return;
  try {
    const dataUrl = await compressImage(blob, 256);
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return;
    pendingLogoDataUrl = dataUrl;
    clearCustomLogo = false;
    setLogoPreview(dataUrl);
  } catch (err) {
    console.warn("[wolfy] image compress failed:", err);
  }
}

async function stageProfileImageFromBlob(blob) {
  if (!blob || !blob.type || !blob.type.startsWith("image/")) return;
  try {
    const dataUrl = await compressImage(blob, 256);
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return;
    await setProfileImageDataUrl(dataUrl);
    await paintProfileImage();
    showToast(t("profileUpdated"));
  } catch (err) {
    console.warn("[wolfy] profile image compress failed:", err);
  }
}

// ---- Logo file picker — read as base64 data URL, show in preview ----
document.addEventListener("change", (e) => {
  if (
    e.target.id !== "favoritesLogoInput" &&
    e.target.id !== "profileImageInput" &&
    e.target.id !== "importDataInput"
  )
    return;
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (e.target.id === "importDataInput") {
    importTabHomeDataFromFile(file).finally(() => {
      e.target.value = "";
    });
    return;
  }
  if (e.target.id === "profileImageInput") {
    stageProfileImageFromBlob(file);
    return;
  }
  stageCustomLogoFromBlob(file);
});

// ---- Paste an image from the clipboard while the favorites modal is open.
//      Works whether focus is on the URL/title input, on the form itself,
//      or just on the modal — anywhere inside.
document.addEventListener("paste", async (e) => {
  const modal = document.getElementById("favoritesModal");
  if (!modal || modal.style.display === "none") return;
  const items = (e.clipboardData && e.clipboardData.items) || [];
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (!file) continue;
      e.preventDefault();
      await stageCustomLogoFromBlob(file);
      return;
    }
  }
});

// ---- Live preview update: when URL field changes and no custom logo
//      is staged, pull a favicon for the new domain so the preview tracks
//      what the saved card will look like. ----
document.addEventListener("input", (e) => {
  if (e.target.id !== "favoritesUrlInput") return;
  if (pendingLogoDataUrl) return; // user staged an upload — leave it alone
  const form = document.getElementById("favoritesForm");
  // While editing, only auto-update the preview if user clicked Reset
  // (otherwise we'd clobber their existing custom logo on every keystroke)
  if (form.dataset.editingId && !clearCustomLogo) return;
  const url = e.target.value.trim();
  setLogoPreviewForUrl(url);
});

const SEARCH_HISTORY_KEY = "commandBarSearchHistory";
const SEARCH_HISTORY_MAX = 10;

async function saveSearchQuery(query) {
  const q = (query || "").trim();
  if (!q) return;
  try {
    const data = await chrome.storage.local.get(SEARCH_HISTORY_KEY);
    let hist = Array.isArray(data[SEARCH_HISTORY_KEY])
      ? data[SEARCH_HISTORY_KEY]
      : [];
    hist = hist.filter((h) => h !== q);
    hist.unshift(q);
    if (hist.length > SEARCH_HISTORY_MAX) hist.length = SEARCH_HISTORY_MAX;
    await chrome.storage.local.set({ [SEARCH_HISTORY_KEY]: hist });
  } catch {
    /* ignore */
  }
}

async function loadSearchHistory() {
  try {
    const data = await chrome.storage.local.get(SEARCH_HISTORY_KEY);
    return Array.isArray(data[SEARCH_HISTORY_KEY])
      ? data[SEARCH_HISTORY_KEY]
      : [];
  } catch {
    return [];
  }
}

function commandTargetFromInput(value) {
  const query = (value || "").trim();
  if (!query) return "";
  if (/^(javascript|data|vbscript):/i.test(query)) {
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(query)) return query;
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/.*)?$/i.test(query)) {
    return `http://${query}`;
  }
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/i.test(query)) {
    return `https://${query}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/* ----------------------------------------------------------------
   COMMAND BAR — Google Search Autocomplete
   ---------------------------------------------------------------- */
(function initSearchSuggestions() {
  const input = document.getElementById("commandInput");
  const box = document.getElementById("searchSuggestions");
  if (!input || !box) return;

  const ICON_SEARCH = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/></svg>`;
  const ICON_HISTORY = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>`;
  const ICON_TAB = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg>`;

  let debounceTimer;
  let blurTimer;
  let activeIndex = -1;
  // Each item: { text, url?, icon }
  let currentItems = [];

  function renderSuggestionItem(item, i) {
    const icon = item.icon || ICON_SEARCH;
    const label = escapeHtml(item.text);
    const subtitle = item.subtitle
      ? `<span class="suggestion-sub">${escapeHtml(item.subtitle)}</span>`
      : "";
    return (
      `<div class="suggestion-item" data-index="${i}">` +
      `<span class="suggestion-icon">${icon}</span>` +
      `<span class="suggestion-text">${label}${subtitle}</span>` +
      `</div>`
    );
  }

  function openSuggestions(items) {
    currentItems = items;
    activeIndex = -1;
    if (!items.length) {
      closeSuggestions();
      return;
    }
    box.innerHTML = items.map(renderSuggestionItem).join("");
    box.classList.add("is-open");
  }

  function closeSuggestions() {
    box.classList.remove("is-open");
    box.innerHTML = "";
    activeIndex = -1;
    currentItems = [];
  }

  function setActive(idx) {
    const items = box.querySelectorAll(".suggestion-item");
    items.forEach((el) => el.classList.remove("is-active"));
    if (idx >= 0 && idx < items.length) {
      items[idx].classList.add("is-active");
      activeIndex = idx;
    } else {
      activeIndex = -1;
    }
  }

  function navigateToItem(item) {
    closeSuggestions();
    if (item.url) {
      chrome.tabs.create({ url: item.url });
    } else {
      // Search query — save to history then go to Google
      saveSearchQuery(item.text);
      chrome.tabs.create({
        url: `https://www.google.com/search?q=${encodeURIComponent(item.text)}`,
      });
    }
  }

  /** Show recent search queries when input is empty (like Google) */
  async function getQuickSuggestions() {
    const history = await loadSearchHistory();
    return history.map((q) => ({ text: q, icon: ICON_HISTORY }));
  }

  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearTimeout(debounceTimer);
    if (!q) {
      // Show quick suggestions (history + tabs) when input is cleared
      getQuickSuggestions()
        .then(openSuggestions)
        .catch(() => {});
      return;
    }
    debounceTimer = setTimeout(async () => {
      try {
        const resp = await chrome.runtime.sendMessage({
          type: "fetch-suggestions",
          query: q,
        });
        if (input.value.trim() === q) {
          const items = (resp.suggestions || []).map((s) => ({
            text: s,
            icon: ICON_SEARCH,
          }));
          openSuggestions(items);
        }
      } catch {
        /* ignore */
      }
    }, 180);
  });

  input.addEventListener("keydown", (e) => {
    if (!box.classList.contains("is-open")) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(activeIndex + 1, currentItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, -1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
      navigateToItem(currentItems[activeIndex]);
    } else if (e.key === "Escape") {
      closeSuggestions();
    }
  });

  input.addEventListener("focus", () => {
    // Cancel any pending blur-close so re-focus keeps suggestions alive
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = null;
    }
    const q = input.value.trim();
    if (!q) {
      // Empty input → show quick suggestions (history + open tabs)
      getQuickSuggestions()
        .then(openSuggestions)
        .catch(() => {});
      return;
    }
    // Has text → re-fetch Google suggestions
    chrome.runtime
      .sendMessage({ type: "fetch-suggestions", query: q })
      .then((resp) => {
        if (input.value.trim() === q) {
          const items = (resp.suggestions || []).map((s) => ({
            text: s,
            icon: ICON_SEARCH,
          }));
          openSuggestions(items);
        }
      })
      .catch(() => {});
  });

  input.addEventListener("blur", () => {
    blurTimer = setTimeout(() => {
      blurTimer = null;
      closeSuggestions();
    }, 180);
  });

  box.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".suggestion-item");
    if (!item) return;
    e.preventDefault();
    navigateToItem(currentItems[Number(item.dataset.index)]);
  });
})();

document.addEventListener("submit", (e) => {
  if (e.target.id !== "commandForm") return;
  e.preventDefault();
  const input = document.getElementById("commandInput");
  const q = ((input && input.value) || "").trim();
  const target = commandTargetFromInput(q);
  if (target) {
    // Save search query to history (only for non-URL searches)
    if (
      q &&
      !(
        /^[a-z][a-z0-9+.-]*:/i.test(q) ||
        /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/i.test(q)
      )
    ) {
      saveSearchQuery(q);
    }
    chrome.tabs.create({ url: target });
  }
});

document.addEventListener("submit", async (e) => {
  if (e.target.id !== "selectedDayTodoForm") return;
  e.preventDefault();
  const input = document.getElementById("selectedDayTodoInput");
  const tagInput = document.getElementById("selectedDayTodoTagInput");
  const repeatInput = document.getElementById("selectedDayTodoRepeatInput");
  const title = input && input.value;
  const tag = tagInput && tagInput.value;
  const repeat = repeatInput ? repeatInput.value : "";

  if (!repeat) {
    const ok = await addDailyTask(title, tag, selectedPlannerDate);
    if (!ok) return;
    input.value = "";
    input.focus();
    showToast(t("todoAdded"));
    return;
  }

  // Generate repeating tasks from selected date up to planner max
  const startDate = parseLocalDateKey(selectedPlannerDate);
  const maxKey = getPlannerMaxDateKey();
  const groupId = makeId("rg");
  let count = 0;
  const cursor = new Date(startDate);
  while (toLocalDateKey(cursor) <= maxKey) {
    const dateKey = toLocalDateKey(cursor);
    const dayOfWeek = cursor.getDay(); // 0=Sun, 6=Sat
    let shouldAdd = false;
    if (repeat === "daily") shouldAdd = true;
    else if (repeat === "weekdays")
      shouldAdd = dayOfWeek >= 1 && dayOfWeek <= 5;
    else if (repeat === "weekly") shouldAdd = true;

    if (shouldAdd && isDateInPlannerRange(dateKey)) {
      const ok = await addDailyTask(title, tag, dateKey, {
        repeatGroupId: groupId,
        skipRender: true,
      });
      if (ok) count++;
    }
    cursor.setDate(cursor.getDate() + (repeat === "weekly" ? 7 : 1));
  }

  if (count > 0) {
    await persistDailyTasks();
    renderDailyPlanner();
    input.value = "";
    if (repeatInput) repeatInput.value = "";
    input.focus();
    showToast(`Added ${count} recurring tasks`);
  }
});

// ---- Favorites form submission (handles both add and edit) ----
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "favoritesForm") return;
  e.preventDefault();

  const form = e.target;
  const editingId = form.dataset.editingId || "";
  const urlInput = document.getElementById("favoritesUrlInput");
  const titleInput = document.getElementById("favoritesTitleInput");
  const sectionInput = document.getElementById("favoritesSectionInput");
  const sectionId = (sectionInput && sectionInput.value) || "default";
  let url = urlInput.value.trim();
  let title = titleInput.value.trim();
  if (!url) return;

  // Auto-prepend https:// if the user typed a bare domain (e.g. "binance.com").
  // Without this we'd save invalid-looking URLs that later fail to navigate.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    url = "https://" + url;
  }

  if (/^(javascript|data|vbscript):/i.test(url)) {
    showToast(t("unsafeUrl"));
    return;
  }

  if (!title) {
    try {
      title = friendlyDomain(new URL(url).hostname);
    } catch {
      title = url;
    }
  }

  try {
    if (editingId) {
      const fields = { url, title };
      if (pendingLogoDataUrl) fields.customLogo = pendingLogoDataUrl;
      else if (clearCustomLogo) fields.customLogo = null; // null sentinel → delete
      await updateFavorite(editingId, fields);
      await updateFavoriteSection(editingId, sectionId);
      showToast(t("favoriteUpdated"));
    } else {
      const ok = await addFavorite(url, title, pendingLogoDataUrl, sectionId);
      if (!ok) {
        showToast(t("alreadyAdded"));
        return;
      }
      showToast(t("addedToFavorites"));
    }
  } catch (err) {
    // Most likely cause: chrome.storage.local quota exceeded.
    console.error("[wolfy] save favorite failed:", err);
    showToast(t("saveFailed"));
    return;
  }

  closeFavoriteModal();

  await renderFavoritesColumn();
  document
    .querySelectorAll(
      `.chip-star[data-tab-url="${url.replace(/"/g, "&quot;")}"]`,
    )
    .forEach((b) => b.classList.add("active"));
});

/* ----------------------------------------------------------------
   FAVORITES DRAG-AND-DROP — pointer-event-based reorder.

   Uses mousedown/mousemove/mouseup instead of HTML5 drag-and-drop to
   work around Chrome's broken native drag inside overflow:auto containers.

   Scope: strictly limited to the favorites column.
   Drop targets:
     - another card        → swap slots
     - empty slot          → place there
     - anywhere else       → no-op
   ---------------------------------------------------------------- */
let _dragState = null; // { id, el, startX, startY, started }
let _suppressNextClick = false;
const DRAG_THRESHOLD = 5; // px before committing to drag

function clearDropMarkers() {
  document
    .querySelectorAll(
      ".favorite-item.drop-target, .favorite-slot-empty.drop-target",
    )
    .forEach((el) => el.classList.remove("drop-target"));
}

function getDropTarget(x, y, draggedId) {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    const card = el.closest(".favorite-item");
    if (card && card.dataset.favId && card.dataset.favId !== draggedId) {
      return { type: "card", el: card };
    }
    const slot = el.closest(".favorite-slot-empty");
    if (slot) return { type: "slot", el: slot };
  }
  return null;
}

document.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  const item = e.target.closest(".favorite-item");
  if (!item) return;
  if (e.target.closest(".favorite-menu")) return;
  _dragState = {
    id: item.dataset.favId,
    el: item,
    startX: e.clientX,
    startY: e.clientY,
    started: false,
  };
});

document.addEventListener("mousemove", (e) => {
  if (!_dragState) return;
  const dx = e.clientX - _dragState.startX;
  const dy = e.clientY - _dragState.startY;

  if (!_dragState.started) {
    if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
    _dragState.started = true;
    _dragState.el.classList.add("dragging");
    document.body.classList.add("dragging-favorite");
  }

  clearDropMarkers();
  const target = getDropTarget(e.clientX, e.clientY, _dragState.id);
  if (target) target.el.classList.add("drop-target");
});

document.addEventListener("mouseup", async (e) => {
  if (!_dragState) return;
  const { id: draggedId, started } = _dragState;
  _dragState = null;

  if (!started) return; // was a click, not a drag

  _suppressNextClick = true;

  // Capture target BEFORE removing dragging class (which changes body class)
  const target = getDropTarget(e.clientX, e.clientY, draggedId);
  console.log(
    "[drag] mouseup — draggedId:",
    draggedId,
    "target:",
    target?.type,
    target?.el?.dataset,
  );

  document
    .querySelectorAll(".favorite-item.dragging")
    .forEach((el) => el.classList.remove("dragging"));
  document.body.classList.remove("dragging-favorite");
  clearDropMarkers();

  if (!target) return;

  if (target.type === "card") {
    const favorites = await getFavorites();
    const a = favorites.find((f) => f.id === draggedId);
    const b = favorites.find((f) => f.id === target.el.dataset.favId);
    if (a && b) {
      // Swap: exchange section + slot between a and b
      const aSec = a.sectionId || "default";
      const bSec = b.sectionId || "default";
      const aSlot =
        typeof a.sectionSlot === "number" ? a.sectionSlot : a.slot || 0;
      const bSlot =
        typeof b.sectionSlot === "number" ? b.sectionSlot : b.slot || 0;
      a.sectionId = bSec;
      a.sectionSlot = bSlot;
      a.slot = bSlot;
      b.sectionId = aSec;
      b.sectionSlot = aSlot;
      b.slot = aSlot;
      // Normalize both affected sections to contiguous 0..n-1
      normalizeSectionSlots(favorites, aSec);
      if (bSec !== aSec) normalizeSectionSlots(favorites, bSec);
      await setFavorites(favorites);
      await renderFavoritesColumn();
    }
    return;
  }

  if (target.type === "slot") {
    const sectionId = target.el.dataset.sectionId || "default";
    const favorites = await getFavorites();
    const fav = favorites.find((f) => f.id === draggedId);
    if (fav) {
      const oldSec = fav.sectionId || "default";
      // Move to end of target section
      const sectionItems = favorites.filter(
        (f) => f.id !== draggedId && (f.sectionId || "default") === sectionId,
      );
      fav.sectionId = sectionId;
      fav.sectionSlot = sectionItems.length;
      fav.slot = sectionItems.length;
      // Normalize both sections
      normalizeSectionSlots(favorites, oldSec);
      normalizeSectionSlots(favorites, sectionId);
      await setFavorites(favorites);
      await renderFavoritesColumn();
    }
  }
});

/** Re-index all items in a section to contiguous 0..n-1 slots. */
function normalizeSectionSlots(favorites, sectionId) {
  const items = favorites
    .filter((f) => (f.sectionId || "default") === sectionId)
    .sort((a, b) => {
      const aS =
        typeof a.sectionSlot === "number" ? a.sectionSlot : a.slot || 0;
      const bS =
        typeof b.sectionSlot === "number" ? b.sectionSlot : b.slot || 0;
      return aS - bS;
    });
  items.forEach((item, i) => {
    item.sectionSlot = i;
    item.slot = i;
  });
}

/* Navigate to a favorite when its card is clicked (now <div> instead of <a>
   to avoid Chrome's broken drag-and-drop for <a> in scrollable containers). */
document.addEventListener("click", (e) => {
  const item = e.target.closest(".favorite-item");
  if (!item) return;
  // Don't navigate if clicking the 3-dot menu button
  if (e.target.closest(".favorite-menu")) return;
  // Don't navigate if we just finished a drag
  if (_suppressNextClick) {
    _suppressNextClick = false;
    return;
  }
  const url = item.dataset.favUrl;
  if (url) {
    chrome.tabs.create({ url });
  }
});

/* ----------------------------------------------------------------
   LIVE UPDATES — re-render whenever Chrome's tab state changes

   Without this, opening a favorite (or any tab change in another window)
   wouldn't show up here until the user manually refreshed the page.
   Debounced so a burst of events triggers exactly one re-render.
   ---------------------------------------------------------------- */
let _rerenderTimer = null;
function scheduleLiveRerender() {
  if (_rerenderTimer) clearTimeout(_rerenderTimer);
  _rerenderTimer = setTimeout(() => {
    _rerenderTimer = null;
    // Skip re-render while the command bar is focused — avoids layout shifts
    // that close the search suggestions dropdown mid-typing.
    const cmdInput = document.getElementById("commandInput");
    if (cmdInput && document.activeElement === cmdInput) {
      // Retry after a short delay; the user may still be typing.
      scheduleLiveRerender();
      return;
    }
    renderDashboard();
  }, 150);
}

if (chrome.tabs && chrome.tabs.onCreated) {
  chrome.tabs.onCreated.addListener(scheduleLiveRerender);
  chrome.tabs.onRemoved.addListener(scheduleLiveRerender);
  chrome.tabs.onUpdated.addListener((_id, changeInfo) => {
    // Re-render only on URL/title/pin changes; skip per-keystroke status flips
    if (changeInfo.url || changeInfo.title || "pinned" in changeInfo) {
      scheduleLiveRerender();
    }
  });
  chrome.tabs.onMoved.addListener(scheduleLiveRerender);
  // Switching tabs updates lastAccessed → re-sort by recency
  if (chrome.tabs.onActivated)
    chrome.tabs.onActivated.addListener(scheduleLiveRerender);
}

// Storage changes can come from another context (e.g. right-click menu in
// background.js adds a favorite) — re-render so the page stays current.
if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === "local") {
      if (
        (changes.favorites || changes.favoriteSections) &&
        !_suppressFavReRender
      ) {
        renderFavoritesColumn();
        populateFavoriteSectionInput();
      }
      if (changes.dailyTasks) {
        if (_taskDragReorder) {
          _taskDragReorder = false;
        } else {
          dailyTasks = sortDailyTasks(await TabHomeStorage.getDailyTasks());
          await pruneExpiredDailyTasks();
          renderDailyPlanner();
        }
      }
      if (changes.heroTitle) {
        const heroTitle = document.getElementById("heroTitle");
        if (!heroTitle || !heroTitle.isContentEditable) paintHeroTitle();
      }
      if (changes.heroCopy) {
        const heroCopy = document.getElementById("heroCopy");
        if (!heroCopy || !heroCopy.isContentEditable) paintHeroCopy();
      }
      if (changes.profileImageDataUrl) paintProfileImage();
      return;
    }
  });
}

/* ----------------------------------------------------------------
   INITIALIZE
   ---------------------------------------------------------------- */
(async () => {
  await TabHomeStorage.cleanupLegacySyncData();
  await loadLang();
  await loadTheme();
  await migrateAwayFromFolders();
  await migrateFavoritesToSections();
  await loadDailyTasks();
  applyStaticI18n();
  await paintHeroTitle();
  await paintHeroCopy();
  await populateFavoriteSectionInput();
  await paintProfileImage();
  paintTopbarTime();
  // Align the tick to the next exact minute boundary so the displayed time
  // never lags behind the system clock by more than ~50 ms.
  (function scheduleMinuteTick() {
    const now = new Date();
    const msToNextMinute =
      (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 50;
    setTimeout(() => {
      paintTopbarTime();
      setInterval(paintTopbarTime, 60000);
    }, msToNextMinute);
  })();
  loadAndPaintWeather();
  await loadTabStatuses();
  await loadSavedSessions();
  await renderDashboard();
  renderSavedSessions();
  updateSaveSessionBtn();
})();
