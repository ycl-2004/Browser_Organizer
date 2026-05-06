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
  const out = {
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
  if (task.repeatGroupId) out.repeatGroupId = task.repeatGroupId;
  if (task.overdue) out.overdue = true;
  if (task.originalDate) out.originalDate = task.originalDate;
  return out;
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
