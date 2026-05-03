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
  'use strict';

  const LOCAL_KEYS = {
    favorites: 'favorites',
    favoriteSections: 'favoriteSections',
    lang: 'lang',
    theme: 'theme',
  };

  const META_KEYS = {
    favorites: '__tabHomeFavoritesUpdatedAt',
    favoriteSections: '__tabHomeFavoriteSectionsUpdatedAt',
    lang: '__tabHomeLangUpdatedAt',
    theme: '__tabHomeThemeUpdatedAt',
  };

  const LEGACY_SYNC_KEYS = [
    '__tabHomeSyncFavoritesIndex',
    '__tabHomeSyncFavoriteSections',
    '__tabHomeSyncLang',
    '__tabHomeSyncTheme',
  ];
  const LEGACY_SYNC_FAVORITE_PREFIX = '__tabHomeSyncFavorite__';
  const LEGACY_SYNC_CLEANED_KEY = '__tabHomeLegacySyncCleanedAt';

  function isLang(value) {
    return value === 'en' || value === 'zh';
  }

  function isTheme(value) {
    return value === 'light' || value === 'dark';
  }

  function normalizeFavorite(value) {
    if (!value || typeof value !== 'object' || !value.url) return null;

    const url = String(value.url);
    const favorite = {
      id: typeof value.id === 'string' && value.id ? value.id : `fav:${url}`,
      url,
      title: typeof value.title === 'string' && value.title ? value.title : url,
      addedAt: typeof value.addedAt === 'string' && value.addedAt ? value.addedAt : new Date(0).toISOString(),
      slot: typeof value.slot === 'number' && value.slot >= 0 ? value.slot : 0,
    };

    if (typeof value.customLogo === 'string' && value.customLogo) {
      favorite.customLogo = value.customLogo;
    }
    if (typeof value.iconUrl === 'string' && value.iconUrl) {
      favorite.iconUrl = value.iconUrl;
    }
    if (typeof value.sectionId === 'string' && value.sectionId) {
      favorite.sectionId = value.sectionId;
    }
    if (typeof value.sectionSlot === 'number' && value.sectionSlot >= 0) {
      favorite.sectionSlot = value.sectionSlot;
    }

    return favorite;
  }

  function normalizeFavoriteArray(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter((favorite) => favorite && favorite.type !== 'folder' && favorite.url)
      .map(normalizeFavorite)
      .filter(Boolean);
  }

  function normalizeFavoriteSection(value, index = 0) {
    if (!value || typeof value !== 'object') return null;
    const rawId = typeof value.id === 'string' && value.id ? value.id : `section-${index}`;
    const id = /^[a-zA-Z0-9:_-]+$/.test(rawId) ? rawId : `section-${index}`;
    const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : 'Favorites';
    return {
      id,
      name,
      order: typeof value.order === 'number' && value.order >= 0 ? value.order : index,
      collapsed: !!value.collapsed,
    };
  }

  function normalizeFavoriteSections(value) {
    const raw = Array.isArray(value) ? value : [];
    const sections = raw
      .map(normalizeFavoriteSection)
      .filter(Boolean)
      .filter((section, index, all) => all.findIndex(s => s.id === section.id) === index)
      .sort((a, b) => a.order - b.order);

    if (!sections.some(section => section.id === 'default')) {
      sections.unshift({ id: 'default', name: 'Favorites', order: 0, collapsed: false });
    }

    return sections.map((section, index) => ({ ...section, order: index }));
  }

  async function getFavorites() {
    const data = await chrome.storage.local.get(LOCAL_KEYS.favorites);
    return normalizeFavoriteArray(data[LOCAL_KEYS.favorites]);
  }

  async function getFavoriteSections() {
    const data = await chrome.storage.local.get(LOCAL_KEYS.favoriteSections);
    return normalizeFavoriteSections(data[LOCAL_KEYS.favoriteSections]);
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
        return LEGACY_SYNC_KEYS.includes(key) || key.startsWith(LEGACY_SYNC_FAVORITE_PREFIX);
      });

      if (staleKeys.length > 0) {
        await chrome.storage.sync.remove(staleKeys);
      }
      await chrome.storage.local.set({ [LEGACY_SYNC_CLEANED_KEY]: Date.now() });
      return staleKeys.length > 0;
    } catch (error) {
      console.warn('[wolfy] legacy sync cleanup failed:', error);
      return false;
    }
  }

  root.TabHomeStorage = Object.freeze({
    LOCAL_KEYS,
    META_KEYS,
    cleanupLegacySyncData,
    getFavorites,
    getFavoriteSections,
    getLang,
    getTheme,
    setFavorites,
    setFavoriteSections,
    setLang,
    setTheme,
  });
})(typeof self !== 'undefined' ? self : window);
