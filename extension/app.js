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

/* ----------------------------------------------------------------
   I18N — String table with simple t() lookup

   Values can be strings or functions (for pluralization / interpolation).
   Add a key once in both languages. Missing keys fall back to English.
   ---------------------------------------------------------------- */
const STRINGS = {
  en: {
    favorites: "Favorites",
    add: "Add",
    save: "Save",
    cancel: "Cancel",
    confirmOk: "Confirm",
    uploadLogo: "Upload logo (or paste image)",
    reset: "Reset",
    auto: "Auto",
    urlLabel: "URL",
    titleLabel: "Title",
    titlePlaceholder: "Title (optional)",
    favoritesEmpty:
      "No favorites yet. Hit + to pin a site, or star any tab on the right.",
    addAFavorite: "Add a favorite",
    addSection: "Section",
    sectionLabel: "Section",
    addSectionPrompt: "New section name",
    renameSectionPrompt: "Rename section",
    sectionAdded: "Section added",
    sectionRenamed: "Section renamed",
    edit: "Edit",
    remove: "Remove",
    moreActions: "More",
    rightNow: "Right now",
    openTabs: "Open tabs",
    pinned: "Pinned",
    nTabsCount: (n) => `${n} tab${n !== 1 ? "s" : ""}`,
    homepages: "Homepages",
    nDomains: (n) => `${n} domain${n !== 1 ? "s" : ""}`,
    nTabsOpen: (n) => `${n} tab${n !== 1 ? "s" : ""} open`,
    dupeBadge: (n) => `duplicate x ${n}`,
    closeAllN: (n) => `Close all ${n} tab${n !== 1 ? "s" : ""}`,
    closeDupes: "Close duplicates",
    plusN: (n) => `+${n} more`,
    statTabs: "Open tabs",
    addToFav: "Add to favorites",
    removeFromFav: "Remove from favorites",
    pinTip: "Pin tab",
    unpinTip: "Unpin tab",
    closeThisTab: "Close this tab",
    nWolfyTabsOpen: "Browser Organizer tabs open",
    keepOne: "Keep one",
    addedToFavorites: "Added to favorites",
    removedFromFavorites: "Removed from favorites",
    confirmRemoveFav: "Remove this from favorites?",
    alreadyAdded: "Already in favorites",
    saveFailed: "Save failed (storage may be full)",
    favoriteUpdated: "Favorite updated",
    tabClosed: "Tab closed",
    allTabsClosed: "All tabs closed. Fresh start.",
    closedExtras: "Closed duplicate Browser Organizer tabs",
    closedDupes: "Closed duplicate tabs",
    noDupes: "All clean — no duplicates",
    reviewDupes: "Review Duplicates",
    nDuplicateTabsFound: (n) => `${n} duplicate tab${n !== 1 ? "s" : ""} found`,
    cleanupHint: "You're running lean",
    todoPlaceholder: "Add a new task...",
    todoEmpty: "Nothing here yet. What's your next move?",
    todoAdded: "Task added",
    todoDone: "Task completed",
    plannerEyebrow: "Daily planner",
    plannerToday: "Today",
    plannerSelectedDay: "Selected day",
    plannerDayTasks: (n) => `${n} task${n !== 1 ? "s" : ""}`,
    plannerNoTasks: "A blank canvas. Plan something great.",
    plannerAddForDay: "Add task for selected day...",
    plannerRangeError: "You can only plan within the next 365 days.",
    profileUpdated: "Profile image updated",
    exportData: "Export",
    importData: "Import",
    exportDone: "Backup exported",
    importDone: "Backup imported",
    importFailed:
      "Import failed. Please choose a valid Browser Organizer JSON backup.",
    confirmImport:
      "Importing this backup will replace your saved favorites, sections, daily planner tasks, hero note, profile image, theme, and language setting on this browser. Continue?",
    heroTitleUpdated: "Hero title updated",
    heroCopyUpdated: "Hero note updated",
    heroCopyEditHint: "Double-click to edit",
    newTab: "New Tab",
    profileLibraryEyebrow: "Chrome profile",
    profileLibraryTitle: "Bookmarks & Lists",
    profileBookmarks: "Bookmarks",
    profileReadingList: "Reading List",
    profileCollapseAll: "Collapse all",
    profileExpandAll: "Expand all",
    profileLibraryManagerTitle: "Open Chrome Bookmark Manager",
    profileBookmarksEmpty: "No bookmarks in this profile yet.",
    profileReadingEmpty: "Reading list is empty — find something inspiring.",
    profileBookmarksUnavailable: "Allow the bookmarks permission, then reload.",
    profileReadingUnavailable:
      "Reading List is not available in this Chrome version.",
    profileMoreItems: (n) => `${n} more in Chrome`,
    profileViewAll: (n) => `View all ${n}`,
    profileRead: "Read",
    profileUnread: "Unread",
    bookmarkManagerUnavailable: "Open chrome://bookmarks from the address bar.",
    closedNFromX: (n, name) =>
      `Closed ${n} tab${n !== 1 ? "s" : ""} from ${name}`,
    tabs: "tabs",
    langToggle: "中",
    emptyStateTitle: "Zero tabs. Total clarity.",
    emptyStateSubtitle: "Nothing open, nothing pending.",
    unsafeUrl: "URL not allowed (unsafe scheme).",
    importTooBig: "File is too large to import.",
  },
  zh: {
    favorites: "收藏",
    add: "添加",
    save: "保存",
    cancel: "取消",
    confirmOk: "确定",
    uploadLogo: "上传图标（或粘贴图片）",
    reset: "重置",
    auto: "自动",
    urlLabel: "网址",
    titleLabel: "标题",
    titlePlaceholder: "标题（可选）",
    favoritesEmpty: "还没有收藏。点击 + 添加链接，或在右侧给标签页标星。",
    addAFavorite: "添加收藏",
    addSection: "分组",
    sectionLabel: "分组",
    addSectionPrompt: "新分组名称",
    renameSectionPrompt: "重命名分组",
    sectionAdded: "已添加分组",
    sectionRenamed: "分组已重命名",
    edit: "编辑",
    remove: "删除",
    moreActions: "更多",
    rightNow: "正在打开",
    openTabs: "当前标签",
    pinned: "已固定",
    nTabsCount: (n) => `${n} 个标签`,
    homepages: "主页",
    nDomains: (n) => `${n} 个域名`,
    nTabsOpen: (n) => `已打开 ${n} 个`,
    dupeBadge: (n) => `重复 x ${n}`,
    closeAllN: (n) => `关闭全部 ${n} 个`,
    closeDupes: "关闭重复",
    plusN: (n) => `还有 ${n} 个`,
    statTabs: "已打开",
    addToFav: "加入收藏",
    removeFromFav: "移除收藏",
    pinTip: "固定此标签",
    unpinTip: "取消固定",
    closeThisTab: "关闭此标签",
    nWolfyTabsOpen: "个 Browser Organizer 标签页",
    keepOne: "只保留一个",
    addedToFavorites: "已加入收藏",
    removedFromFavorites: "已从收藏移除",
    confirmRemoveFav: "确定要取消收藏此网址吗？",
    alreadyAdded: "已经收藏过了",
    saveFailed: "保存失败（存储可能已满）",
    favoriteUpdated: "收藏已更新",
    tabClosed: "标签已关闭",
    allTabsClosed: "所有标签已关闭。重新开始。",
    closedExtras: "已关闭重复的 Browser Organizer",
    closedDupes: "已关闭重复的标签页",
    noDupes: "干干净净，没有重复",
    reviewDupes: "查看重复",
    nDuplicateTabsFound: (n) => `发现 ${n} 个重复标签`,
    cleanupHint: "轻装上阵",
    todoPlaceholder: "添加一个新任务...",
    todoEmpty: "还没有任务。先写下一件小事。",
    todoAdded: "任务已添加",
    todoDone: "任务已完成",
    plannerEyebrow: "每日规划",
    plannerToday: "今天",
    plannerSelectedDay: "已选日期",
    plannerDayTasks: (n) => `${n} 个任务`,
    plannerNoTasks: "空白画布，计划点什么吧。",
    plannerAddForDay: "为选中日期添加任务...",
    plannerRangeError: "只能计划从今天起 365 天内的任务。",
    profileUpdated: "头像已更新",
    exportData: "导出",
    importData: "导入",
    exportDone: "备份已导出",
    importDone: "备份已导入",
    importFailed: "导入失败。请选择有效的 Browser Organizer JSON 备份。",
    confirmImport:
      "导入这个备份会替换此浏览器当前保存的收藏、分组、Daily Planner 任务、Hero 文案、头像、主题和语言设置。继续吗？",
    heroTitleUpdated: "Hero 标题已更新",
    heroCopyUpdated: "Hero 文案已更新",
    heroCopyEditHint: "双击编辑",
    newTab: "新标签",
    profileLibraryEyebrow: "Chrome 资料",
    profileLibraryTitle: "书签与列表",
    profileBookmarks: "书签",
    profileReadingList: "阅读清单",
    profileCollapseAll: "全部收起",
    profileExpandAll: "全部展开",
    profileLibraryManagerTitle: "打开 Chrome 书签管理器",
    profileBookmarksEmpty: "这个 Profile 还没有书签。",
    profileReadingEmpty: "阅读清单为空 — 去发现有趣的内容。",
    profileBookmarksUnavailable: "允许 bookmarks 权限后重新加载。",
    profileReadingUnavailable: "这个 Chrome 版本没有开放 Reading List。",
    profileMoreItems: (n) => `Chrome 里还有 ${n} 项`,
    profileViewAll: (n) => `查看全部 ${n} 项`,
    profileRead: "已读",
    profileUnread: "未读",
    bookmarkManagerUnavailable: "请从地址栏打开 chrome://bookmarks。",
    closedNFromX: (n, name) => `已从 ${name} 关闭 ${n} 个标签`,
    tabs: "个",
    langToggle: "EN",
    emptyStateTitle: "标签清零，清爽开始。",
    emptyStateSubtitle: "你自由了。",
    unsafeUrl: "不允许此类 URL（不安全的协议）。",
    importTooBig: "文件过大，无法导入。",
  },
};

let currentLang = "en";
let collapsedBookmarkFolders = new Set();
let expandedBookmarkFolders = new Set();
let dailyTasks = [];
let selectedPlannerDate = toLocalDateKey(new Date());
let visiblePlannerMonth = startOfMonth(new Date());

function t(key, ...args) {
  const v =
    (STRINGS[currentLang] && STRINGS[currentLang][key]) ??
    STRINGS.en[key] ??
    key;
  return typeof v === "function" ? v(...args) : v;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function loadLang() {
  try {
    const lang = await TabHomeStorage.getLang();
    if (lang === "zh" || lang === "en") currentLang = lang;
  } catch {}
}

async function saveLang(lang) {
  if (lang !== "zh" && lang !== "en") return;
  currentLang = lang;
  try {
    await TabHomeStorage.setLang(lang);
  } catch {}
}

/* ----------------------------------------------------------------
   THEME — 'light' | 'dark' | 'pink' | 'lavender' | 'sky' | 'sand'
   ---------------------------------------------------------------- */
const VALID_THEMES = ["light", "dark", "pink", "lavender", "sky", "sand"];
const THEME_DOT_COLOR = {
  light: "#f8f5f0",
  dark: "#2f2c29",
  pink: "#d4a5c1",
  lavender: "#b19cd9",
  sky: "#6c8ff5",
  sand: "#d1c0a8",
};

async function loadTheme() {
  try {
    const theme = await TabHomeStorage.getTheme();
    document.documentElement.dataset.theme = VALID_THEMES.includes(theme)
      ? theme
      : "light";
  } catch {
    document.documentElement.dataset.theme = "light";
  }
  paintThemeToggle();
}

function paintThemeToggle() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  const theme = document.documentElement.dataset.theme || "light";
  const color = THEME_DOT_COLOR[theme] || THEME_DOT_COLOR.light;
  btn.innerHTML = `<span class="theme-current-dot" style="background:${color}"></span>`;
  document.querySelectorAll(".theme-option[data-theme-id]").forEach((opt) => {
    opt.classList.toggle("is-active", opt.dataset.themeId === theme);
  });
}

function openThemeDropdown() {
  document.getElementById("themeDropdown")?.classList.add("open");
}

function closeThemeDropdown() {
  document.getElementById("themeDropdown")?.classList.remove("open");
}

async function applyTheme(themeId) {
  if (!VALID_THEMES.includes(themeId)) return;
  document.documentElement.dataset.theme = themeId;
  paintThemeToggle();
  closeThemeDropdown();
  try {
    await TabHomeStorage.setTheme(themeId);
  } catch {}
}

// Close theme dropdown when clicking outside it
document.addEventListener("click", (e) => {
  if (!e.target.closest("#themePickerWrap")) closeThemeDropdown();
});

/**
 * applyStaticI18n()
 *
 * Updates the static labels in index.html that aren't otherwise
 * rebuilt by renderStaticDashboard. Called on init and on language switch.
 */
function applyStaticI18n() {
  document.documentElement.lang = currentLang === "zh" ? "zh" : "en";

  const set = (selector, key, attr = "textContent") => {
    const el = document.querySelector(selector);
    if (!el) return;
    if (attr === "textContent") el.textContent = t(key);
    else el.setAttribute(attr, t(key));
  };
  const setText = (selector, value) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
  };
  const dashboardText =
    currentLang === "zh"
      ? {
          pinnedPlaces: "常用地点",
          localFirst: "本地优先",
          heroTitle: "保持专注，把更好的东西做出来。",
          heroCopy:
            "一个安静的控制台，放下你需要的标签、信任的链接，以及下一件值得做的事。",
          nextActions: "下一步",
          todoList: "Today Task",
          nowOpen: "正在打开",
          byDomain: "按域名",
          smartCleanup: "智能清理",
          tabsTracked: "个标签在本地追踪",
        }
      : {
          pinnedPlaces: "Pinned places",
          localFirst: "Local first",
          heroTitle: "Stay focused, ship better things.",
          heroCopy:
            "A calm command center for the tabs you need, the links you trust, and the next thing worth doing.",
          nextActions: "Next actions",
          todoList: "Today Task",
          nowOpen: "Now open",
          byDomain: "By domain",
          smartCleanup: "Smart cleanup",
          tabsTracked: "open tabs tracked locally",
        };

  // Header toggle button — shows the OTHER language as a hint to click
  set("#langToggle", "langToggle");
  set(".new-tab-btn span:last-child", "newTab");
  set('[data-action="export-data"]', "exportData");
  set('[data-action="import-data"]', "importData");

  // Favorites column
  set(".favorites-column .panel-heading h2", "favorites");
  set("#favoritesAddToggle", "addAFavorite", "title");
  set("#favoriteSectionAdd", "addSection");
  set("#favoritesUrlLabel", "urlLabel");
  set("#favoritesTitleLabel", "titleLabel");
  set("#favoritesSectionLabel", "sectionLabel");
  set(
    "#favoritesUrlInput",
    "titlePlaceholder" /*unused below for url*/,
    "placeholder",
  ); // overridden next line
  const urlInput = document.getElementById("favoritesUrlInput");
  if (urlInput) urlInput.placeholder = "https://...";
  set("#favoritesTitleInput", "titlePlaceholder", "placeholder");
  set("#favoritesLogoPlaceholder", "auto");
  set('label[for="favoritesLogoInput"]', "uploadLogo");
  set(".favorites-logo-reset", "reset");
  set("#favoritesFormSubmit", "add");
  set(".favorites-form-cancel", "cancel");
  set("#favoritesFormDelete", "remove");
  set("#favoritesEmpty", "favoritesEmpty");

  // Open tabs section default title (overwritten by render when tabs exist)
  set("#openTabsSectionTitle", "rightNow");

  const commandInput = document.getElementById("commandInput");
  if (commandInput) {
    commandInput.placeholder =
      currentLang === "zh" ? "搜索，或输入网址..." : "Search or type a URL...";
  }
  const locationEl = document.getElementById("locationDisplay");
  if (locationEl)
    locationEl.textContent = currentLang === "zh" ? "本地" : "Local";
  const weatherEl = document.getElementById("weatherDisplay");
  if (weatherEl)
    weatherEl.textContent = currentLang === "zh" ? "天气未开启" : "Weather off";

  setText(".favorites-column .eyebrow", dashboardText.pinnedPlaces);
  setText(".favorite-section-header span", t("favorites"));
  setText(".favorite-section-header small", dashboardText.localFirst);
  const heroTitle = document.getElementById("heroTitle");
  if (heroTitle) heroTitle.setAttribute("title", t("heroCopyEditHint"));
  const heroCopy = document.getElementById("heroCopy");
  if (heroCopy) heroCopy.setAttribute("title", t("heroCopyEditHint"));
  setText(".todo-panel .eyebrow", dashboardText.nextActions);
  setText("#todoPanelTitle", dashboardText.todoList);
  setText("#plannerEyebrow", t("plannerEyebrow"));
  const selectedDayTodoInput = document.getElementById("selectedDayTodoInput");
  if (selectedDayTodoInput)
    selectedDayTodoInput.placeholder = t("plannerAddForDay");
  setText(".tabs-column > .panel-heading .eyebrow", dashboardText.nowOpen);
  setText(
    "#openTabsSubSection .compact-section-header h2",
    dashboardText.byDomain,
  );
  setText(".smart-cleanup-card .eyebrow", dashboardText.smartCleanup);
  setText(".smart-cleanup-card span", dashboardText.tabsTracked);
  setText("#profileLibraryEyebrow", t("profileLibraryEyebrow"));
  setText("#profileLibraryTitle", t("profileLibraryTitle"));
  setText("#profileBookmarksTitle", t("profileBookmarks"));
  setText("#profileLibraryCollapse", t("profileCollapseAll"));
  setText("#profileLibraryExpand", t("profileExpandAll"));
  const profileLibraryManager = document.getElementById(
    "profileLibraryManager",
  );
  if (profileLibraryManager)
    profileLibraryManager.title = t("profileLibraryManagerTitle");

  // Footer stat
  set(".stat-label", "statTabs");

  // tab-out duplicate banner — only the suffix and button label
  // (the count number lives in #tabOutDupeCount and is set by JS)
  const cleanupText = document.querySelector(".tab-cleanup-text");
  if (cleanupText) {
    // Rebuild: <strong id="tabOutDupeCount">N</strong> + suffix
    const strong = document.getElementById("tabOutDupeCount");
    const suffix =
      currentLang === "zh"
        ? ` ${t("nWolfyTabsOpen")}`
        : ` ${t("nWolfyTabsOpen")}`;
    cleanupText.innerHTML = "";
    if (strong) cleanupText.appendChild(strong);
    cleanupText.appendChild(document.createTextNode(suffix));
  }
  set(".tab-cleanup-btn", "keepOne");
}

/* ----------------------------------------------------------------
   CHROME TABS — Direct API Access

   Since this page IS the extension's new tab page, it has full
   access to chrome.tabs and chrome.storage. No middleman needed.
   ---------------------------------------------------------------- */

// All open tabs — populated by fetchOpenTabs()
let openTabs = [];

// Per-URL status labels — populated by loadTabStatuses()
// Values: "later" | "important" | undefined
let tabStatuses = {};
async function loadTabStatuses() {
  tabStatuses = await TabHomeStorage.getTabStatuses();
}

/**
 * fetchOpenTabs()
 *
 * Reads all currently open browser tabs directly from Chrome.
 * Sets the extensionId flag so we can identify tab-out's own pages.
 */
async function fetchOpenTabs() {
  try {
    const extensionId = chrome.runtime.id;
    // The new URL for this page is now index.html (not newtab.html)
    const newtabUrl = `chrome-extension://${extensionId}/index.html`;

    const tabs = await chrome.tabs.query({});
    openTabs = tabs.map((t) => ({
      id: t.id,
      url: t.url,
      title: t.title,
      windowId: t.windowId,
      active: t.active,
      pinned: !!t.pinned,
      // lastAccessed: ms timestamp of the last time this tab was activated.
      // Undefined for tabs that have never been activated this session — we
      // fall back to tab id (monotonic) so brand-new background tabs still
      // sort above old ones.
      lastAccessed: t.lastAccessed || 0,
      // Flag tab-out's own pages so we can detect duplicate new tabs
      isTabOut: t.url === newtabUrl || t.url === "chrome://newtab/",
    }));
  } catch {
    // chrome.tabs API unavailable (shouldn't happen in an extension page)
    openTabs = [];
  }
}

/**
 * closeTabsByUrls(urls)
 *
 * Closes all open tabs whose hostname matches any of the given URLs.
 * After closing, re-fetches the tab list to keep our state accurate.
 *
 * Special case: file:// URLs are matched exactly (they have no hostname).
 */
async function closeTabsByUrls(urls) {
  if (!urls || urls.length === 0) return;

  // Separate file:// URLs (exact match) from regular URLs (hostname match)
  const targetHostnames = [];
  const exactUrls = new Set();

  for (const u of urls) {
    if (u.startsWith("file://")) {
      exactUrls.add(u);
    } else {
      try {
        targetHostnames.push(new URL(u).hostname);
      } catch {
        /* skip unparseable */
      }
    }
  }

  const allTabs = await chrome.tabs.query({});
  const toClose = allTabs
    .filter((tab) => {
      const tabUrl = tab.url || "";
      if (tabUrl.startsWith("file://") && exactUrls.has(tabUrl)) return true;
      try {
        const tabHostname = new URL(tabUrl).hostname;
        return tabHostname && targetHostnames.includes(tabHostname);
      } catch {
        return false;
      }
    })
    .map((tab) => tab.id);

  if (toClose.length > 0) await chrome.tabs.remove(toClose);
  await fetchOpenTabs();
}

/**
 * closeTabsExact(urls)
 *
 * Closes tabs by exact URL match (not hostname). Used for landing pages
 * so closing "Gmail inbox" doesn't also close individual email threads.
 */
async function closeTabsExact(urls) {
  if (!urls || urls.length === 0) return;
  const urlSet = new Set(urls);
  const allTabs = await chrome.tabs.query({});
  const toClose = allTabs.filter((t) => urlSet.has(t.url)).map((t) => t.id);
  if (toClose.length > 0) await chrome.tabs.remove(toClose);
  await fetchOpenTabs();
}

/**
 * focusTab(url)
 *
 * Switches Chrome to the tab with the given URL (exact match first,
 * then hostname fallback). Also brings the window to the front.
 */
async function focusTab(url) {
  if (!url) return;
  const allTabs = await chrome.tabs.query({});
  const currentWindow = await chrome.windows.getCurrent();

  // Try exact URL match first
  let matches = allTabs.filter((t) => t.url === url);

  // Fall back to hostname match
  if (matches.length === 0) {
    try {
      const targetHost = new URL(url).hostname;
      matches = allTabs.filter((t) => {
        try {
          return new URL(t.url).hostname === targetHost;
        } catch {
          return false;
        }
      });
    } catch {}
  }

  if (matches.length === 0) return;

  // Prefer a match in a different window so it actually switches windows
  const match =
    matches.find((t) => t.windowId !== currentWindow.id) || matches[0];
  await chrome.tabs.update(match.id, { active: true });
  await chrome.windows.update(match.windowId, { focused: true });
}

/**
 * closeDuplicateTabs(urls, keepOne)
 *
 * Closes duplicate tabs for the given list of URLs.
 * keepOne=true → keep one copy of each, close the rest.
 * keepOne=false → close all copies.
 */
async function closeDuplicateTabs(urls, keepOne = true) {
  const allTabs = await chrome.tabs.query({});
  const toClose = [];

  for (const url of urls) {
    const matching = allTabs.filter((t) => t.url === url);
    if (keepOne) {
      const keep = matching.find((t) => t.active) || matching[0];
      for (const tab of matching) {
        if (tab.id !== keep.id) toClose.push(tab.id);
      }
    } else {
      for (const tab of matching) toClose.push(tab.id);
    }
  }

  if (toClose.length > 0) await chrome.tabs.remove(toClose);
  await fetchOpenTabs();
}

/**
 * closeTabOutDupes()
 *
 * Closes all duplicate tab-out new-tab pages except the current one.
 */
async function closeTabOutDupes() {
  const extensionId = chrome.runtime.id;
  const newtabUrl = `chrome-extension://${extensionId}/index.html`;

  const allTabs = await chrome.tabs.query({});
  const currentWindow = await chrome.windows.getCurrent();
  const tabOutTabs = allTabs.filter(
    (t) => t.url === newtabUrl || t.url === "chrome://newtab/",
  );

  if (tabOutTabs.length <= 1) return;

  // Keep the active tab-out tab in the CURRENT window — that's the one the
  // user is looking at right now. Falls back to any active one, then the first.
  const keep =
    tabOutTabs.find((t) => t.active && t.windowId === currentWindow.id) ||
    tabOutTabs.find((t) => t.active) ||
    tabOutTabs[0];
  const toClose = tabOutTabs.filter((t) => t.id !== keep.id).map((t) => t.id);
  if (toClose.length > 0) await chrome.tabs.remove(toClose);
  await fetchOpenTabs();
}

/* ----------------------------------------------------------------
   LONG-TERM FAVORITES — local source of truth

   Stored under the "favorites" key. Permanent bookmarks the user
   wants one-click access to.

   Schema:
   [
     {
       id:      "1712345678901",
       url:     "https://example.com",
       title:   "Example",
       addedAt: "2026-05-01T10:00:00.000Z",
     },
     ...
   ]
   ---------------------------------------------------------------- */

/* Favorite shape: { id, url, title, addedAt, slot, customLogo? }

   `slot` is an explicit grid index. New favorites are placed at the
   first empty slot. Deleting a card leaves a gap so the rest don't
   shift around. The visible column count can change with screen width;
   cards just reflow into different (row, col) positions while keeping
   their slot index. */

async function getFavorites() {
  return TabHomeStorage.getFavorites();
}

async function setFavorites(favorites, options) {
  return TabHomeStorage.setFavorites(favorites, options);
}

async function getFavoriteSections() {
  return TabHomeStorage.getFavoriteSections();
}

async function setFavoriteSections(sections, options) {
  return TabHomeStorage.setFavoriteSections(sections, options);
}

function makeId(prefix) {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function addFavorite(
  url,
  title,
  customLogo = null,
  sectionId = "default",
) {
  if (!url) return false;
  if (/^(javascript|data|vbscript):/i.test(url.trim())) return false;
  await ensureFavoriteSections();
  const favorites = await getFavorites();
  if (favorites.some((f) => f.url === url)) return false;

  // Auto-derive a clean brand-style title (e.g. "Binance" from www.binance.com)
  // when no explicit title was passed.
  const cleanTitle = (title || "").trim();
  let finalTitle;
  if (cleanTitle) {
    finalTitle = cleanTitle;
  } else {
    try {
      finalTitle = friendlyDomain(new URL(url).hostname) || url;
    } catch {
      finalTitle = url;
    }
  }

  const finalSectionId = sectionId || "default";

  // Place at the first empty global slot for backward compatibility and at
  // the first empty section slot for the new horizontal section rows.
  const taken = new Set(favorites.map((f) => f.slot));
  let slot = 0;
  while (taken.has(slot)) slot++;

  const sectionTaken = new Set(
    favorites
      .filter((f) => (f.sectionId || "default") === finalSectionId)
      .map((f) =>
        typeof f.sectionSlot === "number" ? f.sectionSlot : f.slot || 0,
      ),
  );
  let sectionSlot = 0;
  while (sectionTaken.has(sectionSlot)) sectionSlot++;

  const fav = {
    id: Date.now().toString(),
    url,
    title: finalTitle,
    addedAt: new Date().toISOString(),
    slot,
    sectionId: finalSectionId,
    sectionSlot,
  };
  if (customLogo) fav.customLogo = customLogo;
  favorites.push(fav);
  await setFavorites(favorites);
  return true;
}

/**
 * Set a favorite's slot. If another favorite already owns that slot,
 * swap their slots — gives users predictable "click-and-place" behaviour
 * during drag-and-drop reordering.
 */
async function setFavoriteSlot(id, newSlot, sectionId = "default") {
  if (!id || typeof newSlot !== "number") return;
  if (newSlot < 0 || newSlot >= SLOT_UPPER_BOUND) return;
  const favorites = await getFavorites();
  const dragged = favorites.find((f) => f.id === id);
  if (!dragged) return;
  const nextSectionId = sectionId || "default";
  const oldSectionId = dragged.sectionId || "default";
  const oldSectionSlot =
    typeof dragged.sectionSlot === "number"
      ? dragged.sectionSlot
      : dragged.slot || 0;
  if (oldSectionId === nextSectionId && oldSectionSlot === newSlot) return;
  const occupant = favorites.find(
    (f) =>
      f.id !== id &&
      (f.sectionId || "default") === nextSectionId &&
      (typeof f.sectionSlot === "number" ? f.sectionSlot : f.slot || 0) ===
        newSlot,
  );
  if (occupant) {
    occupant.sectionId = oldSectionId;
    occupant.sectionSlot = oldSectionSlot;
    occupant.slot = oldSectionSlot;
  }
  dragged.sectionId = nextSectionId;
  dragged.sectionSlot = newSlot;
  dragged.slot = newSlot;
  await setFavorites(favorites);
}

async function updateFavoriteSection(id, sectionId) {
  const favorites = await getFavorites();
  const fav = favorites.find((f) => f.id === id);
  if (!fav) return;
  const nextSectionId = sectionId || "default";
  if ((fav.sectionId || "default") === nextSectionId) return;
  const taken = new Set(
    favorites
      .filter(
        (f) => f.id !== id && (f.sectionId || "default") === nextSectionId,
      )
      .map((f) =>
        typeof f.sectionSlot === "number" ? f.sectionSlot : f.slot || 0,
      ),
  );
  let sectionSlot = 0;
  while (taken.has(sectionSlot)) sectionSlot++;
  fav.sectionId = nextSectionId;
  fav.sectionSlot = sectionSlot;
  fav.slot = sectionSlot;
  await setFavorites(favorites);
}

async function ensureFavoriteSections() {
  const sections = await getFavoriteSections();
  if (sections.length > 0) return sections;
  const defaults = [
    { id: "default", name: "Favorites", order: 0, collapsed: false },
  ];
  await setFavoriteSections(defaults);
  return defaults;
}

async function addFavoriteSection(name) {
  const cleanName = (name || "").trim();
  if (!cleanName) return null;
  const sections = await getFavoriteSections();
  const next = [
    ...sections,
    {
      id: makeId("section"),
      name: cleanName,
      order: sections.length,
      collapsed: false,
    },
  ];
  await setFavoriteSections(next);
  return next[next.length - 1];
}

async function renameFavoriteSection(id, name) {
  const cleanName = (name || "").trim();
  if (!id || !cleanName) return;
  const sections = await getFavoriteSections();
  const section = sections.find((s) => s.id === id);
  if (!section) return;
  section.name = cleanName;
  await setFavoriteSections(sections);
}

async function toggleFavoriteSection(id) {
  const sections = await getFavoriteSections();
  const section = sections.find((s) => s.id === id);
  if (!section) return;
  section.collapsed = !section.collapsed;
  await setFavoriteSections(sections);
}

async function deleteFavoriteSection(id) {
  if (!id || id === "default") return;
  const sections = await getFavoriteSections();
  if (!sections.find((s) => s.id === id)) return;
  const favorites = await getFavorites();
  for (const fav of favorites) {
    if (fav.sectionId === id) {
      fav.sectionId = "default";
    }
  }
  await setFavorites(favorites);
  await setFavoriteSections(sections.filter((s) => s.id !== id));
}

async function moveFavoriteSection(id, dir) {
  const sections = (await getFavoriteSections()).sort(
    (a, b) => a.order - b.order,
  );
  const index = sections.findIndex((s) => s.id === id);
  const nextIndex = index + dir;
  if (index < 0 || nextIndex < 0 || nextIndex >= sections.length) return;
  [sections[index], sections[nextIndex]] = [
    sections[nextIndex],
    sections[index],
  ];
  sections.forEach((section, order) => {
    section.order = order;
  });
  await setFavoriteSections(sections);
}

/**
 * One-time migration:
 *  - Strip legacy folder entries / parentId / type fields.
 *  - Ensure every favorite has a non-negative slot. Slots that collide
 *    are reassigned to the first free slot. No upper bound — favorites
 *    are unlimited.
 * Idempotent.
 */
async function migrateAwayFromFolders() {
  const { favorites: raw = [] } = await chrome.storage.local.get("favorites");
  if (!raw.length) return;

  const before = JSON.stringify(raw);

  const cleaned = raw
    .filter((f) => f && f.type !== "folder" && f.url)
    .map(({ type, parentId, ...rest }) => rest);

  // Keep entries with valid non-conflicting slots; everything else gets a fresh one.
  const taken = new Set();
  const needSlot = [];
  for (const f of cleaned) {
    const valid =
      typeof f.slot === "number" && f.slot >= 0 && !taken.has(f.slot);
    if (valid) taken.add(f.slot);
    else needSlot.push(f);
  }

  // Place the rest into vacant slots, in their original order.
  let next = 0;
  for (const f of needSlot) {
    while (taken.has(next)) next++;
    f.slot = next;
    taken.add(next);
  }

  const final = cleaned;

  if (JSON.stringify(final) !== before) {
    await setFavorites(final);
  }
}

async function migrateFavoritesToSections() {
  const { favorites: raw = [], favoriteSections: rawSections } =
    await chrome.storage.local.get(["favorites", "favoriteSections"]);

  const hasSections = Array.isArray(rawSections) && rawSections.length > 0;
  const sections = hasSections
    ? await getFavoriteSections()
    : [{ id: "default", name: "Favorites", order: 0, collapsed: false }];

  const sectionIds = new Set(sections.map((section) => section.id));
  let changed = !hasSections;

  const migratedFavorites = (raw || []).map((fav, index) => {
    if (!fav || !fav.url) return fav;
    const next = { ...fav };
    if (!next.sectionId || !sectionIds.has(next.sectionId)) {
      next.sectionId = "default";
      changed = true;
    }
    if (typeof next.sectionSlot !== "number" || next.sectionSlot < 0) {
      next.sectionSlot =
        typeof next.slot === "number" && next.slot >= 0 ? next.slot : index;
      changed = true;
    }
    return next;
  });

  if (!hasSections) await setFavoriteSections(sections);
  if (changed) await setFavorites(migratedFavorites);
}

/**
 * updateFavorite(id, fields)
 *
 * Patches a favorite by id. Pass `customLogo: null` to delete the
 * custom logo and revert to the auto-fetched favicon.
 */
async function updateFavorite(id, fields) {
  const favorites = await getFavorites();
  const fav = favorites.find((f) => f.id === id);
  if (!fav) return;
  for (const [k, v] of Object.entries(fields)) {
    if (k === "customLogo" && v === null) delete fav.customLogo;
    else fav[k] = v;
  }
  await setFavorites(favorites);
}

async function removeFavorite(id) {
  const favorites = await getFavorites();
  const next = favorites.filter((f) => f.id !== id);
  await setFavorites(next);
}

async function isFavorited(url) {
  const favorites = await getFavorites();
  return favorites.some((f) => f.url === url);
}

/* ----------------------------------------------------------------
   DAILY PLANNER + PROFILE — local-only planning data
   ---------------------------------------------------------------- */

function toLocalDateKey(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDateKey(key) {
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(String(key || ""));
  if (!match) return new Date();
  const [year, month, day] = String(key).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function getPlannerMaxDateKey() {
  return toLocalDateKey(addDays(new Date(), PLANNER_MAX_DAYS_AHEAD));
}

function isDateInPlannerRange(dateKey) {
  const todayKey = toLocalDateKey(new Date());
  const maxKey = getPlannerMaxDateKey();
  return dateKey >= todayKey && dateKey <= maxKey;
}

function compareIsoDesc(a, b) {
  return String(b || "").localeCompare(String(a || ""));
}

function compareDailyTasks(a, b) {
  if (!!a.done !== !!b.done) return a.done ? 1 : -1;
  if (String(a.date || "") !== String(b.date || "")) {
    return String(a.date || "").localeCompare(String(b.date || ""));
  }
  const updatedCompare = compareIsoDesc(a.updatedAt, b.updatedAt);
  if (updatedCompare !== 0) return updatedCompare;
  return compareIsoDesc(a.createdAt, b.createdAt);
}

function sortDailyTasks(tasks) {
  return [...tasks].sort(compareDailyTasks);
}

async function getLegacyTodos() {
  const { todos = [] } = await chrome.storage.local.get("todos");
  return Array.isArray(todos)
    ? todos.filter(
        (todo) =>
          todo &&
          typeof todo === "object" &&
          typeof todo.text === "string" &&
          todo.text.trim(),
      )
    : [];
}

function mapLegacyTodoToDailyTask(todo, dateKey) {
  const createdAt =
    typeof todo.createdAt === "number" && todo.createdAt > 0
      ? new Date(todo.createdAt).toISOString()
      : new Date().toISOString();

  return {
    id: typeof todo.id === "string" && todo.id ? todo.id : makeId("task"),
    title: todo.text.trim(),
    tag:
      typeof todo.tag === "string" && todo.tag.trim()
        ? todo.tag.trim()
        : "Work",
    date: dateKey,
    done: false,
    createdAt,
    updatedAt: createdAt,
  };
}

async function migrateLegacyTodosToDailyTasks() {
  if (dailyTasks.length > 0) return false;

  const legacyTodos = await getLegacyTodos();
  if (!legacyTodos.length) return false;

  const todayKey = toLocalDateKey(new Date());
  dailyTasks = await TabHomeStorage.setDailyTasks(
    legacyTodos.map((todo) => mapLegacyTodoToDailyTask(todo, todayKey)),
  );

  try {
    await chrome.storage.local.remove("todos");
  } catch {}

  return true;
}

function ensurePlannerSelection() {
  const today = new Date();
  const minMonth = startOfMonth(today);
  const maxMonth = startOfMonth(parseLocalDateKey(getPlannerMaxDateKey()));

  if (!isDateInPlannerRange(selectedPlannerDate)) {
    selectedPlannerDate = toLocalDateKey(today);
  }

  if (
    !(visiblePlannerMonth instanceof Date) ||
    Number.isNaN(visiblePlannerMonth.getTime())
  ) {
    visiblePlannerMonth = startOfMonth(parseLocalDateKey(selectedPlannerDate));
  }

  if (visiblePlannerMonth.getTime() < minMonth.getTime()) {
    visiblePlannerMonth = minMonth;
  }
  if (visiblePlannerMonth.getTime() > maxMonth.getTime()) {
    visiblePlannerMonth = maxMonth;
  }
}

async function pruneExpiredDailyTasks() {
  const todayKey = toLocalDateKey(new Date());
  const maxKey = getPlannerMaxDateKey();
  let changed = false;

  const kept = [];
  for (const task of dailyTasks) {
    if (task.date > maxKey) continue; // beyond planner range — drop
    if (task.date < todayKey) {
      if (task.done) {
        changed = true;
        continue;
      } // done & past — drop
      // undone & past — carry forward to today
      task.originalDate = task.originalDate || task.date;
      task.overdue = true;
      task.date = todayKey;
      changed = true;
    }
    kept.push(task);
  }

  dailyTasks = sortDailyTasks(kept);
  if (changed) {
    dailyTasks = await TabHomeStorage.setDailyTasks(dailyTasks);
  }
}

async function loadDailyTasks() {
  dailyTasks = await TabHomeStorage.getDailyTasks();
  await migrateLegacyTodosToDailyTasks();
  await pruneExpiredDailyTasks();
  dailyTasks = sortDailyTasks(dailyTasks);
  ensurePlannerSelection();
}

async function persistDailyTasks({ skipSort = false } = {}) {
  if (!skipSort) dailyTasks = sortDailyTasks(dailyTasks);
  dailyTasks = await TabHomeStorage.setDailyTasks(dailyTasks);
}

function getTasksForDate(dateKey) {
  return dailyTasks.filter((task) => task.date === dateKey);
}

function getTodayTasks() {
  return getTasksForDate(toLocalDateKey(new Date()));
}

function renderDailyTaskRow(task) {
  const id = escapeHtml(task.id);
  const title = escapeHtml(task.title);
  const tag = escapeHtml(task.tag || "Work");
  const checked = task.done ? "checked" : "";
  const doneClass = task.done ? " is-done" : "";
  const overdueClass = task.overdue && !task.done ? " is-overdue" : "";
  const overdueBadge =
    task.overdue && !task.done
      ? `<span class="todo-overdue-badge">OVERDUE</span>`
      : "";

  return `
    <div class="todo-item daily-task-row${doneClass}${overdueClass}" data-task-id="${id}" draggable="true">
      <span class="todo-drag-handle" title="Drag to reorder">⠿</span>
      <label class="todo-check-wrap" aria-label="${task.done ? "Done" : "Pending"}">
        <input type="checkbox" data-action="toggle-daily-task" data-task-id="${id}" ${checked}>
      </label>
      <span class="todo-title">${title}${overdueBadge}</span>
      <span class="todo-tag">${tag}</span>
      <button class="todo-delete" type="button" data-action="delete-daily-task" data-task-id="${id}" aria-label="Delete task">×</button>
    </div>
  `;
}

function renderTodayTasks() {
  const list = document.getElementById("todoList");
  const count = document.getElementById("todoCount");
  if (!list || !count) return;

  const todayTasks = getTodayTasks();

  count.textContent = String(todayTasks.length);

  if (!todayTasks.length) {
    list.innerHTML = `<div class="todo-empty">${t("todoEmpty")}</div>`;
    return;
  }

  list.innerHTML = todayTasks.map(renderDailyTaskRow).join("");
}

function renderCalendarGrid() {
  const grid = document.getElementById("calendarGrid");
  const label = document.getElementById("plannerMonthLabel");
  const prevBtn = document.querySelector('[data-action="planner-prev-month"]');
  const nextBtn = document.querySelector('[data-action="planner-next-month"]');
  const todayBtn = document.querySelector('[data-action="planner-today"]');
  if (!grid || !label) return;

  ensurePlannerSelection();

  const locale = currentLang === "zh" ? "zh-CN" : "en-US";
  const month = visiblePlannerMonth;
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const todayKey = toLocalDateKey(new Date());

  label.textContent = month.toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
  if (todayBtn) todayBtn.textContent = t("plannerToday");

  const minMonth = startOfMonth(new Date());
  const maxMonth = startOfMonth(parseLocalDateKey(getPlannerMaxDateKey()));
  if (prevBtn) prevBtn.disabled = month.getTime() <= minMonth.getTime();
  if (nextBtn) nextBtn.disabled = month.getTime() >= maxMonth.getTime();

  const weekdayLabels =
    currentLang === "zh"
      ? ["一", "二", "三", "四", "五", "六", "日"]
      : ["M", "T", "W", "T", "F", "S", "S"];

  const taskCountByDate = new Map();
  dailyTasks.forEach((task) => {
    taskCountByDate.set(task.date, (taskCountByDate.get(task.date) || 0) + 1);
  });

  const firstDay = new Date(year, monthIndex, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = weekdayLabels.map(
    (day) => `<div class="calendar-weekday">${day}</div>`,
  );

  for (let i = 0; i < startOffset; i += 1) {
    cells.push('<div class="calendar-day is-empty"></div>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, monthIndex, day);
    const dateKey = toLocalDateKey(date);
    const selected = dateKey === selectedPlannerDate ? " is-selected" : "";
    const today = dateKey === todayKey ? " is-today" : "";
    const disabled = !isDateInPlannerRange(dateKey) ? "disabled" : "";
    const taskCount = taskCountByDate.get(dateKey) || 0;

    cells.push(`
      <button
        class="calendar-day${selected}${today}"
        type="button"
        data-action="select-planner-date"
        data-date="${dateKey}"
        ${disabled}
      >
        <span>${day}</span>
        ${taskCount ? `<small>${taskCount}</small>` : ""}
      </button>
    `);
  }

  grid.innerHTML = cells.join("");
}

function renderSelectedDayPanel() {
  const label = document.getElementById("selectedDateLabel");
  const count = document.getElementById("selectedDateCount");
  const list = document.getElementById("selectedDayTasks");
  if (!label || !count || !list) return;

  ensurePlannerSelection();

  const locale = currentLang === "zh" ? "zh-CN" : "en-US";
  const selectedDate = parseLocalDateKey(selectedPlannerDate);
  const tasks = getTasksForDate(selectedPlannerDate);

  label.textContent = selectedDate.toLocaleDateString(locale, {
    weekday: currentLang === "zh" ? "short" : "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  count.textContent = t("plannerDayTasks", tasks.length);

  if (!tasks.length) {
    list.innerHTML = `<div class="selected-day-empty">${t("plannerNoTasks")}</div>`;
    return;
  }

  list.innerHTML = tasks.map(renderDailyTaskRow).join("");
}

function renderDailyPlanner() {
  ensurePlannerSelection();
  renderTodayTasks();
  renderCalendarGrid();
  renderSelectedDayPanel();
}

async function addDailyTask(title, tag, dateKey) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) return false;
  if (!isDateInPlannerRange(dateKey)) {
    showToast(t("plannerRangeError"));
    return false;
  }

  const now = new Date().toISOString();
  dailyTasks.push({
    id: makeId("task"),
    title: cleanTitle,
    tag: tag || "Work",
    date: dateKey,
    done: false,
    createdAt: now,
    updatedAt: now,
  });

  await persistDailyTasks();
  renderDailyPlanner();
  return true;
}

async function toggleDailyTask(id) {
  const task = dailyTasks.find((item) => item.id === id);
  if (!task) return false;

  task.done = !task.done;
  task.updatedAt = new Date().toISOString();
  await persistDailyTasks();
  renderDailyPlanner();
  return task.done;
}

async function deleteDailyTask(id) {
  const next = dailyTasks.filter((task) => task.id !== id);
  if (next.length === dailyTasks.length) return false;
  dailyTasks = next;
  await persistDailyTasks();
  renderDailyPlanner();
  return true;
}

/* ---- Task drag-to-reorder ---- */
let _taskDragReorder = false;

function initTaskDragListeners(listEl) {
  if (!listEl) return;
  let dragId = null;

  listEl.addEventListener("dragstart", (e) => {
    const row = e.target.closest(".daily-task-row");
    if (!row) return;
    dragId = row.dataset.taskId;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragId);
    requestAnimationFrame(() => row.classList.add("is-dragging"));
  });

  listEl.addEventListener("dragend", (e) => {
    const row = e.target.closest(".daily-task-row");
    if (row) row.classList.remove("is-dragging");
    listEl
      .querySelectorAll(".drag-over")
      .forEach((el) => el.classList.remove("drag-over"));
    dragId = null;
  });

  listEl.addEventListener("dragenter", (e) => {
    e.preventDefault();
  });

  listEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const row = e.target.closest(".daily-task-row");
    if (row && row.dataset.taskId !== dragId) {
      listEl
        .querySelectorAll(".drag-over")
        .forEach((el) => el.classList.remove("drag-over"));
      row.classList.add("drag-over");
    }
  });

  listEl.addEventListener("dragleave", (e) => {
    const row = e.target.closest(".daily-task-row");
    if (row) row.classList.remove("drag-over");
  });

  listEl.addEventListener("drop", async (e) => {
    e.preventDefault();
    const targetRow = e.target.closest(".daily-task-row");
    console.log("[DnD] drop fired", {
      target: e.target.tagName,
      targetRow: !!targetRow,
      dragId,
    });
    if (!targetRow || !dragId) return;
    const targetId = targetRow.dataset.taskId;
    console.log("[DnD] dragId:", dragId, "targetId:", targetId);
    if (targetId === dragId) return;

    const fromIdx = dailyTasks.findIndex((t) => t.id === dragId);
    const toIdx = dailyTasks.findIndex((t) => t.id === targetId);
    console.log("[DnD] fromIdx:", fromIdx, "toIdx:", toIdx);
    if (fromIdx < 0 || toIdx < 0) return;

    const [moved] = dailyTasks.splice(fromIdx, 1);
    dailyTasks.splice(toIdx, 0, moved);
    _taskDragReorder = true;
    await persistDailyTasks({ skipSort: true });
    renderDailyPlanner();
  });
}

// Initialize drag listeners once DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  initTaskDragListeners(document.getElementById("todoList"));
  initTaskDragListeners(document.getElementById("selectedDayTasks"));
});

async function getProfileImageDataUrl() {
  const { profileImageDataUrl = "" } = await chrome.storage.local.get(
    "profileImageDataUrl",
  );
  return typeof profileImageDataUrl === "string" ? profileImageDataUrl : "";
}

async function setProfileImageDataUrl(dataUrl) {
  await chrome.storage.local.set({ profileImageDataUrl: dataUrl || "" });
}

async function paintProfileImage() {
  const img = document.getElementById("profileImage");
  const initials = document.getElementById("profileInitials");
  if (!img || !initials) return;
  const dataUrl = await getProfileImageDataUrl();
  if (dataUrl) {
    img.src = dataUrl;
    img.style.display = "block";
    initials.style.display = "none";
  } else {
    img.removeAttribute("src");
    img.style.display = "none";
    initials.style.display = "inline";
  }
}

/* ----------------------------------------------------------------
   HERO NOTE — editable local copy
   ---------------------------------------------------------------- */

const HERO_TITLE_KEY = "heroTitle";
const HERO_COPY_KEY = "heroCopy";

function getDefaultHeroTitle() {
  return currentLang === "zh"
    ? "保持专注，把更好的东西做出来。"
    : "Stay focused, ship better things.";
}

async function getStoredHeroTitle() {
  const data = await chrome.storage.local.get(HERO_TITLE_KEY);
  return typeof data[HERO_TITLE_KEY] === "string" ? data[HERO_TITLE_KEY] : "";
}

async function setHeroTitle(value) {
  const clean = String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  await chrome.storage.local.set({ [HERO_TITLE_KEY]: clean });
  return clean;
}

async function paintHeroTitle() {
  const el = document.getElementById("heroTitle");
  if (!el) return;
  const stored = (await getStoredHeroTitle()).trim();
  el.textContent = stored || getDefaultHeroTitle();
  el.dataset.customHeroTitle = stored ? "true" : "false";
  el.setAttribute("title", t("heroCopyEditHint"));
}

function getDefaultHeroCopy() {
  return currentLang === "zh"
    ? "一个安静的控制台，放下你需要的标签、信任的链接，以及下一件值得做的事。"
    : "A calm command center for the tabs you need, the links you trust, and the next thing worth doing.";
}

async function getStoredHeroCopy() {
  const data = await chrome.storage.local.get(HERO_COPY_KEY);
  return typeof data[HERO_COPY_KEY] === "string" ? data[HERO_COPY_KEY] : "";
}

async function getHeroCopy() {
  const stored = (await getStoredHeroCopy()).trim();
  return stored || getDefaultHeroCopy();
}

async function setHeroCopy(value) {
  const clean = String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  await chrome.storage.local.set({ [HERO_COPY_KEY]: clean });
  return clean;
}

async function paintHeroCopy() {
  const el = document.getElementById("heroCopy");
  if (!el) return;
  const stored = (await getStoredHeroCopy()).trim();
  el.textContent = stored || getDefaultHeroCopy();
  el.dataset.customHeroCopy = stored ? "true" : "false";
  el.setAttribute("title", t("heroCopyEditHint"));
}

function selectElementText(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

function beginHeroCopyEdit() {
  const el = document.getElementById("heroCopy");
  if (!el || el.isContentEditable) return;
  el.dataset.beforeEdit = el.textContent || "";
  el.contentEditable = "true";
  el.classList.add("is-editing");
  el.focus();
  selectElementText(el);
}

function beginHeroTitleEdit() {
  const el = document.getElementById("heroTitle");
  if (!el || el.isContentEditable) return;
  el.dataset.beforeEdit = el.textContent || "";
  el.contentEditable = "true";
  el.classList.add("is-editing");
  el.focus();
  selectElementText(el);
}

async function saveHeroCopyEdit(el) {
  if (!el || !el.isContentEditable) return;
  const clean = await setHeroCopy(el.innerText || el.textContent || "");
  el.contentEditable = "false";
  el.classList.remove("is-editing");
  el.textContent = clean || getDefaultHeroCopy();
  el.dataset.customHeroCopy = clean ? "true" : "false";
  showToast(t("heroCopyUpdated"));
}

async function saveHeroTitleEdit(el) {
  if (!el || !el.isContentEditable) return;
  const clean = await setHeroTitle(el.innerText || el.textContent || "");
  el.contentEditable = "false";
  el.classList.remove("is-editing");
  el.textContent = clean || getDefaultHeroTitle();
  el.dataset.customHeroTitle = clean ? "true" : "false";
  showToast(t("heroTitleUpdated"));
}

function cancelHeroCopyEdit(el) {
  if (!el || !el.isContentEditable) return;
  el.contentEditable = "false";
  el.classList.remove("is-editing");
  el.textContent = el.dataset.beforeEdit || getDefaultHeroCopy();
}

function cancelHeroTitleEdit(el) {
  if (!el || !el.isContentEditable) return;
  el.contentEditable = "false";
  el.classList.remove("is-editing");
  el.textContent = el.dataset.beforeEdit || getDefaultHeroTitle();
}

/* ----------------------------------------------------------------
   JSON BACKUP / RESTORE — local data portability without accounts
   ---------------------------------------------------------------- */

const EXPORT_SCHEMA_VERSION = 2;

function isImageDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

function sanitizeFavoriteForExport(favorite) {
  const exported = {
    id: favorite.id,
    url: favorite.url,
    title: favorite.title,
    addedAt: favorite.addedAt,
    slot: favorite.slot,
    sectionId: favorite.sectionId || "default",
    sectionSlot:
      typeof favorite.sectionSlot === "number"
        ? favorite.sectionSlot
        : favorite.slot,
  };

  if (isImageDataUrl(favorite.customLogo)) {
    exported.customLogo = favorite.customLogo;
  }
  if (isImageDataUrl(favorite.iconUrl)) {
    exported.iconUrl = favorite.iconUrl;
  }

  return exported;
}

function sanitizeDailyTaskForExport(task) {
  return {
    id: task.id,
    title: task.title,
    tag: task.tag || "Work",
    date: task.date,
    done: !!task.done,
    createdAt:
      typeof task.createdAt === "string" && task.createdAt
        ? task.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof task.updatedAt === "string" && task.updatedAt
        ? task.updatedAt
        : new Date().toISOString(),
  };
}

async function buildExportPayload() {
  const [
    favorites,
    favoriteSections,
    storedDailyTasks,
    profileImageDataUrl,
    heroTitle,
    heroCopy,
    storedLang,
  ] = await Promise.all([
    getFavorites(),
    getFavoriteSections(),
    TabHomeStorage.getDailyTasks(),
    getProfileImageDataUrl(),
    getStoredHeroTitle(),
    getStoredHeroCopy(),
    TabHomeStorage.getLang(),
  ]);
  const curTheme = document.documentElement.dataset.theme;
  const theme = VALID_THEMES.includes(curTheme) ? curTheme : "light";

  return {
    app: EXPORT_APP_ID,
    appName: APP_DISPLAY_NAME,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      favoriteSections,
      favorites: favorites.map(sanitizeFavoriteForExport),
      dailyTasks: storedDailyTasks.map(sanitizeDailyTaskForExport),
      heroTitle,
      heroCopy,
      profileImageDataUrl: isImageDataUrl(profileImageDataUrl)
        ? profileImageDataUrl
        : "",
      theme,
      lang: storedLang || currentLang,
    },
  };
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 0);
}

async function exportTabHomeData() {
  const payload = await buildExportPayload();
  const stamp = new Date().toISOString().slice(0, 10);
  downloadJsonFile(`browser-organizer-backup-${stamp}.json`, payload);
  showToast(t("exportDone"));
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(reader.error || new Error("Could not read file"));
    reader.readAsText(file);
  });
}

function extractImportData(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (
    [EXPORT_APP_ID, ...LEGACY_EXPORT_APP_IDS].includes(payload.app) &&
    payload.data &&
    typeof payload.data === "object"
  ) {
    return payload.data;
  }
  if (
    Array.isArray(payload.favorites) ||
    Array.isArray(payload.favoriteSections) ||
    Array.isArray(payload.dailyTasks) ||
    Array.isArray(payload.todos)
  ) {
    return payload;
  }
  return null;
}

function normalizeImportedSections(value) {
  if (!Array.isArray(value)) {
    return [{ id: "default", name: "Favorites", order: 0, collapsed: false }];
  }

  const sections = value
    .filter((section) => section && typeof section === "object")
    .map((section, index) => {
      const rawId =
        typeof section.id === "string" && section.id
          ? section.id
          : `section-${index}`;
      return {
        id: /^[a-zA-Z0-9:_-]+$/.test(rawId) ? rawId : `section-${index}`,
        name:
          typeof section.name === "string" && section.name.trim()
            ? section.name.trim()
            : "Favorites",
        order:
          typeof section.order === "number" && section.order >= 0
            ? section.order
            : index,
        collapsed: !!section.collapsed,
      };
    })
    .filter(
      (section, index, all) =>
        all.findIndex((item) => item.id === section.id) === index,
    );

  if (!sections.some((section) => section.id === "default")) {
    sections.unshift({
      id: "default",
      name: "Favorites",
      order: 0,
      collapsed: false,
    });
  }

  return sections
    .sort((a, b) => a.order - b.order)
    .map((section, index) => ({ ...section, order: index }));
}

function normalizeImportedFavorites(value, sections) {
  if (!Array.isArray(value)) return [];

  const sectionIds = new Set(sections.map((section) => section.id));
  return value
    .filter(
      (favorite) =>
        favorite &&
        typeof favorite === "object" &&
        typeof favorite.url === "string" &&
        favorite.url.trim(),
    )
    .map((favorite, index) => {
      const slot =
        typeof favorite.slot === "number" && favorite.slot >= 0
          ? favorite.slot
          : index;
      const sectionId =
        typeof favorite.sectionId === "string" &&
        sectionIds.has(favorite.sectionId)
          ? favorite.sectionId
          : "default";
      const imported = {
        id:
          typeof favorite.id === "string" && favorite.id
            ? favorite.id
            : makeId("fav"),
        url: favorite.url.trim(),
        title:
          typeof favorite.title === "string" && favorite.title.trim()
            ? favorite.title.trim()
            : favorite.url.trim(),
        addedAt:
          typeof favorite.addedAt === "string" && favorite.addedAt
            ? favorite.addedAt
            : new Date().toISOString(),
        slot,
        sectionId,
        sectionSlot:
          typeof favorite.sectionSlot === "number" && favorite.sectionSlot >= 0
            ? favorite.sectionSlot
            : slot,
      };

      if (isImageDataUrl(favorite.customLogo)) {
        imported.customLogo = favorite.customLogo;
      }
      if (isImageDataUrl(favorite.iconUrl)) {
        imported.iconUrl = favorite.iconUrl;
      }

      return imported;
    });
}

function normalizeImportedDailyTasks(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (task) =>
        task &&
        typeof task === "object" &&
        typeof task.title === "string" &&
        task.title.trim() &&
        typeof task.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(task.date),
    )
    .map((task) => ({
      id: typeof task.id === "string" && task.id ? task.id : makeId("task"),
      title: task.title.trim(),
      tag:
        typeof task.tag === "string" && task.tag.trim()
          ? task.tag.trim()
          : "Work",
      date: task.date,
      done: !!task.done,
      createdAt:
        typeof task.createdAt === "string" && task.createdAt
          ? task.createdAt
          : new Date().toISOString(),
      updatedAt:
        typeof task.updatedAt === "string" && task.updatedAt
          ? task.updatedAt
          : new Date().toISOString(),
    }));
}

function normalizeImportedLegacyTodos(value) {
  if (!Array.isArray(value)) return [];
  const todayKey = toLocalDateKey(new Date());
  return value
    .filter(
      (todo) =>
        todo &&
        typeof todo === "object" &&
        typeof todo.text === "string" &&
        todo.text.trim(),
    )
    .map((todo) => mapLegacyTodoToDailyTask(todo, todayKey));
}

async function importTabHomeDataFromFile(file) {
  const MAX_IMPORT_BYTES = 50 * 1024 * 1024; // 50 MB
  if (file && file.size > MAX_IMPORT_BYTES) {
    showToast(t("importTooBig"));
    return;
  }
  try {
    const text = await readFileAsText(file);
    const payload = JSON.parse(text);
    const data = extractImportData(payload);
    if (!data) throw new Error("Invalid Browser Organizer backup");

    const ok = await showConfirm({
      message: t("confirmImport"),
      okLabel: t("importData"),
    });
    if (!ok) return;

    const sections = normalizeImportedSections(data.favoriteSections);
    const favorites = normalizeImportedFavorites(data.favorites, sections);
    const normalizedDailyTasks = normalizeImportedDailyTasks(data.dailyTasks);
    const importedDailyTasks = normalizedDailyTasks.length
      ? normalizedDailyTasks
      : normalizeImportedLegacyTodos(data.todos);
    const heroTitle = typeof data.heroTitle === "string" ? data.heroTitle : "";
    const heroCopy = typeof data.heroCopy === "string" ? data.heroCopy : "";
    const profileImageDataUrl = isImageDataUrl(data.profileImageDataUrl)
      ? data.profileImageDataUrl
      : "";
    const theme = VALID_THEMES.includes(data.theme) ? data.theme : null;
    const lang = data.lang === "zh" || data.lang === "en" ? data.lang : null;

    _suppressFavReRender++;
    try {
      await setFavoriteSections(sections);
      await setFavorites(favorites);
      dailyTasks = sortDailyTasks(importedDailyTasks);
      await TabHomeStorage.setDailyTasks(dailyTasks);
      try {
        await chrome.storage.local.remove("todos");
      } catch {}
      await setHeroTitle(heroTitle);
      await setHeroCopy(heroCopy);
      await setProfileImageDataUrl(profileImageDataUrl);
      if (theme) await TabHomeStorage.setTheme(theme);
      if (lang) await saveLang(lang);
    } finally {
      _suppressFavReRender--;
    }

    await loadTheme();
    await loadLang();
    applyStaticI18n();
    await migrateFavoritesToSections();
    await pruneExpiredDailyTasks();
    await populateFavoriteSectionInput();
    await paintHeroTitle();
    await paintHeroCopy();
    await paintProfileImage();
    await renderDashboard();
    showToast(t("importDone"));
  } catch (error) {
    console.warn("[wolfy] import failed:", error);
    showToast(t("importFailed"));
  }
}

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
    return "晚上好";
  }
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
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
    imgHtml = `<img class="favorite-favicon" src="${fav.customLogo}" alt="">`;
  } else if (fav.iconUrl) {
    // Already resolved. Data URLs are real binary caches — mark resolved so
    // we never re-download. Plain URL strings (legacy) get rendered but left
    // unresolved, so the load handler downloads + upgrades to a data URL.
    const safe = fav.iconUrl.replace(/"/g, "&quot;");
    const isBinary = fav.iconUrl.startsWith("data:");
    const resolved = isBinary ? 'data-resolved="1"' : "";
    imgHtml = `<img class="favorite-favicon" src="${safe}" data-fav-id="${fav.id}" ${resolved} alt="">`;
  } else {
    const chain = getFaviconFallbackChain(fav.url, 128);
    if (chain.length > 0) {
      const primary = chain[0].replace(/"/g, "&quot;");
      const fallback = chain.slice(1).join("|").replace(/"/g, "&quot;");
      imgHtml = `<img class="favorite-favicon" src="${primary}" data-fallback="${fallback}" data-fav-id="${fav.id}" alt="">`;
    }
  }

  return `
    <a class="favorite-item" href="${safeUrl}" target="_blank" rel="noopener noreferrer" draggable="true" data-fav-id="${fav.id}" data-section-id="${sectionId}" data-slot="${sectionSlot}" title="${safeUrl}">
      ${imgHtml}
      <span class="favorite-title">${safeTitle}</span>
      <button class="favorite-menu" data-action="favorite-menu" data-fav-id="${fav.id}" title="${t("moreActions")}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
      </button>
    </a>`;
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
  const bySlot = new Map();
  let maxSlot = -1;
  for (const item of sectionItems) {
    const slot =
      typeof item.sectionSlot === "number" ? item.sectionSlot : item.slot || 0;
    bySlot.set(slot, item);
    if (slot > maxSlot) maxSlot = slot;
  }

  const totalSlots = Math.max(maxSlot + 2, sectionItems.length === 0 ? 1 : 0);
  let row = "";
  for (let i = 0; i < totalSlots; i++) {
    const item = bySlot.get(i);
    row += item
      ? renderFavoriteItem(item)
      : `<div class="favorite-slot-empty" data-section-id="${section.id}" data-slot="${i}"></div>`;
  }

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
  const detail =
    duplicates > 0 ? t("nDuplicateTabsFound", duplicates) : t("noDupes");
  const button =
    duplicates > 0
      ? `<button class="review-duplicates-btn" data-action="review-duplicates">${t("reviewDupes")}</button>`
      : "";
  card.innerHTML = `
    <div>
      <p class="eyebrow">${currentLang === "zh" ? "智能清理" : "Smart cleanup"}</p>
      <strong class="cleanup-detail">${detail}</strong>
      <span>${t("cleanupHint")}</span>
    </div>
    ${button}`;
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
      return `<div class="session-card" data-session-id="${escapeHtml(s.id)}">
      <div class="session-row" data-action="toggle-session-preview" data-session-id="${escapeHtml(s.id)}">
        <div class="session-info">
          <span class="session-name" data-action="rename-session" data-session-id="${escapeHtml(s.id)}" title="Click to rename">${escapeHtml(s.name)}</span>
          <span class="session-meta">${s.tabs.length} tabs &middot; ${dateStr}</span>
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

  if (action === "delete-daily-task") {
    const id = actionEl.dataset.taskId;
    if (!id) return;
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
    const card = actionEl.closest(".session-card");
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

  let debounceTimer = null;
  let activeIndex = -1;
  let currentSuggestions = [];

  function openSuggestions(items) {
    currentSuggestions = items;
    activeIndex = -1;
    if (!items.length) {
      closeSuggestions();
      return;
    }
    box.innerHTML = items
      .map(
        (s, i) =>
          `<div class="suggestion-item" data-index="${i}">` +
          `<span class="suggestion-icon">${ICON_SEARCH}</span>` +
          `<span class="suggestion-text">${escapeHtml(s)}</span>` +
          `</div>`,
      )
      .join("");
    box.classList.add("is-open");
  }

  function closeSuggestions() {
    box.classList.remove("is-open");
    box.innerHTML = "";
    activeIndex = -1;
    currentSuggestions = [];
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

  function navigateToSuggestion(text) {
    closeSuggestions();
    window.location.href = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
  }

  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearTimeout(debounceTimer);
    if (!q) {
      closeSuggestions();
      return;
    }
    debounceTimer = setTimeout(async () => {
      try {
        const resp = await chrome.runtime.sendMessage({
          type: "fetch-suggestions",
          query: q,
        });
        if (input.value.trim() === q) openSuggestions(resp.suggestions || []);
      } catch {
        /* ignore */
      }
    }, 180);
  });

  input.addEventListener("keydown", (e) => {
    if (!box.classList.contains("is-open")) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(activeIndex + 1, currentSuggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, -1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
      navigateToSuggestion(currentSuggestions[activeIndex]);
    } else if (e.key === "Escape") {
      closeSuggestions();
    }
  });

  input.addEventListener("focus", () => {
    const q = input.value.trim();
    if (!q || box.classList.contains("is-open")) return;
    chrome.runtime
      .sendMessage({ type: "fetch-suggestions", query: q })
      .then((resp) => {
        if (input.value.trim() === q) openSuggestions(resp.suggestions || []);
      })
      .catch(() => {});
  });

  input.addEventListener("blur", () => {
    setTimeout(closeSuggestions, 150);
  });

  box.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".suggestion-item");
    if (!item) return;
    e.preventDefault();
    navigateToSuggestion(currentSuggestions[Number(item.dataset.index)]);
  });
})();

document.addEventListener("submit", (e) => {
  if (e.target.id !== "commandForm") return;
  e.preventDefault();
  const input = document.getElementById("commandInput");
  const target = commandTargetFromInput(input && input.value);
  if (target) window.location.href = target;
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
      const ok = await addDailyTask(title, tag, dateKey);
      if (ok) count++;
    }
    cursor.setDate(cursor.getDate() + (repeat === "weekly" ? 7 : 1));
  }

  if (count > 0) {
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
   FAVORITES DRAG-AND-DROP — reorder cards within the favorites column.

   Scope: strictly limited to the favorites column. Drops elsewhere on
   the page (including the OpenTabs section) are ignored. This is
   intentional — dragging onto OpenTabs used to "open as new tab", but
   that feature was confusing and got removed.

   Drop targets:
     - another card        → swap slots
     - empty slot          → place there
     - anywhere else       → no-op
   ---------------------------------------------------------------- */
let _draggedFavId = null;

function clearDropMarkers() {
  document
    .querySelectorAll(
      ".favorite-item.drop-target, .favorite-slot-empty.drop-target",
    )
    .forEach((el) => el.classList.remove("drop-target"));
}

document.addEventListener("dragstart", (e) => {
  const item = e.target.closest(".favorite-item");
  if (!item) return;
  _draggedFavId = item.dataset.favId;
  item.classList.add("dragging");
  document.body.classList.add("dragging-favorite");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", _draggedFavId);
});

document.addEventListener("dragend", () => {
  document
    .querySelectorAll(".favorite-item.dragging")
    .forEach((el) => el.classList.remove("dragging"));
  document.body.classList.remove("dragging-favorite");
  clearDropMarkers();
  _draggedFavId = null;
});

document.addEventListener("dragover", (e) => {
  if (!_draggedFavId) return;

  // Hovering another card → reorder (swap slots on drop)
  const card = e.target.closest(".favorite-item");
  if (card && card.dataset.favId && card.dataset.favId !== _draggedFavId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    clearDropMarkers();
    card.classList.add("drop-target");
    return;
  }

  // Hovering an empty slot → place there
  const slot = e.target.closest(".favorite-slot-empty");
  if (slot) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    clearDropMarkers();
    slot.classList.add("drop-target");
  }
  // No third branch — drops outside the favorites grid are not allowed.
});

document.addEventListener("drop", async (e) => {
  if (!_draggedFavId) return;
  const draggedId = _draggedFavId;
  _draggedFavId = null;

  // Drop on another card → swap slots
  const card = e.target.closest(".favorite-item");
  if (card && card.dataset.favId && card.dataset.favId !== draggedId) {
    e.preventDefault();
    clearDropMarkers();
    const favorites = await getFavorites();
    const a = favorites.find((f) => f.id === draggedId);
    const b = favorites.find((f) => f.id === card.dataset.favId);
    if (a && b) {
      const aSectionId = a.sectionId || "default";
      const bSectionId = b.sectionId || "default";
      const aSectionSlot =
        typeof a.sectionSlot === "number" ? a.sectionSlot : a.slot || 0;
      const bSectionSlot =
        typeof b.sectionSlot === "number" ? b.sectionSlot : b.slot || 0;
      a.sectionId = bSectionId;
      a.sectionSlot = bSectionSlot;
      a.slot = bSectionSlot;
      b.sectionId = aSectionId;
      b.sectionSlot = aSectionSlot;
      b.slot = aSectionSlot;
      await setFavorites(favorites);
      await renderFavoritesColumn();
    }
    return;
  }

  // Drop on an empty slot → set slot
  const slot = e.target.closest(".favorite-slot-empty");
  if (slot) {
    e.preventDefault();
    clearDropMarkers();
    const newSlot = parseInt(slot.dataset.slot, 10);
    const sectionId = slot.dataset.sectionId || "default";
    if (!Number.isNaN(newSlot)) {
      await setFavoriteSlot(draggedId, newSlot, sectionId);
      await renderFavoritesColumn();
    }
    return;
  }

  clearDropMarkers();
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
