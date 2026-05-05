/* ================================================================
   storage.js — local-only storage helpers for Browser Organizer

   Browser Organizer intentionally stays account-free: runtime data lives in
   chrome.storage.local, and backup/migration is handled by JSON
   Export / Import from the new tab page.

   The cleanup helper removes legacy chrome.storage.sync mirror keys
   from older builds so we do not keep writing dashboard data to a
   Chrome account.
   ================================================================ */

(function (root) {
  "use strict";

  const LOCAL_KEYS = {
    favorites: "favorites",
    favoriteSections: "favoriteSections",
    dailyTasks: "dailyTasks",
    lang: "lang",
    theme: "theme",
    tabStatuses: "tabStatuses",
    savedSessions: "savedSessions",
  };

  const META_KEYS = {
    favorites: "__tabHomeFavoritesUpdatedAt",
    favoriteSections: "__tabHomeFavoriteSectionsUpdatedAt",
    dailyTasks: "__tabHomeDailyTasksUpdatedAt",
    lang: "__tabHomeLangUpdatedAt",
    theme: "__tabHomeThemeUpdatedAt",
  };

  const LEGACY_SYNC_KEYS = [
    "__tabHomeSyncFavoritesIndex",
    "__tabHomeSyncFavoriteSections",
    "__tabHomeSyncLang",
    "__tabHomeSyncTheme",
  ];
  const LEGACY_SYNC_FAVORITE_PREFIX = "__tabHomeSyncFavorite__";
  const LEGACY_SYNC_CLEANED_KEY = "__tabHomeLegacySyncCleanedAt";

  function isLang(value) {
    return value === "en" || value === "zh";
  }

  function isTheme(value) {
    return ["light", "dark", "pink", "lavender", "sky", "sand"].includes(value);
  }

  function normalizeFavorite(value) {
    if (!value || typeof value !== "object" || !value.url) return null;

    const url = String(value.url);
    const favorite = {
      id: typeof value.id === "string" && value.id ? value.id : `fav:${url}`,
      url,
      title: typeof value.title === "string" && value.title ? value.title : url,
      addedAt:
        typeof value.addedAt === "string" && value.addedAt
          ? value.addedAt
          : new Date(0).toISOString(),
      slot: typeof value.slot === "number" && value.slot >= 0 ? value.slot : 0,
    };

    if (typeof value.customLogo === "string" && value.customLogo) {
      favorite.customLogo = value.customLogo;
    }
    if (typeof value.iconUrl === "string" && value.iconUrl) {
      favorite.iconUrl = value.iconUrl;
    }
    if (typeof value.sectionId === "string" && value.sectionId) {
      favorite.sectionId = value.sectionId;
    }
    if (typeof value.sectionSlot === "number" && value.sectionSlot >= 0) {
      favorite.sectionSlot = value.sectionSlot;
    }

    return favorite;
  }

  function normalizeFavoriteArray(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (favorite) => favorite && favorite.type !== "folder" && favorite.url,
      )
      .map(normalizeFavorite)
      .filter(Boolean);
  }

  function normalizeFavoriteSection(value, index = 0) {
    if (!value || typeof value !== "object") return null;
    const rawId =
      typeof value.id === "string" && value.id ? value.id : `section-${index}`;
    const id = /^[a-zA-Z0-9:_-]+$/.test(rawId) ? rawId : `section-${index}`;
    const name =
      typeof value.name === "string" && value.name.trim()
        ? value.name.trim()
        : "Favorites";
    return {
      id,
      name,
      order:
        typeof value.order === "number" && value.order >= 0
          ? value.order
          : index,
      collapsed: !!value.collapsed,
    };
  }

  function normalizeFavoriteSections(value) {
    const raw = Array.isArray(value) ? value : [];
    const sections = raw
      .map(normalizeFavoriteSection)
      .filter(Boolean)
      .filter(
        (section, index, all) =>
          all.findIndex((s) => s.id === section.id) === index,
      )
      .sort((a, b) => a.order - b.order);

    if (!sections.some((section) => section.id === "default")) {
      sections.unshift({
        id: "default",
        name: "Favorites",
        order: 0,
        collapsed: false,
      });
    }

    return sections.map((section, index) => ({ ...section, order: index }));
  }

  function normalizeDailyTask(value) {
    if (!value || typeof value !== "object") return null;

    const title = typeof value.title === "string" ? value.title.trim() : "";
    const date = typeof value.date === "string" ? value.date.trim() : "";

    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

    return {
      id:
        typeof value.id === "string" && value.id
          ? value.id
          : `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      tag:
        typeof value.tag === "string" && value.tag.trim()
          ? value.tag.trim()
          : "Work",
      date,
      done: !!value.done,
      createdAt:
        typeof value.createdAt === "string" && value.createdAt
          ? value.createdAt
          : new Date().toISOString(),
      updatedAt:
        typeof value.updatedAt === "string" && value.updatedAt
          ? value.updatedAt
          : new Date().toISOString(),
    };
  }

  function normalizeDailyTasks(value) {
    if (!Array.isArray(value)) return [];
    return value.map(normalizeDailyTask).filter(Boolean);
  }

  async function getFavorites() {
    const data = await chrome.storage.local.get(LOCAL_KEYS.favorites);
    return normalizeFavoriteArray(data[LOCAL_KEYS.favorites]);
  }

  async function getFavoriteSections() {
    const data = await chrome.storage.local.get(LOCAL_KEYS.favoriteSections);
    return normalizeFavoriteSections(data[LOCAL_KEYS.favoriteSections]);
  }

  async function getDailyTasks() {
    const data = await chrome.storage.local.get(LOCAL_KEYS.dailyTasks);
    return normalizeDailyTasks(data[LOCAL_KEYS.dailyTasks]);
  }

  async function getLang() {
    const data = await chrome.storage.local.get(LOCAL_KEYS.lang);
    return isLang(data[LOCAL_KEYS.lang]) ? data[LOCAL_KEYS.lang] : null;
  }

  async function getTheme() {
    const data = await chrome.storage.local.get(LOCAL_KEYS.theme);
    return isTheme(data[LOCAL_KEYS.theme]) ? data[LOCAL_KEYS.theme] : null;
  }

  async function setFavorites(favorites, options = {}) {
    const touch = options.touch !== false;
    const normalized = normalizeFavoriteArray(favorites);
    const payload = { [LOCAL_KEYS.favorites]: normalized };
    if (touch) payload[META_KEYS.favorites] = Date.now();
    await chrome.storage.local.set(payload);
    return normalized;
  }

  async function setFavoriteSections(sections, options = {}) {
    const touch = options.touch !== false;
    const normalized = normalizeFavoriteSections(sections);
    const payload = { [LOCAL_KEYS.favoriteSections]: normalized };
    if (touch) payload[META_KEYS.favoriteSections] = Date.now();
    await chrome.storage.local.set(payload);
    return normalized;
  }

  async function setDailyTasks(tasks, options = {}) {
    const touch = options.touch !== false;
    const normalized = normalizeDailyTasks(tasks);
    const payload = { [LOCAL_KEYS.dailyTasks]: normalized };
    if (touch) payload[META_KEYS.dailyTasks] = Date.now();
    await chrome.storage.local.set(payload);
    return normalized;
  }

  async function setLang(lang, options = {}) {
    if (!isLang(lang)) return false;
    const touch = options.touch !== false;
    const payload = { [LOCAL_KEYS.lang]: lang };
    if (touch) payload[META_KEYS.lang] = Date.now();
    await chrome.storage.local.set(payload);
    return true;
  }

  async function setTheme(theme, options = {}) {
    if (!isTheme(theme)) return false;
    const touch = options.touch !== false;
    const payload = { [LOCAL_KEYS.theme]: theme };
    if (touch) payload[META_KEYS.theme] = Date.now();
    await chrome.storage.local.set(payload);
    return true;
  }

  async function cleanupLegacySyncData() {
    if (!chrome.storage || !chrome.storage.sync) return false;

    try {
      const localData = await chrome.storage.local.get(LEGACY_SYNC_CLEANED_KEY);
      if (localData[LEGACY_SYNC_CLEANED_KEY]) return false;

      const syncData = await chrome.storage.sync.get(null);
      const staleKeys = Object.keys(syncData || {}).filter((key) => {
        return (
          LEGACY_SYNC_KEYS.includes(key) ||
          key.startsWith(LEGACY_SYNC_FAVORITE_PREFIX)
        );
      });

      if (staleKeys.length > 0) {
        await chrome.storage.sync.remove(staleKeys);
      }
      await chrome.storage.local.set({ [LEGACY_SYNC_CLEANED_KEY]: Date.now() });
      return staleKeys.length > 0;
    } catch (error) {
      console.warn("[wolfy] legacy sync cleanup failed:", error);
      return false;
    }
  }

  async function getSavedSessions() {
    const data = await chrome.storage.local.get(LOCAL_KEYS.savedSessions);
    return data[LOCAL_KEYS.savedSessions] || [];
  }

  async function setSavedSessions(sessions) {
    await chrome.storage.local.set({
      [LOCAL_KEYS.savedSessions]: sessions || [],
    });
  }

  async function getTabStatuses() {
    const data = await chrome.storage.local.get(LOCAL_KEYS.tabStatuses);
    return data[LOCAL_KEYS.tabStatuses] || {};
  }

  async function setTabStatuses(statuses) {
    await chrome.storage.local.set({
      [LOCAL_KEYS.tabStatuses]: statuses || {},
    });
  }

  root.TabHomeStorage = Object.freeze({
    LOCAL_KEYS,
    META_KEYS,
    cleanupLegacySyncData,
    getDailyTasks,
    getFavorites,
    getFavoriteSections,
    getLang,
    getSavedSessions,
    getTabStatuses,
    getTheme,
    setDailyTasks,
    setFavorites,
    setFavoriteSections,
    setLang,
    setSavedSessions,
    setTabStatuses,
    setTheme,
  });
})(typeof self !== "undefined" ? self : window);
