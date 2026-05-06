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
      : "lavender";
  } catch {
    document.documentElement.dataset.theme = "lavender";
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
